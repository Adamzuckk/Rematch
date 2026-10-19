"""On-demand decision analysis from match events and frames.

Separates calculation from API handlers. No LLM / Foundry dependency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.event import MatchEvent
from app.models.frame import MatchFrame
from app.models.match import Match
from app.models.player import Player
from app.services.decision.evidence import (
    Claim,
    EvidenceCatalog,
    EvidenceReference,
    verify_claims,
)
from app.services.decision.geometry import Point
from app.services.decision.scoring import (
    SCORING_METHOD_ID,
    SCORING_METHOD_VERSION,
    ActionScore,
    nearest_opponent_distance,
    rank_actions,
    score_path_action,
    score_shot_action,
    unavailable_action,
)

ANALYZABLE_TYPES = frozenset({"pass", "shot", "carry"})

ConfidenceLevel = Literal["high", "medium", "low", "none"]
CompletenessLevel = Literal["complete", "partial", "insufficient"]


class DecisionEngineError(Exception):
    """Base error for decision analysis."""


class MatchNotFoundError(DecisionEngineError):
    def __init__(self, match_id: str) -> None:
        self.match_id = match_id
        super().__init__(f"Match not found: {match_id}")


class EventNotFoundError(DecisionEngineError):
    def __init__(self, match_id: str, event_id: str) -> None:
        self.match_id = match_id
        self.event_id = event_id
        super().__init__(f"Event not found: {event_id} in match {match_id}")


class InsufficientEvidenceError(DecisionEngineError):
    def __init__(self, match_id: str, event_id: str, reason: str) -> None:
        self.match_id = match_id
        self.event_id = event_id
        self.reason = reason
        super().__init__(reason)


@dataclass
class DataCompleteness:
    level: CompletenessLevel
    has_coordinates: bool
    has_aligned_frame: bool
    teammate_positions_in_frame: int
    opponent_positions_in_frame: int
    alternative_count: int
    missing: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class DecisionAnalysisResult:
    match_id: str
    event_id: str
    event_type: str
    team_id: str | None
    player_id: str | None
    is_home_team: bool
    scoring_method_id: str
    scoring_method_version: str
    scoring_assumptions: list[str]
    observed: ActionScore
    alternatives: list[ActionScore]
    ranking: list[dict[str, Any]]
    claims: list[Claim]
    completeness: DataCompleteness
    confidence: ConfidenceLevel
    limitations: list[str]
    context: dict[str, Any]
    evidence_catalog: EvidenceCatalog
    provenance: str


def _point_from_xy(x: float | None, y: float | None) -> Point | None:
    if x is None or y is None:
        return None
    return Point(float(x), float(y))


def _event_origin(event: MatchEvent) -> Point | None:
    if event.type in ("pass", "carry"):
        return _point_from_xy(event.start_x, event.start_y)
    if event.type == "shot":
        return _point_from_xy(event.location_x, event.location_y)
    return None


def _load_aligned_frame(db: Session, event: MatchEvent) -> MatchFrame | None:
    stmt = (
        select(MatchFrame)
        .where(
            MatchFrame.match_id == event.match_id,
            MatchFrame.event_id == event.id,
        )
        .options(selectinload(MatchFrame.players))
        .order_by(MatchFrame.id)
    )
    return db.scalars(stmt).first()


def _player_name(db: Session, player_id: str | None) -> str | None:
    if not player_id:
        return None
    player = db.get(Player, player_id)
    return player.name if player else None


def _score_observed(event: MatchEvent, *, is_home: bool) -> ActionScore:
    if event.type == "pass":
        start = _point_from_xy(event.start_x, event.start_y)
        end = _point_from_xy(event.end_x, event.end_y)
        if start is None or end is None:
            return unavailable_action(
                action_id=f"observed:{event.id}",
                kind="observed_pass",
                label="Observed pass",
                reason="Pass requires start and end coordinates",
                target_player_id=event.receiver_id,
            )
        return score_path_action(
            action_id=f"observed:{event.id}",
            kind="observed_pass",
            label="Observed pass",
            start=start,
            end=end,
            is_home=is_home,
            target_player_id=event.receiver_id,
        )

    if event.type == "carry":
        start = _point_from_xy(event.start_x, event.start_y)
        end = _point_from_xy(event.end_x, event.end_y)
        if start is None or end is None:
            return unavailable_action(
                action_id=f"observed:{event.id}",
                kind="observed_carry",
                label="Observed carry",
                reason="Carry requires start and end coordinates",
            )
        return score_path_action(
            action_id=f"observed:{event.id}",
            kind="observed_carry",
            label="Observed carry",
            start=start,
            end=end,
            is_home=is_home,
        )

    if event.type == "shot":
        location = _point_from_xy(event.location_x, event.location_y)
        if location is None:
            return unavailable_action(
                action_id=f"observed:{event.id}",
                kind="observed_shot",
                label="Observed shot",
                reason="Shot requires a location coordinate",
            )
        return score_shot_action(
            action_id=f"observed:{event.id}",
            label="Observed shot",
            location=location,
            is_home=is_home,
        )

    return unavailable_action(
        action_id=f"observed:{event.id}",
        kind="observed_pass",
        label=f"Observed {event.type}",
        reason=f"Event type {event.type!r} is not analyzable",
    )


def _build_alternatives(
    *,
    event: MatchEvent,
    origin: Point,
    is_home: bool,
    frame: MatchFrame | None,
    team_id: str | None,
) -> list[ActionScore]:
    """Hypothetical passes to teammates visible in the aligned frame.

    Only constructed when frame player positions exist. Does not invent lanes
    or players absent from the frame.
    """
    if frame is None or not team_id:
        return []

    alternatives: list[ActionScore] = []
    for pos in sorted(frame.players, key=lambda p: p.player_id):
        if pos.team_id != team_id:
            continue
        if event.player_id and pos.player_id == event.player_id:
            continue
        if event.type == "pass" and event.receiver_id and pos.player_id == event.receiver_id:
            # Actual receiver is the observed action, not an alternative.
            continue

        end = Point(pos.x, pos.y)
        alt_id = f"alt-pass:{event.id}:{pos.player_id}"
        alternatives.append(
            score_path_action(
                action_id=alt_id,
                kind="hypothetical_pass",
                label=f"Hypothetical pass to {pos.player_id}",
                start=origin,
                end=end,
                is_home=is_home,
                target_player_id=pos.player_id,
            )
        )
    return alternatives


def _register_calculations(
    actions: list[ActionScore],
) -> tuple[frozenset[str], dict[str, dict[str, Any]]]:
    ids: set[str] = set()
    payloads: dict[str, dict[str, Any]] = {}
    for action in actions:
        for metric in action.metrics:
            if metric.status != "available" or metric.value is None:
                continue
            calc_id = f"calc:{action.action_id}:{metric.name}"
            ids.add(calc_id)
            payloads[calc_id] = {
                "id": calc_id,
                "action_id": action.action_id,
                "metric": metric.name,
                "value": metric.value,
                "unit": metric.unit,
                "formula": metric.formula,
            }
    return frozenset(ids), payloads


def _build_claims(
    *,
    event: MatchEvent,
    observed: ActionScore,
    alternatives: list[ActionScore],
    ranking: list[tuple[int | None, ActionScore]],
    frame: MatchFrame | None,
    calc_payloads: dict[str, dict[str, Any]],
    context_metrics: dict[str, Any],
) -> list[Claim]:
    claims: list[Claim] = []
    match_id = event.match_id

    # Claim: observed action score
    if observed.composite_score is not None:
        calc_id = f"calc:{observed.action_id}:composite_score"
        refs = [
            EvidenceReference(
                kind="event",
                id=event.id,
                match_id=match_id,
                detail="Source event for observed action geometry",
            ),
            EvidenceReference(
                kind="calculation",
                id=calc_id,
                match_id=match_id,
                detail=COMPOSITE_DETAIL,
            ),
        ]
        claims.append(
            Claim(
                id=f"claim-observed-score:{event.id}",
                statement=(
                    f"Observed {event.type} has composite geometric score "
                    f"{observed.composite_score:.4f} under {SCORING_METHOD_ID}"
                ),
                evidence=refs,
                calculation=calc_payloads.get(calc_id),
                limitations=list(observed.limitations),
            )
        )
    else:
        claims.append(
            Claim(
                id=f"claim-observed-score:{event.id}",
                statement=f"Observed {event.type} composite score is unavailable",
                evidence=[],
                limitations=list(observed.limitations),
            )
        )

    # Claim: frame-backed alternatives
    if frame is not None:
        for alt in alternatives:
            if alt.composite_score is None:
                continue
            calc_id = f"calc:{alt.action_id}:composite_score"
            pos_id = _position_id_for_player(frame, alt.target_player_id)
            refs = [
                EvidenceReference(
                    kind="frame",
                    id=frame.id,
                    match_id=match_id,
                    detail="Aligned frame supplying teammate positions",
                ),
                EvidenceReference(
                    kind="calculation",
                    id=calc_id,
                    match_id=match_id,
                    detail=COMPOSITE_DETAIL,
                ),
            ]
            if pos_id:
                refs.append(
                    EvidenceReference(
                        kind="player_position",
                        id=pos_id,
                        match_id=match_id,
                        detail=f"Teammate position for {alt.target_player_id}",
                    )
                )
            claims.append(
                Claim(
                    id=f"claim-alt-score:{alt.action_id}",
                    statement=(
                        f"Hypothetical pass to {alt.target_player_id} has "
                        f"composite score {alt.composite_score:.4f}"
                    ),
                    evidence=refs,
                    calculation=calc_payloads.get(calc_id),
                    limitations=[
                        "Hypothetical path uses the frame teammate position as "
                        "end point; no passing-lane or pressure model is applied."
                    ],
                )
            )

    # Claim: ranking / best option — only when ≥2 rankable actions
    rankable = [(r, a) for r, a in ranking if r is not None]
    if len(rankable) >= 2:
        best_rank, best = min(rankable, key=lambda pair: pair[0] or 999)
        calc_id = f"calc:{best.action_id}:composite_score"
        refs = [
            EvidenceReference(
                kind="event",
                id=event.id,
                match_id=match_id,
                detail="Decision event",
            ),
            EvidenceReference(
                kind="calculation",
                id=calc_id,
                match_id=match_id,
                detail="Top-ranked composite under geometric_progression_v1",
            ),
        ]
        if frame is not None:
            refs.append(
                EvidenceReference(
                    kind="frame",
                    id=frame.id,
                    match_id=match_id,
                    detail="Frame used for alternative endpoints",
                )
            )
        claims.append(
            Claim(
                id=f"claim-ranking:{event.id}",
                statement=(
                    f"Under {SCORING_METHOD_ID}, {best.label} ranks #{best_rank} "
                    f"with composite {best.composite_score:.4f}. This is a geometric "
                    f"ranking, not an objective proof the action was best in play."
                ),
                evidence=refs,
                calculation=calc_payloads.get(calc_id),
                limitations=[
                    "Ranking uses only evaluable actions with available geometry.",
                    "Sparse frames omit most players; missing options are not ranked.",
                ],
            )
        )
    else:
        claims.append(
            Claim(
                id=f"claim-ranking:{event.id}",
                statement=(
                    "No comparative ranking is available — fewer than two "
                    "rankable actions could be scored from the available data"
                ),
                evidence=[
                    EvidenceReference(
                        kind="event",
                        id=event.id,
                        match_id=match_id,
                        detail="Decision event",
                    )
                ],
                limitations=["Comparative ranking requires at least two scored actions."],
            )
        )

    # Claim: nearest opponent distance (context only)
    nearest = context_metrics.get("nearest_opponent_distance")
    if nearest is not None and frame is not None:
        claims.append(
            Claim(
                id=f"claim-nearest-opponent:{event.id}",
                statement=(
                    f"Nearest opponent in the aligned frame is "
                    f"{nearest:.4f} pitch-percent units from the action origin"
                ),
                evidence=[
                    EvidenceReference(
                        kind="frame",
                        id=frame.id,
                        match_id=match_id,
                        detail="Opponent positions from aligned frame",
                    ),
                    EvidenceReference(
                        kind="calculation",
                        id=f"calc:context:{event.id}:nearest_opponent_distance",
                        match_id=match_id,
                        detail="min distance to opponent frame markers",
                    ),
                ],
                calculation={
                    "id": f"calc:context:{event.id}:nearest_opponent_distance",
                    "value": nearest,
                    "unit": "pitch_percent",
                    "formula": "min(distance(origin, opponent_i))",
                },
                limitations=[
                    "Based only on opponents present in the sparse frame, not a full XI."
                ],
            )
        )

    # Exhaustiveness claim — frame may support some alternatives, not all teammates.
    if frame is not None:
        claims.append(
            Claim(
                id=f"claim-exhaustive-alternatives:{event.id}",
                statement=(
                    "Every teammate passing option at this moment was evaluated"
                ),
                evidence=[
                    EvidenceReference(
                        kind="frame",
                        id=frame.id,
                        match_id=match_id,
                        detail="Only players present in this sparse frame were scored",
                    )
                ],
                limitations=[
                    "Aligned frames are sparse samples, not full tracking; "
                    "absent teammates cannot be evaluated."
                ],
                require_full_support=True,
            )
        )

    # Explicit unsupported claim when geometry for lanes/marking is absent.
    if frame is None:
        claims.append(
            Claim(
                id=f"claim-passing-lanes:{event.id}",
                statement="Open passing lanes were available to unmarked teammates",
                evidence=[],
                limitations=[
                    "No aligned frame; passing lanes and marking cannot be established."
                ],
            )
        )

    return claims


COMPOSITE_DETAIL = "composite = progressive_distance + goal_proximity_gain"


def _position_id_for_player(frame: MatchFrame, player_id: str | None) -> str | None:
    if not player_id:
        return None
    for pos in frame.players:
        if pos.player_id == player_id:
            return pos.id
    return None


def _completeness(
    *,
    event: MatchEvent,
    observed: ActionScore,
    frame: MatchFrame | None,
    alternatives: list[ActionScore],
    team_id: str | None,
) -> DataCompleteness:
    has_coords = observed.rankable
    has_frame = frame is not None
    teammates = 0
    opponents = 0
    missing: list[str] = []
    notes: list[str] = []

    if not has_coords:
        missing.append("event_coordinates")
    if not has_frame:
        missing.append("aligned_frame")
        notes.append("No MatchFrame with event_id equal to this event")
    elif team_id:
        for pos in frame.players:  # type: ignore[union-attr]
            if pos.team_id == team_id:
                teammates += 1
            else:
                opponents += 1
        if teammates <= 1:
            notes.append(
                "Aligned frame has few or no other teammates; alternatives limited"
            )

    if event.type == "pass" and not event.receiver_id:
        missing.append("receiver_id")

    alt_count = len([a for a in alternatives if a.rankable])

    if not has_coords:
        level: CompletenessLevel = "insufficient"
    elif has_frame and alt_count > 0:
        level = "complete"
    else:
        level = "partial"

    return DataCompleteness(
        level=level,
        has_coordinates=has_coords,
        has_aligned_frame=has_frame,
        teammate_positions_in_frame=teammates,
        opponent_positions_in_frame=opponents,
        alternative_count=alt_count,
        missing=missing,
        notes=notes,
    )


def _confidence(completeness: DataCompleteness, observed: ActionScore) -> ConfidenceLevel:
    if not observed.rankable:
        return "none"
    if completeness.level == "complete":
        return "high"
    if completeness.level == "partial" and completeness.has_coordinates:
        return "medium" if completeness.has_aligned_frame else "low"
    return "none"


def analyze_decision(
    db: Session,
    match_id: str,
    event_id: str,
) -> DecisionAnalysisResult:
    """Build a full decision analysis for a match event (on-demand)."""
    match = db.get(Match, match_id)
    if match is None:
        raise MatchNotFoundError(match_id)

    event = db.get(MatchEvent, event_id)
    if event is None or event.match_id != match_id:
        raise EventNotFoundError(match_id, event_id)

    if event.type not in ANALYZABLE_TYPES:
        raise InsufficientEvidenceError(
            match_id,
            event_id,
            (
                f"Event type {event.type!r} is not a decision candidate. "
                f"Supported types: {sorted(ANALYZABLE_TYPES)}"
            ),
        )

    is_home = event.team_id == match.home_team_id if event.team_id else True
    if event.team_id and event.team_id not in (match.home_team_id, match.away_team_id):
        raise InsufficientEvidenceError(
            match_id,
            event_id,
            f"Event team_id {event.team_id!r} is not a participant in this match",
        )

    observed = _score_observed(event, is_home=is_home)
    if not observed.rankable:
        raise InsufficientEvidenceError(
            match_id,
            event_id,
            observed.limitations[0]
            if observed.limitations
            else "Insufficient coordinates to score the observed action",
        )

    origin = _event_origin(event)
    assert origin is not None  # guaranteed when rankable

    frame = _load_aligned_frame(db, event)
    alternatives = _build_alternatives(
        event=event,
        origin=origin,
        is_home=is_home,
        frame=frame,
        team_id=event.team_id,
    )

    all_actions = [observed, *alternatives]
    ranked = rank_actions(all_actions)
    calc_ids, calc_payloads = _register_calculations(all_actions)

    # Context: nearest opponent from frame
    context: dict[str, Any] = {
        "playerName": _player_name(db, event.player_id),
        "receiverName": _player_name(db, event.receiver_id),
        "outcome": event.outcome,
        "minute": event.minute,
        "frameId": frame.id if frame else None,
    }
    context_calc_ids: set[str] = set()
    if frame is not None and event.team_id:
        opponents = [
            Point(p.x, p.y) for p in frame.players if p.team_id != event.team_id
        ]
        nearest = nearest_opponent_distance(origin, opponents)
        if nearest is not None:
            context["nearest_opponent_distance"] = nearest
            cid = f"calc:context:{event.id}:nearest_opponent_distance"
            context_calc_ids.add(cid)
            calc_payloads[cid] = {
                "id": cid,
                "value": nearest,
                "unit": "pitch_percent",
                "formula": "min(distance(origin, opponent_i))",
            }

    calc_ids = frozenset(set(calc_ids) | context_calc_ids)

    event_ids = frozenset(
        db.scalars(select(MatchEvent.id).where(MatchEvent.match_id == match_id)).all()
    )
    frames = (
        db.scalars(
            select(MatchFrame)
            .where(MatchFrame.match_id == match_id)
            .options(selectinload(MatchFrame.players))
        )
        .unique()
        .all()
    )
    frame_ids = frozenset(f.id for f in frames)
    frame_event_links = {f.id: f.event_id for f in frames}
    position_ids: set[str] = set()
    for f in frames:
        for p in f.players:
            position_ids.add(p.id)

    catalog = EvidenceCatalog(
        match_id=match_id,
        event_ids=event_ids,
        frame_ids=frame_ids,
        frame_event_links=frame_event_links,
        player_position_ids=frozenset(position_ids),
        calculation_ids=calc_ids,
        calculation_payloads=calc_payloads,
    )

    claims = _build_claims(
        event=event,
        observed=observed,
        alternatives=alternatives,
        ranking=ranked,
        frame=frame,
        calc_payloads=calc_payloads,
        context_metrics=context,
    )
    verified = verify_claims(claims, catalog)

    completeness = _completeness(
        event=event,
        observed=observed,
        frame=frame,
        alternatives=alternatives,
        team_id=event.team_id,
    )
    confidence = _confidence(completeness, observed)

    limitations = [
        "Synthetic demo data — not official match statistics.",
        f"Scoring method {SCORING_METHOD_ID} uses geometric progression only; "
        "it is not xG, probability, or an objective quality judgment.",
        "Alternatives exist only for teammates present in an aligned frame.",
        "Sparse frames omit most players; absent options are not evaluated.",
    ]
    limitations.extend(observed.limitations)
    limitations.extend(completeness.notes)

    ranking_payload = [
        {
            "rank": rank,
            "actionId": action.action_id,
            "kind": action.kind,
            "label": action.label,
            "compositeScore": action.composite_score,
            "targetPlayerId": action.target_player_id,
            "rankable": action.rankable,
        }
        for rank, action in ranked
    ]

    assumptions = [
        "Home team attacks toward x=100; away toward x=0.",
        "Composite = progressive_distance + goal_proximity_gain (pitch-percent units).",
        "Shots are scored as a virtual path from location to opponent goal centre.",
        "Hypothetical passes end at teammate frame positions; no lane clearance model.",
        "Outcome fields (complete/goal/…) are reported as context, not mixed into the score.",
    ]

    return DecisionAnalysisResult(
        match_id=match_id,
        event_id=event_id,
        event_type=event.type,
        team_id=event.team_id,
        player_id=event.player_id,
        is_home_team=is_home,
        scoring_method_id=SCORING_METHOD_ID,
        scoring_method_version=SCORING_METHOD_VERSION,
        scoring_assumptions=assumptions,
        observed=observed,
        alternatives=alternatives,
        ranking=ranking_payload,
        claims=verified,
        completeness=completeness,
        confidence=confidence,
        limitations=list(dict.fromkeys(limitations)),
        context=context,
        evidence_catalog=catalog,
        provenance=event.provenance,
    )


def get_evidence_bundle(
    db: Session,
    match_id: str,
    event_id: str,
) -> tuple[DecisionAnalysisResult, list[Claim]]:
    """Return analysis plus its verified claims for the evidence endpoint."""
    result = analyze_decision(db, match_id, event_id)
    return result, result.claims
