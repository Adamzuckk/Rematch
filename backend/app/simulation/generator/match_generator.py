"""Deterministic synthetic match generator (Phase 8).

Produces full XI rosters, ordered events, and 22-player frames for every
eligible decision moment (pass / shot / carry with coordinates).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from app.simulation.generator.formations import away_mirror, formation_slots
from app.simulation.generator.metrics import clamp_pitch, compute_path_metrics
from app.simulation.generator.rng import SeededRNG

GENERATOR_VERSION = "1.0.0"
GENERATOR_ID = "rematch-phase8-generator"

ScenarioFlag = Literal["none", "red_card", "comeback", "high_press", "late_goal"]

# Fictional first/last name pools (no real player identities).
_FIRST = [
    "Jamie", "Omar", "Noah", "Elias", "Kai", "Mateo", "Felix", "Adrian",
    "Leo", "Hugo", "Samir", "Yusuf", "Tariq", "Idris", "Rami", "Zayn",
    "Nico", "Luca", "Owen", "Evan", "Malik", "Soren", "Aras", "Dario",
]
_LAST = [
    "Cole", "Hale", "Voss", "Reed", "Nash", "Quinn", "Blair", "Frost",
    "Kane", "Shaw", "Beck", "Lang", "Mercer", "Sloan", "Pratt", "Holt",
    "Rami", "Nadir", "Sami", "Faris", "Ortega", "Vega", "Silva", "Costa",
]


@dataclass
class PlayerSpec:
    id: str
    name: str
    team_id: str
    shirt_number: int
    role: str


@dataclass
class TeamSpec:
    id: str
    name: str
    short_name: str
    formation: str
    players: list[PlayerSpec] = field(default_factory=list)


@dataclass
class MatchBundle:
    """In-memory generated match ready for validation and persistence."""

    seed: str
    generator_version: str
    match: dict[str, Any]
    home: TeamSpec
    away: TeamSpec
    events: list[dict[str, Any]]
    frames: list[dict[str, Any]]
    scenario_flags: list[str]
    eligible_decision_event_ids: list[str]


@dataclass
class Phase8Dataset:
    scenario_id: str
    scenario_version: str
    description: str
    teams: list[dict[str, Any]]
    players: list[dict[str, Any]]
    matches: list[dict[str, Any]]
    events: list[dict[str, Any]]
    frames: list[dict[str, Any]]
    bundles: list[MatchBundle]


def _dt(base: datetime, minute: float) -> datetime:
    return base + timedelta(minutes=float(minute))


def _player_name(rng: SeededRNG, used: set[str]) -> str:
    for _ in range(50):
        name = f"{rng.choice(_FIRST)} {rng.choice(_LAST)}"
        if name not in used:
            used.add(name)
            return name
    # Extremely unlikely fallback
    name = f"Player {rng.randint(1000, 9999)}"
    used.add(name)
    return name


def _build_roster(
    rng: SeededRNG,
    team_id: str,
    team_slug: str,
    formation: str,
    is_home: bool,
    used_names: set[str],
) -> list[PlayerSpec]:
    slots = formation_slots(formation)
    if not is_home:
        slots = [away_mirror(s) for s in slots]
    players: list[PlayerSpec] = []
    # Shirt numbers: GK=1, then 2..11
    numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    for i, slot in enumerate(slots):
        pid = f"player-{team_slug}-{numbers[i]}"
        players.append(
            PlayerSpec(
                id=pid,
                name=_player_name(rng, used_names),
                team_id=team_id,
                shirt_number=numbers[i],
                role=slot["role"],
            )
        )
    return players


def _base_positions(
    players: list[PlayerSpec],
    formation: str,
    is_home: bool,
    phase: float,
    rng: SeededRNG,
) -> dict[str, tuple[float, float]]:
    """Return player_id -> (x, y) for a game phase in [0, 1] (territorial bias)."""
    slots = formation_slots(formation)
    if not is_home:
        slots = [away_mirror(s) for s in slots]
    # Push lines forward/back with phase (0=defensive, 1=attacking)
    push = (phase - 0.5) * 18.0 if is_home else (0.5 - phase) * 18.0
    out: dict[str, tuple[float, float]] = {}
    for player, slot in zip(players, slots, strict=True):
        jx = rng.uniform(-2.5, 2.5)
        jy = rng.uniform(-2.5, 2.5)
        x = clamp_pitch(slot["x"] + push + jx)
        y = clamp_pitch(slot["y"] + jy)
        out[player.id] = (x, y)
    return out


def _full_frame_positions(
    home: TeamSpec,
    away: TeamSpec,
    minute: float,
    ball_xy: tuple[float, float],
    possession_home: bool,
    rng: SeededRNG,
) -> list[dict[str, Any]]:
    phase = min(1.0, max(0.0, minute / 90.0))
    # Slight bias toward ball
    home_pos = _base_positions(home.players, home.formation, True, phase + (0.1 if possession_home else -0.05), rng)
    away_pos = _base_positions(away.players, away.formation, False, phase + (0.1 if not possession_home else -0.05), rng)
    bx, by = ball_xy
    positions: list[dict[str, Any]] = []
    for team, pos_map in ((home, home_pos), (away, away_pos)):
        for p in team.players:
            x, y = pos_map[p.id]
            # Soft attract non-GK toward ball
            if p.role != "GK":
                x = clamp_pitch(x * 0.85 + bx * 0.15)
                y = clamp_pitch(y * 0.85 + by * 0.15)
            positions.append(
                {
                    "id": f"pos-{p.id}",  # rewritten per frame later
                    "player_id": p.id,
                    "team_id": team.id,
                    "x": round(x, 2),
                    "y": round(y, 2),
                }
            )
    return positions


def generate_match_bundle(
    seed: str,
    *,
    match_id: str,
    home_team: dict[str, str],
    away_team: dict[str, str],
    competition: str,
    venue: str,
    kickoff: datetime,
    status: str = "finished",
    home_formation: str = "4-3-3",
    away_formation: str = "4-2-3-1",
    target_decision_moments: int = 12,
    scenario: ScenarioFlag = "none",
) -> MatchBundle:
    """Generate one complete synthetic match for the given seed."""
    rng = SeededRNG(f"{GENERATOR_VERSION}:{seed}:{match_id}")
    used_names: set[str] = set()

    home = TeamSpec(
        id=home_team["id"],
        name=home_team["name"],
        short_name=home_team["short_name"],
        formation=home_formation,
        players=_build_roster(rng.derived("home"), home_team["id"], home_team["slug"], home_formation, True, used_names),
    )
    away = TeamSpec(
        id=away_team["id"],
        name=away_team["name"],
        short_name=away_team["short_name"],
        formation=away_formation,
        players=_build_roster(rng.derived("away"), away_team["id"], away_team["slug"], away_formation, False, used_names),
    )

    flags: list[str] = []
    if scenario != "none":
        flags.append(scenario)

    # Score plan
    home_goals = 1
    away_goals = 1
    if scenario == "comeback":
        home_goals, away_goals = 2, 1
        flags.append("comeback")
    elif scenario == "late_goal":
        home_goals, away_goals = 2, 1
    elif scenario == "high_press":
        home_goals, away_goals = 1, 0

    events: list[dict[str, Any]] = []
    frames: list[dict[str, Any]] = []
    eligible: list[str] = []

    # Pre-place goal minutes
    goal_minutes: list[tuple[float, str]] = []
    if home_goals + away_goals > 0:
        # Spread goals across the match
        slots = sorted({round(rng.uniform(8, 85), 1) for _ in range(home_goals + away_goals + 2)})
        slots = slots[: home_goals + away_goals]
        while len(slots) < home_goals + away_goals:
            slots.append(round(rng.uniform(10, 88), 1))
        slots = sorted(slots)
        hi = 0
        ai = 0
        for i, m in enumerate(slots):
            if scenario == "late_goal" and i == len(slots) - 1:
                goal_minutes.append((max(m, 88.0), "home"))
                hi += 1
            elif scenario == "comeback" and i == 0:
                goal_minutes.append((m, "away"))
                ai += 1
            elif hi < home_goals and (ai >= away_goals or rng.random() < 0.55):
                goal_minutes.append((m, "home"))
                hi += 1
            else:
                goal_minutes.append((m, "away"))
                ai += 1

    # Build a timeline of decision moments + supporting events
    decision_minutes: list[float] = []
    cursor = 3.0
    while len(decision_minutes) < target_decision_moments:
        step = rng.uniform(4.0, 8.5)
        cursor += step
        if cursor >= 90.0:
            break
        # Avoid colliding with goal minutes
        if any(abs(cursor - gm) < 0.8 for gm, _ in goal_minutes):
            cursor += 1.5
        decision_minutes.append(round(cursor, 1))

    possession_home = True
    hs = 0
    as_ = 0
    event_seq = 0

    def next_event_id(kind: str, minute: float) -> str:
        nonlocal event_seq
        event_seq += 1
        return f"{match_id}-evt-{event_seq:03d}-{kind}"

    def add_decision(
        minute: float,
        kind: str,
        team_is_home: bool,
        *,
        force_goal: bool = False,
    ) -> None:
        nonlocal possession_home, hs, as_
        team = home if team_is_home else away
        opp = away if team_is_home else home
        actor = rng.choice([p for p in team.players if p.role != "GK"])
        receiver_candidates = [p for p in team.players if p.id != actor.id and p.role != "GK"]
        receiver = rng.choice(receiver_candidates)

        phase = minute / 90.0
        if team_is_home:
            base_x = rng.uniform(25 + phase * 20, 55 + phase * 30)
        else:
            base_x = rng.uniform(45 - phase * 30, 75 - phase * 20)
        base_y = rng.uniform(18, 82)

        if kind == "pass":
            start = (clamp_pitch(base_x), clamp_pitch(base_y))
            # Receiver ahead toward attack
            dx = rng.uniform(6, 22) * (1 if team_is_home else -1)
            end = (
                clamp_pitch(start[0] + dx + rng.uniform(-3, 3)),
                clamp_pitch(start[1] + rng.uniform(-12, 12)),
            )
            duration = rng.uniform(0.7, 2.4)
            metrics = compute_path_metrics(start[0], start[1], end[0], end[1], duration)
            complete = rng.random() < 0.78
            eid = next_event_id("pass", minute)
            events.append(
                {
                    "id": eid,
                    "match_id": match_id,
                    "type": "pass",
                    "minute": minute,
                    "occurred_at": _dt(kickoff, minute),
                    "team_id": team.id,
                    "player_id": actor.id,
                    "receiver_id": receiver.id if complete else None,
                    "start_x": round(start[0], 2),
                    "start_y": round(start[1], 2),
                    "end_x": round(end[0], 2),
                    "end_y": round(end[1], 2),
                    "location_x": None,
                    "location_y": None,
                    "outcome": "complete" if complete else "incomplete",
                    "gained_by_team_id": None,
                    "distance_m": metrics.distance_m,
                    "duration_s": metrics.duration_s,
                    "ball_speed_mps": metrics.speed_mps,
                    "shot_speed_mps": None,
                }
            )
            ball = end if complete else (
                clamp_pitch((start[0] + end[0]) / 2),
                clamp_pitch((start[1] + end[1]) / 2),
            )
            if not complete:
                possession_home = not team_is_home
            _add_frame(eid, minute, ball, team_is_home if complete else not team_is_home, actor, receiver)
            eligible.append(eid)

        elif kind == "carry":
            start = (clamp_pitch(base_x), clamp_pitch(base_y))
            dx = rng.uniform(4, 14) * (1 if team_is_home else -1)
            end = (
                clamp_pitch(start[0] + dx),
                clamp_pitch(start[1] + rng.uniform(-8, 8)),
            )
            duration = rng.uniform(1.0, 3.5)
            metrics = compute_path_metrics(start[0], start[1], end[0], end[1], duration)
            eid = next_event_id("carry", minute)
            events.append(
                {
                    "id": eid,
                    "match_id": match_id,
                    "type": "carry",
                    "minute": minute,
                    "occurred_at": _dt(kickoff, minute),
                    "team_id": team.id,
                    "player_id": actor.id,
                    "receiver_id": None,
                    "start_x": round(start[0], 2),
                    "start_y": round(start[1], 2),
                    "end_x": round(end[0], 2),
                    "end_y": round(end[1], 2),
                    "location_x": None,
                    "location_y": None,
                    "outcome": None,
                    "gained_by_team_id": None,
                    "distance_m": metrics.distance_m,
                    "duration_s": metrics.duration_s,
                    "ball_speed_mps": metrics.speed_mps,
                    "shot_speed_mps": None,
                }
            )
            _add_frame(eid, minute, end, team_is_home, actor, None)
            eligible.append(eid)

        elif kind == "shot":
            loc_x = clamp_pitch(rng.uniform(78, 94) if team_is_home else rng.uniform(6, 22))
            loc_y = clamp_pitch(rng.uniform(30, 70))
            goal = (100.0 if team_is_home else 0.0, 50.0)
            duration = rng.uniform(0.35, 0.9)
            metrics = compute_path_metrics(loc_x, loc_y, goal[0], goal[1], duration)
            if force_goal:
                outcome = "goal"
            else:
                outcome = rng.choice(["saved", "off_target", "blocked", "goal", "saved"])
                # Soften goal rate unless forced
                if outcome == "goal" and rng.random() > 0.25:
                    outcome = "saved"
            eid = next_event_id("shot", minute)
            events.append(
                {
                    "id": eid,
                    "match_id": match_id,
                    "type": "shot",
                    "minute": minute,
                    "occurred_at": _dt(kickoff, minute),
                    "team_id": team.id,
                    "player_id": actor.id,
                    "receiver_id": None,
                    "start_x": None,
                    "start_y": None,
                    "end_x": None,
                    "end_y": None,
                    "location_x": round(loc_x, 2),
                    "location_y": round(loc_y, 2),
                    "outcome": outcome,
                    "gained_by_team_id": None,
                    "distance_m": metrics.distance_m,
                    "duration_s": metrics.duration_s,
                    "ball_speed_mps": None,
                    "shot_speed_mps": metrics.speed_mps,
                }
            )
            if outcome == "goal":
                if team_is_home:
                    hs += 1
                else:
                    as_ += 1
                possession_home = not team_is_home
            _add_frame(eid, minute, (loc_x, loc_y), team_is_home, actor, None)
            eligible.append(eid)

        # Occasional supporting events
        if rng.random() < 0.35:
            press_id = next_event_id("pressure", minute + 0.05)
            presser = rng.choice(opp.players)
            events.append(
                {
                    "id": press_id,
                    "match_id": match_id,
                    "type": "pressure",
                    "minute": round(minute + 0.05, 2),
                    "occurred_at": _dt(kickoff, minute + 0.05),
                    "team_id": opp.id,
                    "player_id": presser.id,
                    "receiver_id": None,
                    "start_x": None,
                    "start_y": None,
                    "end_x": None,
                    "end_y": None,
                    "location_x": round(clamp_pitch(base_x + rng.uniform(-5, 5)), 2),
                    "location_y": round(clamp_pitch(base_y + rng.uniform(-5, 5)), 2),
                    "outcome": None,
                    "gained_by_team_id": None,
                    "distance_m": None,
                    "duration_s": None,
                    "ball_speed_mps": None,
                    "shot_speed_mps": None,
                }
            )
        if rng.random() < 0.2:
            tackle_id = next_event_id("tackle", minute + 0.1)
            tackler = rng.choice([p for p in opp.players if p.role != "GK"])
            won = rng.random() < 0.5
            events.append(
                {
                    "id": tackle_id,
                    "match_id": match_id,
                    "type": "tackle",
                    "minute": round(minute + 0.1, 2),
                    "occurred_at": _dt(kickoff, minute + 0.1),
                    "team_id": opp.id,
                    "player_id": tackler.id,
                    "receiver_id": None,
                    "start_x": None,
                    "start_y": None,
                    "end_x": None,
                    "end_y": None,
                    "location_x": round(clamp_pitch(base_x), 2),
                    "location_y": round(clamp_pitch(base_y), 2),
                    "outcome": "won" if won else "lost",
                    "gained_by_team_id": None,
                    "distance_m": None,
                    "duration_s": None,
                    "ball_speed_mps": None,
                    "shot_speed_mps": None,
                }
            )
            if won:
                possession_home = not team_is_home
                pc_id = next_event_id("poss", minute + 0.12)
                events.append(
                    {
                        "id": pc_id,
                        "match_id": match_id,
                        "type": "possession_change",
                        "minute": round(minute + 0.12, 2),
                        "occurred_at": _dt(kickoff, minute + 0.12),
                        "team_id": None,
                        "player_id": None,
                        "receiver_id": None,
                        "start_x": None,
                        "start_y": None,
                        "end_x": None,
                        "end_y": None,
                        "location_x": None,
                        "location_y": None,
                        "outcome": None,
                        "gained_by_team_id": opp.id if team_is_home else home.id,
                        "distance_m": None,
                        "duration_s": None,
                        "ball_speed_mps": None,
                        "shot_speed_mps": None,
                    }
                )

    def _add_frame(
        event_id: str,
        minute: float,
        ball: tuple[float, float],
        possession_is_home: bool,
        actor: PlayerSpec,
        receiver: PlayerSpec | None,
    ) -> None:
        frng = rng.derived(f"frame:{event_id}")
        positions = _full_frame_positions(home, away, minute, ball, possession_is_home, frng)
        # Pin actor (and receiver) near the ball path for realism
        for pos in positions:
            if pos["player_id"] == actor.id:
                pos["x"] = round(clamp_pitch(ball[0] + frng.uniform(-3, 3)), 2)
                pos["y"] = round(clamp_pitch(ball[1] + frng.uniform(-3, 3)), 2)
            if receiver and pos["player_id"] == receiver.id:
                pos["x"] = round(clamp_pitch(ball[0] + frng.uniform(-6, 6)), 2)
                pos["y"] = round(clamp_pitch(ball[1] + frng.uniform(-8, 8)), 2)
            pos["id"] = f"{event_id}-{pos['player_id']}"
        frames.append(
            {
                "id": f"frm-{event_id}",
                "match_id": match_id,
                "event_id": event_id,
                "minute": int(minute),
                "occurred_at": _dt(kickoff, minute),
                "ball_x": round(ball[0], 2),
                "ball_y": round(ball[1], 2),
                "players": positions,
            }
        )

    # Interleave decision minutes and goals
    timeline: list[tuple[float, str, Any]] = [("decision", m, None) for m in decision_minutes]
    for gm, side in goal_minutes:
        timeline.append(("goal", gm, side))
    timeline.sort(key=lambda t: t[1])

    kinds_cycle = ["pass", "pass", "carry", "pass", "shot", "pass", "carry"]
    ki = 0
    for kind_tag, minute, extra in timeline:
        if kind_tag == "goal":
            add_decision(minute, "shot", extra == "home", force_goal=True)
        else:
            team_home = possession_home if rng.random() < 0.7 else not possession_home
            if scenario == "high_press":
                team_home = True if rng.random() < 0.65 else team_home
            add_decision(minute, kinds_cycle[ki % len(kinds_cycle)], team_home)
            ki += 1

    # Ensure scoreboard matches goal events
    final_home = sum(1 for e in events if e["type"] == "shot" and e["outcome"] == "goal" and e["team_id"] == home.id)
    final_away = sum(1 for e in events if e["type"] == "shot" and e["outcome"] == "goal" and e["team_id"] == away.id)

    # Red-card scenario: mark a late pressure event as context only (no new type)
    if scenario == "red_card" and events:
        flags.append("red_card_context")
        # Prefer a late tackle as the "disciplinary moment" narrative anchor
        late = [e for e in events if e["type"] == "tackle" and e["minute"] >= 60]
        if late:
            late[-1]["outcome"] = "won"

    events.sort(key=lambda e: (e["minute"], e["id"]))
    frames.sort(key=lambda f: (f["minute"], f["id"]))

    match = {
        "id": match_id,
        "competition": competition,
        "home_team_id": home.id,
        "away_team_id": away.id,
        "status": status,
        "kickoff_at": kickoff,
        "home_score": final_home,
        "away_score": final_away,
        "minute": 90 if status == "finished" else int(decision_minutes[-1]) if decision_minutes else 45,
        "venue": venue,
    }

    return MatchBundle(
        seed=seed,
        generator_version=GENERATOR_VERSION,
        match=match,
        home=home,
        away=away,
        events=events,
        frames=frames,
        scenario_flags=flags,
        eligible_decision_event_ids=eligible,
    )


# Fixed Phase 8 fixtures (fictional).
_PHASE8_FIXTURES: list[dict[str, Any]] = [
    {
        "seed": "phase8-northgate-riverside-001",
        "match_id": "m-p8-northgate-riverside-001",
        "home": {"id": "team-northgate", "name": "Northgate FC", "short_name": "NGFC", "slug": "northgate"},
        "away": {"id": "team-riverside", "name": "Riverside United", "short_name": "RIV", "slug": "riverside"},
        "competition": "Fictional Premier Circuit",
        "venue": "Northgate Arena",
        "kickoff": datetime(2026, 10, 18, 18, 0, tzinfo=timezone.utc),
        "status": "finished",
        "home_formation": "4-3-3",
        "away_formation": "4-2-3-1",
        "scenario": "comeback",
        "target_decision_moments": 12,
    },
    {
        "seed": "phase8-harbor-eastbridge-002",
        "match_id": "m-p8-harbor-eastbridge-002",
        "home": {"id": "team-harbor", "name": "Harbor Athletic", "short_name": "HAR", "slug": "harbor"},
        "away": {"id": "team-eastbridge", "name": "Eastbridge City", "short_name": "EBC", "slug": "eastbridge"},
        "competition": "Fictional Premier Circuit",
        "venue": "Harbor Quay Stadium",
        "kickoff": datetime(2026, 10, 19, 15, 0, tzinfo=timezone.utc),
        "status": "finished",
        "home_formation": "4-2-3-1",
        "away_formation": "4-3-3",
        "scenario": "high_press",
        "target_decision_moments": 12,
    },
    {
        "seed": "phase8-oakwood-silvermere-003",
        "match_id": "m-p8-oakwood-silvermere-003",
        "home": {"id": "team-oakwood", "name": "Oakwood Wanderers", "short_name": "OAK", "slug": "oakwood"},
        "away": {"id": "team-silvermere", "name": "Silvermere FC", "short_name": "SIL", "slug": "silvermere"},
        "competition": "Fictional Championship League",
        "venue": "Oakwood Park",
        "kickoff": datetime(2026, 10, 17, 14, 30, tzinfo=timezone.utc),
        "status": "finished",
        "home_formation": "4-3-3",
        "away_formation": "4-3-3",
        "scenario": "late_goal",
        "target_decision_moments": 12,
    },
]


PHASE8_SCENARIO_ID = "rematch-phase8-v1"
PHASE8_SCENARIO_VERSION = "1.0.0"
PHASE8_DESCRIPTION = (
    "Phase 8 expanded synthetic dataset: three complete fictional matches with "
    "full XI rosters, ordered events, and 22-player decision frames generated by "
    f"{GENERATOR_ID} v{GENERATOR_VERSION}. Model estimates only — not real match data."
)


def generate_phase8_dataset() -> Phase8Dataset:
    """Build the canonical Phase 8 dataset (deterministic)."""
    bundles: list[MatchBundle] = []
    teams_map: dict[str, dict[str, Any]] = {}
    players_list: list[dict[str, Any]] = []
    seen_players: set[str] = set()

    for fx in _PHASE8_FIXTURES:
        bundle = generate_match_bundle(
            fx["seed"],
            match_id=fx["match_id"],
            home_team=fx["home"],
            away_team=fx["away"],
            competition=fx["competition"],
            venue=fx["venue"],
            kickoff=fx["kickoff"],
            status=fx["status"],
            home_formation=fx["home_formation"],
            away_formation=fx["away_formation"],
            target_decision_moments=fx["target_decision_moments"],
            scenario=fx["scenario"],
        )
        bundles.append(bundle)
        for team in (bundle.home, bundle.away):
            teams_map[team.id] = {
                "id": team.id,
                "name": team.name,
                "short_name": team.short_name,
            }
            for p in team.players:
                if p.id not in seen_players:
                    seen_players.add(p.id)
                    players_list.append(
                        {
                            "id": p.id,
                            "name": p.name,
                            "team_id": p.team_id,
                            "shirt_number": p.shirt_number,
                        }
                    )

    matches = [b.match for b in bundles]
    events = [e for b in bundles for e in b.events]
    frames = [f for b in bundles for f in b.frames]

    return Phase8Dataset(
        scenario_id=PHASE8_SCENARIO_ID,
        scenario_version=PHASE8_SCENARIO_VERSION,
        description=PHASE8_DESCRIPTION,
        teams=list(teams_map.values()),
        players=players_list,
        matches=matches,
        events=events,
        frames=frames,
        bundles=bundles,
    )
