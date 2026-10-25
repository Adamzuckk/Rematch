"""Evidence-grounded event briefing for every supported match event type.

Builds a deterministic template briefing from verified match evidence, then
optionally enriches bilingual wording via a server-side LLM when configured.
Never invents players, outcomes, metrics, or causal links. Distinguishes
verified facts, calculated metrics, and hypothetical alternatives.
``llmConnected`` is true only after a successful, validated provider call.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.event import MatchEvent
from app.models.match import Match
from app.models.player import Player
from app.models.team import Team
from app.schemas.decision import DecisionAnalysisSchema
from app.schemas.event_intelligence import (
    EvidenceStatement,
    EventIntelligenceSchema,
)
from app.schemas.narrator import LocalizedNarrative
from app.services.decision import (
    EventNotFoundError,
    InsufficientEvidenceError,
    MatchNotFoundError,
    analyze_decision,
    analysis_to_schema,
)
from app.services.decision.engine import ANALYZABLE_TYPES
from app.services.llm import enrich_event_intelligence

ANALYSIS_METHOD = "deterministic_event_intelligence_v1"

_EVENT_LABELS: dict[str, tuple[str, str]] = {
    "pass": ("pass", "تمريرة"),
    "shot": ("shot", "تسديدة"),
    "carry": ("carry", "حمل الكرة"),
    "tackle": ("tackle", "تدخل"),
    "pressure": ("pressure", "ضغط"),
    "possession_change": ("possession change", "تغيير الاستحواذ"),
    "foul": ("foul", "خطأ"),
    "yellow_card": ("yellow card", "بطاقة صفراء"),
    "red_card": ("red card", "بطاقة حمراء"),
    "substitution": ("substitution", "تبديل"),
    "offside": ("offside", "تسلل"),
    "counterattack": ("counterattack", "هجمة مرتدة"),
    "reverse_attack": ("reverse attack", "هجوم معاكس"),
    "counter_press": ("counter-press", "ضغط مرتد"),
}

_OUTCOME_LABELS: dict[str, dict[str, tuple[str, str]]] = {
    "pass": {
        "complete": ("complete", "مكتملة"),
        "incomplete": ("incomplete", "غير مكتملة"),
        "unknown": ("unknown", "غير محددة"),
    },
    "shot": {
        "goal": ("goal", "هدف"),
        "saved": ("saved", "تم التصدي لها"),
        "blocked": ("blocked", "تم صدها"),
        "off_target": ("off target", "خارج المرمى"),
        "unknown": ("unknown", "غير محددة"),
    },
    "tackle": {
        "won": ("won", "ناجح"),
        "lost": ("lost", "غير ناجح"),
        "unknown": ("unknown", "غير محددة"),
    },
    "foul": {
        "conceded": ("conceded", "محتسب ضد"),
        "won": ("won", "محتسب لصالح"),
        "unknown": ("unknown", "غير محددة"),
    },
    "offside": {
        "flagged": ("flagged", "محتسب"),
        "unknown": ("unknown", "غير محددة"),
    },
}

_GOAL_TYPE_LABELS: dict[str, tuple[str, str]] = {
    "open_play": ("open play", "لعب مفتوح"),
    "penalty": ("penalty", "ركلة جزاء"),
    "free_kick": ("free kick", "ركلة حرة"),
    "own_goal": ("own goal", "هدف عكسي"),
}


def _player_name(db: Session, player_id: str | None) -> str | None:
    if not player_id:
        return None
    player = db.get(Player, player_id)
    return player.name if player else None


def _team_name(db: Session, team_id: str | None) -> str | None:
    if not team_id:
        return None
    team = db.get(Team, team_id)
    return team.name if team else None


def _label(table: dict[str, tuple[str, str]], key: str | None, *, arabic: bool) -> str | None:
    if not key:
        return None
    pair = table.get(key)
    if pair is None:
        return None
    return pair[1 if arabic else 0]


def _outcome_label(event_type: str, outcome: str | None, *, arabic: bool) -> str | None:
    if not outcome:
        return None
    return _label(_OUTCOME_LABELS.get(event_type, {}), outcome, arabic=arabic)


def _stmt(tier: str, english: str, arabic: str) -> EvidenceStatement:
    return EvidenceStatement(tier=tier, english=english, arabic=arabic)  # type: ignore[arg-type]


def _build_statements(
    db: Session,
    match: Match,
    event: MatchEvent,
    analysis: DecisionAnalysisSchema | None,
) -> tuple[list[EvidenceStatement], list[str]]:
    statements: list[EvidenceStatement] = []
    missing: list[str] = []

    event_en = _label(_EVENT_LABELS, event.type, arabic=False) or event.type
    event_ar = _label(_EVENT_LABELS, event.type, arabic=True) or event.type
    player = _player_name(db, event.player_id)
    team = _team_name(db, event.team_id)
    minute = event.minute

    if minute is not None:
        statements.append(
            _stmt(
                "fact",
                f"At minute {minute:g}', the match log records a {event_en}.",
                f"في الدقيقة {minute:g}' يسجّل سجل المباراة حدث {event_ar}.",
            )
        )
    else:
        missing.append("minute")
        statements.append(
            _stmt(
                "fact",
                f"The match log records a {event_en}; the minute is not recorded.",
                f"يسجّل سجل المباراة حدث {event_ar}؛ الدقيقة غير مسجّلة.",
            )
        )

    if player and team:
        statements.append(
            _stmt(
                "fact",
                f"Primary player on record: {player} ({team}).",
                f"اللاعب الأساسي المسجّل: {player} ({team}).",
            )
        )
    elif player:
        statements.append(
            _stmt(
                "fact",
                f"Primary player on record: {player}.",
                f"اللاعب الأساسي المسجّل: {player}.",
            )
        )
    else:
        missing.append("playerId")

    if team is None:
        missing.append("teamId")

    # Type-specific facts
    if event.type == "pass":
        receiver = _player_name(db, event.receiver_id)
        outcome = _outcome_label("pass", event.outcome, arabic=False)
        outcome_ar = _outcome_label("pass", event.outcome, arabic=True)
        if receiver:
            statements.append(
                _stmt(
                    "fact",
                    f"Intended or recorded receiver: {receiver}.",
                    f"المستلم المسجّل: {receiver}.",
                )
            )
        else:
            missing.append("receiverId")
        if outcome and outcome_ar:
            statements.append(
                _stmt(
                    "fact",
                    f"Recorded pass outcome: {outcome}.",
                    f"نتيجة التمريرة المسجّلة: {outcome_ar}.",
                )
            )
        else:
            missing.append("outcome")
        if event.start_x is not None and event.end_x is not None:
            statements.append(
                _stmt(
                    "fact",
                    (
                        f"Pass path on record from "
                        f"({event.start_x:.1f}, {event.start_y:.1f}) to "
                        f"({event.end_x:.1f}, {event.end_y:.1f}) in pitch percent."
                    ),
                    (
                        f"مسار التمريرة المسجّل من "
                        f"({event.start_x:.1f}, {event.start_y:.1f}) إلى "
                        f"({event.end_x:.1f}, {event.end_y:.1f}) بنسبة الملعب."
                    ),
                )
            )
        else:
            missing.append("pass coordinates")
        if event.detail == "key_pass":
            statements.append(
                _stmt(
                    "fact",
                    "Event detail marks this pass as a key pass in the seed log.",
                    "تفاصيل الحدث تصنّف هذه التمريرة كتمريرة مفتاحية في السجل.",
                )
            )
        if event.outcome == "incomplete":
            statements.append(
                _stmt(
                    "fact",
                    "The incomplete outcome means possession did not successfully transfer via this pass.",
                    "النتيجة غير المكتملة تعني أن الاستحواذ لم ينتقل بنجاح عبر هذه التمريرة.",
                )
            )

    elif event.type == "shot":
        outcome = _outcome_label("shot", event.outcome, arabic=False)
        outcome_ar = _outcome_label("shot", event.outcome, arabic=True)
        goal_type = _label(_GOAL_TYPE_LABELS, event.goal_type, arabic=False)
        goal_type_ar = _label(_GOAL_TYPE_LABELS, event.goal_type, arabic=True)
        assist = _player_name(db, event.assist_player_id)

        if outcome and outcome_ar:
            statements.append(
                _stmt(
                    "fact",
                    f"Recorded shot outcome: {outcome}.",
                    f"نتيجة التسديدة المسجّلة: {outcome_ar}.",
                )
            )
        else:
            missing.append("outcome")

        if event.outcome == "goal" and player:
            if event.goal_type == "own_goal":
                statements.append(
                    _stmt(
                        "fact",
                        f"Goal credited on record as an own goal involving {player}.",
                        f"الهدف مسجّل كهدف عكسي بمشاركة {player}.",
                    )
                )
            else:
                statements.append(
                    _stmt(
                        "fact",
                        f"Scorer on record: {player}.",
                        f"المسجّل على السجل: {player}.",
                    )
                )
            if assist:
                statements.append(
                    _stmt(
                        "fact",
                        f"Assist provider on record: {assist}.",
                        f"صانع الهدف المسجّل: {assist}.",
                    )
                )
            elif event.goal_type == "penalty":
                statements.append(
                    _stmt(
                        "fact",
                        "No assist is recorded for this penalty kick.",
                        "لا توجد صناعة هدف مسجّلة لركلة الجزاء هذه.",
                    )
                )
            else:
                missing.append("assistPlayerId")
                statements.append(
                    _stmt(
                        "missing",
                        "Assist provider is not present on this goal event record.",
                        "صانع الهدف غير موجود في سجل حدث الهدف هذا.",
                    )
                )

        if goal_type and goal_type_ar:
            statements.append(
                _stmt(
                    "fact",
                    f"Goal type on record: {goal_type}.",
                    f"نوع الهدف المسجّل: {goal_type_ar}.",
                )
            )

        if event.location_x is not None:
            statements.append(
                _stmt(
                    "fact",
                    (
                        f"Shot location on record: "
                        f"({event.location_x:.1f}, {event.location_y:.1f}) pitch percent."
                    ),
                    (
                        f"موقع التسديدة المسجّل: "
                        f"({event.location_x:.1f}, {event.location_y:.1f}) بنسبة الملعب."
                    ),
                )
            )
        else:
            missing.append("shot location")

        if event.outcome == "goal":
            statements.append(
                _stmt(
                    "fact",
                    "This shot contributed a goal according to the event outcome field.",
                    "هذه التسديدة ساهمت بهدف وفق حقل نتيجة الحدث.",
                )
            )
        elif event.outcome in ("saved", "blocked", "off_target"):
            statements.append(
                _stmt(
                    "fact",
                    "This shot did not become a goal according to the recorded outcome.",
                    "هذه التسديدة لم تتحول إلى هدف وفق النتيجة المسجّلة.",
                )
            )

    elif event.type == "carry":
        if event.start_x is not None and event.end_x is not None:
            statements.append(
                _stmt(
                    "fact",
                    (
                        f"Carry path on record from "
                        f"({event.start_x:.1f}, {event.start_y:.1f}) to "
                        f"({event.end_x:.1f}, {event.end_y:.1f}) pitch percent."
                    ),
                    (
                        f"مسار حمل الكرة المسجّل من "
                        f"({event.start_x:.1f}, {event.start_y:.1f}) إلى "
                        f"({event.end_x:.1f}, {event.end_y:.1f}) بنسبة الملعب."
                    ),
                )
            )
        else:
            missing.append("carry coordinates")

    elif event.type == "tackle":
        outcome = _outcome_label("tackle", event.outcome, arabic=False)
        outcome_ar = _outcome_label("tackle", event.outcome, arabic=True)
        if outcome and outcome_ar:
            statements.append(
                _stmt(
                    "fact",
                    f"Tackle outcome on record: {outcome}.",
                    f"نتيجة التدخل المسجّلة: {outcome_ar}.",
                )
            )
        else:
            missing.append("outcome")
        if event.outcome == "won":
            statements.append(
                _stmt(
                    "fact",
                    "A won tackle is recorded as a defensive regain action for the tackling team.",
                    "التدخل الناجح مسجّل كإجراء دفاعي لاستعادة الكرة لصالح فريق المتدخل.",
                )
            )

    elif event.type in ("pressure", "counter_press"):
        detail = event.detail or event.type
        statements.append(
            _stmt(
                "fact",
                f"Pressing action on record (detail: {detail}).",
                f"إجراء ضغط مسجّل (التفصيل: {detail}).",
            )
        )
        if event.location_x is not None:
            statements.append(
                _stmt(
                    "fact",
                    (
                        f"Press location: "
                        f"({event.location_x:.1f}, {event.location_y:.1f}) pitch percent."
                    ),
                    (
                        f"موقع الضغط: "
                        f"({event.location_x:.1f}, {event.location_y:.1f}) بنسبة الملعب."
                    ),
                )
            )
        else:
            missing.append("press location")

    elif event.type == "possession_change":
        gained = _team_name(db, event.gained_by_team_id)
        if gained:
            statements.append(
                _stmt(
                    "fact",
                    f"Possession gained by {gained} according to the event record.",
                    f"انتقل الاستحواذ إلى {gained} وفق سجل الحدث.",
                )
            )
        else:
            missing.append("gainedByTeamId")

    elif event.type == "foul":
        related = _player_name(db, event.related_player_id)
        outcome = _outcome_label("foul", event.outcome, arabic=False)
        outcome_ar = _outcome_label("foul", event.outcome, arabic=True)
        if related:
            statements.append(
                _stmt(
                    "fact",
                    f"Related player on the foul record: {related}.",
                    f"اللاعب المرتبط في سجل الخطأ: {related}.",
                )
            )
        else:
            missing.append("relatedPlayerId")
        if outcome and outcome_ar:
            statements.append(
                _stmt(
                    "fact",
                    f"Foul outcome on record: {outcome}.",
                    f"تصنيف الخطأ المسجّل: {outcome_ar}.",
                )
            )
        if event.detail:
            statements.append(
                _stmt(
                    "fact",
                    f"Foul detail on record: {event.detail}.",
                    f"تفصيل الخطأ المسجّل: {event.detail}.",
                )
            )

    elif event.type in ("yellow_card", "red_card"):
        card_en = "yellow card" if event.type == "yellow_card" else "red card"
        card_ar = "بطاقة صفراء" if event.type == "yellow_card" else "بطاقة حمراء"
        statements.append(
            _stmt(
                "fact",
                f"Disciplinary event on record: {card_en}.",
                f"حدث تأديبي مسجّل: {card_ar}.",
            )
        )
        if event.detail:
            statements.append(
                _stmt(
                    "fact",
                    f"Card detail on record: {event.detail}.",
                    f"تفصيل البطاقة المسجّل: {event.detail}.",
                )
            )

    elif event.type == "substitution":
        player_on = player
        player_off = _player_name(db, event.related_player_id)
        if player_on and player_off:
            statements.append(
                _stmt(
                    "fact",
                    f"Substitution on record: {player_on} on, {player_off} off.",
                    f"التبديل المسجّل: دخول {player_on} وخروج {player_off}.",
                )
            )
        elif player_on:
            statements.append(
                _stmt(
                    "fact",
                    f"Player entering on record: {player_on}. Player leaving is not recorded.",
                    f"اللاعب الداخل المسجّل: {player_on}. اللاعب الخارج غير مسجّل.",
                )
            )
            missing.append("relatedPlayerId")
        else:
            missing.append("playerId")
        if event.detail:
            statements.append(
                _stmt(
                    "fact",
                    f"Substitution detail on record: {event.detail}.",
                    f"تفصيل التبديل المسجّل: {event.detail}.",
                )
            )

    elif event.type == "offside":
        outcome = _outcome_label("offside", event.outcome, arabic=False)
        outcome_ar = _outcome_label("offside", event.outcome, arabic=True)
        if outcome and outcome_ar:
            statements.append(
                _stmt(
                    "fact",
                    f"Offside outcome on record: {outcome}.",
                    f"نتيجة التسلل المسجّلة: {outcome_ar}.",
                )
            )
        if event.location_x is not None:
            statements.append(
                _stmt(
                    "fact",
                    (
                        f"Offside location: "
                        f"({event.location_x:.1f}, {event.location_y:.1f}) pitch percent."
                    ),
                    (
                        f"موقع التسلل: "
                        f"({event.location_x:.1f}, {event.location_y:.1f}) بنسبة الملعب."
                    ),
                )
            )

    elif event.type in ("counterattack", "reverse_attack"):
        statements.append(
            _stmt(
                "fact",
                f"Transition attack labelled {event_en} is present in the match log.",
                f"هجوم انتقالي موسوم بـ{event_ar} موجود في سجل المباراة.",
            )
        )
        if event.start_x is not None and event.end_x is not None:
            statements.append(
                _stmt(
                    "fact",
                    (
                        f"Recorded path from "
                        f"({event.start_x:.1f}, {event.start_y:.1f}) to "
                        f"({event.end_x:.1f}, {event.end_y:.1f}) pitch percent."
                    ),
                    (
                        f"المسار المسجّل من "
                        f"({event.start_x:.1f}, {event.start_y:.1f}) إلى "
                        f"({event.end_x:.1f}, {event.end_y:.1f}) بنسبة الملعب."
                    ),
                )
            )
        else:
            missing.append("transition path coordinates")

    # Calculated metrics from decision analysis when available
    if analysis is not None and analysis.observed.compositeScore is not None:
        score = analysis.observed.compositeScore
        statements.append(
            _stmt(
                "metric",
                (
                    f"Calculated geometric composite score for the observed action: "
                    f"{score} ({analysis.scoringMethodId}). "
                    f"This is pitch-percent geometry, not xG or success probability."
                ),
                (
                    f"الدرجة الهندسية المحسوبة للإجراء المسجّل: "
                    f"{score} ({analysis.scoringMethodId}). "
                    f"هذه هندسة بنسبة الملعب وليست احتمالاً أو xG."
                ),
            )
        )
        nearest = analysis.context.get("nearest_opponent_distance")
        if isinstance(nearest, (int, float)):
            statements.append(
                _stmt(
                    "metric",
                    (
                        f"Nearest opponent distance at the action origin in the aligned frame: "
                        f"{float(nearest):.2f} pitch percent."
                    ),
                    (
                        f"أقرب مسافة لمنافس عند نقطة بداية الإجراء في الإطار المحاذي: "
                        f"{float(nearest):.2f} بنسبة الملعب."
                    ),
                )
            )

        top = next((item for item in analysis.ranking if item.rank == 1), None)
        if (
            top is not None
            and top.kind == "hypothetical_pass"
            and top.compositeScore is not None
        ):
            statements.append(
                _stmt(
                    "hypothesis",
                    (
                        f"Hypothetical alternative (frame teammate only): "
                        f"{top.label} scores {top.compositeScore} under the same geometric method. "
                        f"This is not a recorded match event and does not predict a goal."
                    ),
                    (
                        f"بديل افتراضي (زميل في الإطار فقط): "
                        f"{top.label} بدرجة {top.compositeScore} وفق الطريقة الهندسية نفسها. "
                        f"هذا ليس حدث مباراة مسجّلاً ولا يتنبأ بهدف."
                    ),
                )
            )
        elif event.type in ANALYZABLE_TYPES and not analysis.alternatives:
            statements.append(
                _stmt(
                    "missing",
                    "No frame-backed hypothetical alternatives are available for this moment.",
                    "لا تتوفر بدائل افتراضية مدعومة بإطار لهذا اللحظة.",
                )
            )
            missing.append("aligned frame alternatives")
    elif event.type in ANALYZABLE_TYPES:
        statements.append(
            _stmt(
                "missing",
                "Geometric decision metrics are unavailable for this event (insufficient evidence).",
                "المقاييس الهندسية للقرار غير متاحة لهذا الحدث (أدلة غير كافية).",
            )
        )
    else:
        statements.append(
            _stmt(
                "fact",
                (
                    f"Event type '{event.type}' is not a geometric decision candidate "
                    f"(pass/shot/carry). No alternative-pass ranking is computed."
                ),
                (
                    f"نوع الحدث '{event.type}' ليس مرشحاً لقرار هندسي "
                    f"(تمريرة/تسديدة/حمل). لا يُحسب ترتيب تمريرات بديلة."
                ),
            )
        )

    return statements, list(dict.fromkeys(missing))


def _narrative_from_statements(
    match: Match,
    event: MatchEvent,
    statements: list[EvidenceStatement],
    missing: list[str],
    *,
    arabic: bool,
) -> LocalizedNarrative:
    event_label = _label(_EVENT_LABELS, event.type, arabic=arabic) or event.type
    home = match.home_team.name if hasattr(match, "home_team") else None
    away = match.away_team.name if hasattr(match, "away_team") else None

    # Prefer relationship names; fall back via loaded attrs
    home_name = getattr(getattr(match, "home_team", None), "name", None) or home
    away_name = getattr(getattr(match, "away_team", None), "name", None) or away

    if home_name and away_name:
        if arabic:
            headline = f"{home_name} × {away_name}: {event_label}"
        else:
            headline = f"{home_name} vs {away_name}: {event_label.title()}"
    else:
        headline = f"تحليل {event_label}" if arabic else f"Event briefing: {event_label.title()}"

    what: list[str] = []
    why: list[str] = []
    otherwise: list[str] = []
    for item in statements:
        text = item.arabic if arabic else item.english
        if item.tier == "fact":
            what.append(text)
        elif item.tier == "metric":
            why.append(text)
        elif item.tier == "hypothesis":
            otherwise.append(text)
        elif item.tier == "missing":
            otherwise.append(text)

    if not why and what:
        # Tactical context from facts when no geometric metrics exist
        why.append(
            "لا تتوفر مقاييس هندسية محسوبة؛ يعتمد التفسير على حقول الحدث المسجّلة فقط."
            if arabic
            else "No calculated geometric metrics are available; impact is described only from recorded event fields."
        )

    observations = [*what[:3], *why[:2], *otherwise[:2]]
    limitations = [
        (
            "تحليل حتمي مبني على الأدلة فقط — لا يوجد مزوّد ذكاء اصطناعي خارجي متصل."
            if arabic
            else "Deterministic evidence-based analysis only — no external AI provider is connected."
        ),
        (
            "البيانات اصطناعية وليست إحصاءات رسمية للمباراة."
            if arabic
            else "Synthetic demo data — not official match statistics."
        ),
    ]
    if missing:
        limitations.append(
            (
                "حقول مفقودة في السجل: " + ", ".join(missing)
                if arabic
                else "Missing fields on record: " + ", ".join(missing)
            )
        )

    return LocalizedNarrative(
        headline=headline,
        keyObservations=observations[:6],
        limitations=limitations[:3],
        whatHappened=what[:5],
        whyItMattered=why[:4],
        whatCouldHaveHappened=otherwise[:4],
        analysisMethod=ANALYSIS_METHOD,
    )


def build_deterministic_event_intelligence(
    db: Session, match_id: str, event_id: str
) -> EventIntelligenceSchema:
    """Build the template briefing without calling an external provider."""
    match = db.get(Match, match_id)
    if match is None:
        raise MatchNotFoundError(match_id)

    # Ensure team names are available for headlines
    _ = match.home_team
    _ = match.away_team

    event = db.get(MatchEvent, event_id)
    if event is None or event.match_id != match_id:
        raise EventNotFoundError(match_id, event_id)

    analysis: DecisionAnalysisSchema | None = None
    decision_candidate = event.type in ANALYZABLE_TYPES
    if decision_candidate:
        try:
            analysis = analysis_to_schema(analyze_decision(db, match_id, event_id))
        except InsufficientEvidenceError:
            analysis = None

    statements, missing = _build_statements(db, match, event, analysis)

    limitations = [
        "Deterministic evidence-based analysis only — no external AI provider is connected.",
        "Synthetic demo data — not official match statistics.",
        "Causal claims are stated only when supported by recorded fields or calculated geometry.",
    ]
    if missing:
        limitations.append("Missing fields on record: " + ", ".join(missing))

    return EventIntelligenceSchema(
        matchId=match_id,
        eventId=event_id,
        eventType=event.type,
        provenance=event.provenance,  # type: ignore[arg-type]
        analysisMethod=ANALYSIS_METHOD,
        llmConnected=False,
        decisionCandidate=decision_candidate and analysis is not None,
        english=_narrative_from_statements(
            match, event, statements, missing, arabic=False
        ),
        arabic=_narrative_from_statements(
            match, event, statements, missing, arabic=True
        ),
        statements=statements,
        missingEvidence=missing,
        limitations=list(dict.fromkeys(limitations)),
        decisionAnalysis=analysis,
    )


def build_event_intelligence(
    db: Session, match_id: str, event_id: str
) -> EventIntelligenceSchema:
    """Build an evidence-grounded briefing; enrich via LLM when configured.

    Deterministic templates always run first. Optional LLM enrichment rewrites
    bilingual narrative sections from the verified evidence pack only. Provider
    failures and validation errors fall back to the deterministic briefing with
    ``llmConnected=False``.
    """
    deterministic = build_deterministic_event_intelligence(db, match_id, event_id)
    return enrich_event_intelligence(deterministic)
