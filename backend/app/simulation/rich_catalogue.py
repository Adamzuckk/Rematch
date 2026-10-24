"""Rich deterministic 6-match football simulation catalogue.

Scenario id stays rematch-phase4-v1 for API compatibility. Event minutes and
IDs are independent of wall clock; only live_started_at depends on `now`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from app.simulation.generator.formations import away_mirror, formation_slots
from app.simulation.generator.metrics import clamp_pitch, compute_path_metrics
from app.simulation.generator.rng import SeededRNG
from app.simulation.scenario_phase4 import EVENTS as DECISION_FIXTURE_EVENTS
from app.simulation.scenario_phase4 import FRAMES as DECISION_FIXTURE_FRAMES

RICH_SCENARIO_ID = "rematch-phase4-v1"
RICH_SCENARIO_VERSION = "2.0.0"
RICH_PROVENANCE = "synthetic"
RICH_DESCRIPTION = (
    "Rich deterministic football simulation: 3 independent live matches "
    "(3 real minutes each), 2 completed, 1 upcoming started on request. "
    "Full event timelines, assists, cards, substitutions, tactical phases, "
    "named coaches, and 5-match form history per team."
)
LIVE_REAL_DURATION_S = 180.0
LIVE_MATCH_MINUTES = 90

_FIRST = [
    "Jamie", "Omar", "Noah", "Elias", "Kai", "Mateo", "Felix", "Adrian",
    "Leo", "Hugo", "Samir", "Yusuf", "Tariq", "Idris", "Rami", "Zayn",
    "Nico", "Luca", "Owen", "Evan", "Malik", "Soren", "Aras", "Dario",
]
_LAST = [
    "Cole", "Hale", "Voss", "Reed", "Nash", "Quinn", "Blair", "Frost",
    "Kane", "Shaw", "Beck", "Lang", "Mercer", "Sloan", "Pratt", "Holt",
    "Ortega", "Vega", "Silva", "Costa", "Drummond", "Pelle", "Ash", "York",
]

_COACHES = {
    "team-northgate": "Helena Crowe",
    "team-riverside": "Marcus Bellini",
    "team-harbor": "Sofia Marchetti",
    "team-eastbridge": "Jonah Pike",
    "team-oakwood": "Ibrahim Saleh",
    "team-silvermere": "Clara Voss",
    "team-crestvale": "Tomasz Reid",
    "team-milltown": "Aya Nakamura",
    "team-lakeside": "Felix Ortega",
    "team-ironford": "Nora Lindqvist",
    "team-westfield": "Darius Cole",
    "team-portside": "Miriam Haas",
}

_TEAM_META = [
    ("team-northgate", "Northgate FC", "NGFC", "northgate", "4-3-3"),
    ("team-riverside", "Riverside United", "RIV", "riverside", "4-2-3-1"),
    ("team-harbor", "Harbor Athletic", "HAR", "harbor", "4-3-3"),
    ("team-eastbridge", "Eastbridge City", "EBC", "eastbridge", "4-2-3-1"),
    ("team-oakwood", "Oakwood Wanderers", "OAK", "oakwood", "4-3-3"),
    ("team-silvermere", "Silvermere FC", "SIL", "silvermere", "4-2-3-1"),
    ("team-crestvale", "Crestvale Rovers", "CRE", "crestvale", "4-3-3"),
    ("team-milltown", "Milltown Athletic", "MIL", "milltown", "4-2-3-1"),
    ("team-lakeside", "Lakeside Town", "LAK", "lakeside", "4-3-3"),
    ("team-ironford", "Ironford United", "IRN", "ironford", "4-2-3-1"),
    ("team-westfield", "Westfield Borough", "WES", "westfield", "4-3-3"),
    ("team-portside", "Portside Albion", "POR", "portside", "4-2-3-1"),
]

_FORM_OPPONENTS = [
    "Ashford Town", "Bramley United", "Cedar Hill", "Dunmere Athletic",
    "Elmwood Rovers", "Fairhaven FC", "Glenbrook", "Highcliff Town",
    "Ivybridge", "Kingswell", "Lowestoft Vale", "Mapleton",
]


@dataclass
class PlayerSpec:
    id: str
    name: str
    team_id: str
    shirt_number: int
    role: str
    position_slot: str


@dataclass
class TeamSpec:
    id: str
    name: str
    short_name: str
    slug: str
    formation: str
    coach_name: str
    players: list[PlayerSpec] = field(default_factory=list)


@dataclass
class RichCatalogue:
    scenario_id: str
    scenario_version: str
    description: str
    teams: list[dict[str, Any]]
    players: list[dict[str, Any]]
    matches: list[dict[str, Any]]
    events: list[dict[str, Any]]
    frames: list[dict[str, Any]]
    form_results: list[dict[str, Any]]


def _dt(base: datetime, minute: float) -> datetime:
    return base + timedelta(minutes=float(minute))


def _player_name(rng: SeededRNG, used: set[str]) -> str:
    for _ in range(80):
        name = f"{rng.choice(_FIRST)} {rng.choice(_LAST)}"
        if name not in used:
            used.add(name)
            return name
    name = f"Player {rng.randint(1000, 9999)}"
    used.add(name)
    return name


def _build_roster(
    rng: SeededRNG,
    team_id: str,
    slug: str,
    formation: str,
    is_home: bool,
    used_names: set[str],
) -> list[PlayerSpec]:
    slots = formation_slots(formation)
    if not is_home:
        slots = [away_mirror(s) for s in slots]
    numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    players: list[PlayerSpec] = []
    for i, slot in enumerate(slots):
        players.append(
            PlayerSpec(
                id=f"player-{slug}-{numbers[i]}",
                name=_player_name(rng, used_names),
                team_id=team_id,
                shirt_number=numbers[i],
                role=slot["role"],
                position_slot=slot.get("slot", slot["role"]),
            )
        )
    # Bench (substitutes) — not placed on pitch frames until they come on.
    for shirt, role in ((12, "MF"), (14, "FW"), (16, "DF"), (18, "MF")):
        players.append(
            PlayerSpec(
                id=f"player-{slug}-{shirt}",
                name=_player_name(rng, used_names),
                team_id=team_id,
                shirt_number=shirt,
                role=role,
                position_slot=f"BENCH-{role}",
            )
        )
    return players


def _starters(team: TeamSpec) -> list[PlayerSpec]:
    return [p for p in team.players if not str(p.position_slot).startswith("BENCH")]


def _bench(team: TeamSpec) -> list[PlayerSpec]:
    return [p for p in team.players if str(p.position_slot).startswith("BENCH")]


def _base_positions(
    players: list[PlayerSpec],
    formation: str,
    is_home: bool,
    phase: float,
    rng: SeededRNG,
) -> dict[str, tuple[float, float]]:
    slots = formation_slots(formation)
    if not is_home:
        slots = [away_mirror(s) for s in slots]
    push = (phase - 0.5) * 18.0 if is_home else (0.5 - phase) * 18.0
    out: dict[str, tuple[float, float]] = {}
    for player, slot in zip(players, slots, strict=True):
        x = clamp_pitch(slot["x"] + push + rng.uniform(-2.5, 2.5))
        y = clamp_pitch(slot["y"] + rng.uniform(-2.5, 2.5))
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
    home_xi = _starters(home)
    away_xi = _starters(away)
    home_pos = _base_positions(
        home_xi, home.formation, True, phase + (0.1 if possession_home else -0.05), rng
    )
    away_pos = _base_positions(
        away_xi, away.formation, False, phase + (0.1 if not possession_home else -0.05), rng
    )
    bx, by = ball_xy
    positions: list[dict[str, Any]] = []
    for team, xi, pos_map in (
        (home, home_xi, home_pos),
        (away, away_xi, away_pos),
    ):
        for p in xi:
            x, y = pos_map[p.id]
            if p.role != "GK":
                x = clamp_pitch(x * 0.85 + bx * 0.15)
                y = clamp_pitch(y * 0.85 + by * 0.15)
            positions.append(
                {
                    "id": f"pos-{p.id}",
                    "player_id": p.id,
                    "team_id": team.id,
                    "x": round(x, 2),
                    "y": round(y, 2),
                }
            )
    return positions


def _outfield(team: TeamSpec) -> list[PlayerSpec]:
    return [p for p in _starters(team) if p.role != "GK"]

def _score_at_minute(
    events: list[dict[str, Any]],
    *,
    home_id: str,
    away_id: str,
    max_minute: float,
) -> tuple[int, int]:
    home = away = 0
    for event in events:
        if event["type"] != "shot" or event.get("outcome") != "goal":
            continue
        minute = event.get("minute")
        if minute is not None and minute > max_minute:
            continue
        if event.get("goal_type") == "own_goal":
            if event.get("team_id") == home_id:
                away += 1
            elif event.get("team_id") == away_id:
                home += 1
            continue
        if event.get("team_id") == home_id:
            home += 1
        elif event.get("team_id") == away_id:
            away += 1
    return home, away


def _generate_match_timeline(
    *,
    match_id: str,
    home: TeamSpec,
    away: TeamSpec,
    kickoff: datetime,
    planned_home: int,
    planned_away: int,
    include_red: bool,
    include_penalty: bool,
    density: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rng = SeededRNG(f"rich-v2:{match_id}:{density}")
    events: list[dict[str, Any]] = []
    frames: list[dict[str, Any]] = []
    seq = 0
    possession_home = True

    def eid(kind: str) -> str:
        nonlocal seq
        seq += 1
        return f"{match_id}-evt-{seq:03d}-{kind}"

    def add_frame(
        event_id: str,
        minute: float,
        ball: tuple[float, float],
        possession_is_home: bool,
        actor: PlayerSpec | None = None,
        receiver: PlayerSpec | None = None,
    ) -> None:
        frng = rng.derived(f"frame:{event_id}")
        positions = _full_frame_positions(
            home, away, minute, ball, possession_is_home, frng
        )
        for pos in positions:
            if actor and pos["player_id"] == actor.id:
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

    def blank_event(**kwargs: Any) -> dict[str, Any]:
        base = {
            "match_id": match_id,
            "receiver_id": None,
            "assist_player_id": None,
            "related_player_id": None,
            "start_x": None,
            "start_y": None,
            "end_x": None,
            "end_y": None,
            "location_x": None,
            "location_y": None,
            "outcome": None,
            "gained_by_team_id": None,
            "goal_type": None,
            "detail": None,
            "distance_m": None,
            "duration_s": None,
            "ball_speed_mps": None,
            "shot_speed_mps": None,
        }
        base.update(kwargs)
        return base

    # Plan goal minutes
    total_goals = planned_home + planned_away
    goal_slots = sorted(
        {round(8 + i * (72 / max(total_goals, 1)) + rng.uniform(-2, 2), 1) for i in range(total_goals)}
    )
    while len(goal_slots) < total_goals:
        goal_slots.append(round(rng.uniform(12, 85), 1))
    goal_slots = sorted(goal_slots)[:total_goals]
    goal_plan: list[tuple[float, str, str]] = []
    hi = ai = 0
    for i, m in enumerate(goal_slots):
        if include_penalty and i == 0:
            side = "home" if planned_home > 0 else "away"
            goal_plan.append((max(m, 18.0), side, "penalty"))
            if side == "home":
                hi += 1
            else:
                ai += 1
            continue
        if hi < planned_home and (ai >= planned_away or rng.random() < 0.55):
            goal_plan.append((m, "home", "open_play"))
            hi += 1
        else:
            goal_plan.append((m, "away", "open_play"))
            ai += 1

    # Dense timeline minutes
    step = 2.2 if density == "high" else 2.8
    cursor = 2.0
    moments: list[float] = []
    while cursor < 89.5:
        moments.append(round(cursor, 1))
        cursor += step + rng.uniform(-0.4, 0.6)

    goal_minutes = {round(g[0], 1) for g in goal_plan}
    red_minute = 71.0 if include_red else None
    sub_minutes = [46.0, 62.0, 78.0]
    tactical_cycle = [
        "pass",
        "carry",
        "pressure",
        "pass",
        "counterattack",
        "shot",
        "tackle",
        "reverse_attack",
        "counter_press",
        "foul",
        "offside",
        "possession_change",
    ]

    for idx, minute in enumerate(moments):
        if any(abs(minute - gm) < 0.6 for gm in goal_minutes):
            continue
        kind = tactical_cycle[idx % len(tactical_cycle)]
        team_is_home = possession_home if rng.random() < 0.62 else not possession_home
        team = home if team_is_home else away
        opp = away if team_is_home else home
        actor = rng.choice(_outfield(team))
        phase = minute / 90.0
        base_x = (
            rng.uniform(25 + phase * 20, 55 + phase * 30)
            if team_is_home
            else rng.uniform(45 - phase * 30, 75 - phase * 20)
        )
        base_y = rng.uniform(18, 82)

        if kind == "pass":
            receiver = rng.choice([p for p in _outfield(team) if p.id != actor.id])
            start = (clamp_pitch(base_x), clamp_pitch(base_y))
            dx = rng.uniform(6, 22) * (1 if team_is_home else -1)
            end = (
                clamp_pitch(start[0] + dx + rng.uniform(-3, 3)),
                clamp_pitch(start[1] + rng.uniform(-12, 12)),
            )
            duration = rng.uniform(0.7, 2.2)
            metrics = compute_path_metrics(start[0], start[1], end[0], end[1], duration)
            complete = rng.random() < 0.8
            event_id = eid("pass")
            events.append(
                blank_event(
                    id=event_id,
                    type="pass",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=team.id,
                    player_id=actor.id,
                    receiver_id=receiver.id if complete else None,
                    start_x=round(start[0], 2),
                    start_y=round(start[1], 2),
                    end_x=round(end[0], 2),
                    end_y=round(end[1], 2),
                    outcome="complete" if complete else "incomplete",
                    distance_m=metrics.distance_m,
                    duration_s=metrics.duration_s,
                    ball_speed_mps=metrics.speed_mps,
                )
            )
            ball = end if complete else (
                clamp_pitch((start[0] + end[0]) / 2),
                clamp_pitch((start[1] + end[1]) / 2),
            )
            if not complete:
                possession_home = not team_is_home
            add_frame(event_id, minute, ball, possession_home, actor, receiver if complete else None)

        elif kind == "carry":
            start = (clamp_pitch(base_x), clamp_pitch(base_y))
            end = (
                clamp_pitch(start[0] + rng.uniform(4, 14) * (1 if team_is_home else -1)),
                clamp_pitch(start[1] + rng.uniform(-8, 8)),
            )
            duration = rng.uniform(1.0, 3.0)
            metrics = compute_path_metrics(start[0], start[1], end[0], end[1], duration)
            event_id = eid("carry")
            events.append(
                blank_event(
                    id=event_id,
                    type="carry",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=team.id,
                    player_id=actor.id,
                    start_x=round(start[0], 2),
                    start_y=round(start[1], 2),
                    end_x=round(end[0], 2),
                    end_y=round(end[1], 2),
                    distance_m=metrics.distance_m,
                    duration_s=metrics.duration_s,
                    ball_speed_mps=metrics.speed_mps,
                )
            )
            add_frame(event_id, minute, end, team_is_home, actor)

        elif kind == "shot":
            loc = (
                clamp_pitch(rng.uniform(78, 94) if team_is_home else rng.uniform(6, 22)),
                clamp_pitch(rng.uniform(30, 70)),
            )
            outcome = rng.choice(["saved", "blocked", "off_target", "saved"])
            event_id = eid("shot")
            duration = rng.uniform(0.35, 0.85)
            goal = (100.0 if team_is_home else 0.0, 50.0)
            metrics = compute_path_metrics(loc[0], loc[1], goal[0], goal[1], duration)
            events.append(
                blank_event(
                    id=event_id,
                    type="shot",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=team.id,
                    player_id=actor.id,
                    location_x=round(loc[0], 2),
                    location_y=round(loc[1], 2),
                    outcome=outcome,
                    distance_m=metrics.distance_m,
                    duration_s=metrics.duration_s,
                    shot_speed_mps=metrics.speed_mps,
                )
            )
            add_frame(event_id, minute, loc, team_is_home, actor)

        elif kind in {"pressure", "counter_press"}:
            loc = (clamp_pitch(base_x), clamp_pitch(base_y))
            event_id = eid(kind)
            events.append(
                blank_event(
                    id=event_id,
                    type=kind,
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=opp.id,
                    player_id=rng.choice(_outfield(opp)).id,
                    location_x=round(loc[0], 2),
                    location_y=round(loc[1], 2),
                    detail="high_press" if kind == "counter_press" else "press",
                )
            )
            if rng.random() < 0.45:
                add_frame(event_id, minute, loc, not team_is_home)

        elif kind in {"counterattack", "reverse_attack"}:
            start = (clamp_pitch(base_x), clamp_pitch(base_y))
            end = (
                clamp_pitch(start[0] + rng.uniform(12, 28) * (1 if team_is_home else -1)),
                clamp_pitch(start[1] + rng.uniform(-15, 15)),
            )
            event_id = eid(kind)
            events.append(
                blank_event(
                    id=event_id,
                    type=kind,
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=team.id,
                    player_id=actor.id,
                    start_x=round(start[0], 2),
                    start_y=round(start[1], 2),
                    end_x=round(end[0], 2),
                    end_y=round(end[1], 2),
                    detail=kind,
                )
            )
            add_frame(event_id, minute, end, team_is_home, actor)
            possession_home = team_is_home

        elif kind == "tackle":
            loc = (clamp_pitch(base_x), clamp_pitch(base_y))
            won = rng.random() < 0.55
            event_id = eid("tackle")
            events.append(
                blank_event(
                    id=event_id,
                    type="tackle",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=opp.id,
                    player_id=rng.choice(_outfield(opp)).id,
                    location_x=round(loc[0], 2),
                    location_y=round(loc[1], 2),
                    outcome="won" if won else "lost",
                )
            )
            if won:
                possession_home = not team_is_home
            if rng.random() < 0.4:
                add_frame(event_id, minute, loc, possession_home)

        elif kind == "foul":
            loc = (clamp_pitch(base_x), clamp_pitch(base_y))
            event_id = eid("foul")
            events.append(
                blank_event(
                    id=event_id,
                    type="foul",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=opp.id,
                    player_id=rng.choice(_outfield(opp)).id,
                    related_player_id=actor.id,
                    location_x=round(loc[0], 2),
                    location_y=round(loc[1], 2),
                    outcome="conceded",
                    detail="challenge",
                )
            )
            if rng.random() < 0.35:
                card_id = eid("yellow")
                events.append(
                    blank_event(
                        id=card_id,
                        type="yellow_card",
                        minute=round(minute + 0.1, 2),
                        occurred_at=_dt(kickoff, minute + 0.1),
                        team_id=opp.id,
                        player_id=events[-1]["player_id"],
                        location_x=round(loc[0], 2),
                        location_y=round(loc[1], 2),
                        detail="reckless",
                    )
                )

        elif kind == "offside":
            loc = (
                clamp_pitch(rng.uniform(70, 88) if team_is_home else rng.uniform(12, 30)),
                clamp_pitch(rng.uniform(20, 80)),
            )
            event_id = eid("offside")
            events.append(
                blank_event(
                    id=event_id,
                    type="offside",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    team_id=team.id,
                    player_id=actor.id,
                    location_x=round(loc[0], 2),
                    location_y=round(loc[1], 2),
                    outcome="flagged",
                )
            )
            possession_home = not team_is_home

        elif kind == "possession_change":
            event_id = eid("poss")
            possession_home = not possession_home
            gained = home.id if possession_home else away.id
            events.append(
                blank_event(
                    id=event_id,
                    type="possession_change",
                    minute=minute,
                    occurred_at=_dt(kickoff, minute),
                    gained_by_team_id=gained,
                )
            )

    # Goals with assist build-up
    for goal_minute, side, goal_type in goal_plan:
        team = home if side == "home" else away
        team_is_home = side == "home"
        scorer = rng.choice(_outfield(team))
        assister = rng.choice([p for p in _outfield(team) if p.id != scorer.id])
        assist_minute = round(goal_minute - 0.2, 2)
        start = (
            clamp_pitch(rng.uniform(55, 75) if team_is_home else rng.uniform(25, 45)),
            clamp_pitch(rng.uniform(25, 75)),
        )
        end = (
            clamp_pitch(rng.uniform(78, 92) if team_is_home else rng.uniform(8, 22)),
            clamp_pitch(rng.uniform(32, 68)),
        )
        if goal_type != "penalty":
            duration = rng.uniform(0.8, 1.6)
            metrics = compute_path_metrics(start[0], start[1], end[0], end[1], duration)
            pass_id = eid("pass")
            events.append(
                blank_event(
                    id=pass_id,
                    type="pass",
                    minute=assist_minute,
                    occurred_at=_dt(kickoff, assist_minute),
                    team_id=team.id,
                    player_id=assister.id,
                    receiver_id=scorer.id,
                    start_x=round(start[0], 2),
                    start_y=round(start[1], 2),
                    end_x=round(end[0], 2),
                    end_y=round(end[1], 2),
                    outcome="complete",
                    detail="key_pass",
                    distance_m=metrics.distance_m,
                    duration_s=metrics.duration_s,
                    ball_speed_mps=metrics.speed_mps,
                )
            )
            add_frame(pass_id, assist_minute, end, team_is_home, assister, scorer)

        loc = end if goal_type != "penalty" else (
            clamp_pitch(88.5 if team_is_home else 11.5),
            50.0,
        )
        shot_id = eid("shot")
        duration = rng.uniform(0.35, 0.7)
        goal_xy = (100.0 if team_is_home else 0.0, 50.0)
        metrics = compute_path_metrics(loc[0], loc[1], goal_xy[0], goal_xy[1], duration)
        events.append(
            blank_event(
                id=shot_id,
                type="shot",
                minute=goal_minute,
                occurred_at=_dt(kickoff, goal_minute),
                team_id=team.id,
                player_id=scorer.id,
                assist_player_id=assister.id if goal_type != "penalty" else None,
                location_x=round(loc[0], 2),
                location_y=round(loc[1], 2),
                outcome="goal",
                goal_type=goal_type,
                detail="penalty_kick" if goal_type == "penalty" else "assisted",
                distance_m=metrics.distance_m,
                duration_s=metrics.duration_s,
                shot_speed_mps=metrics.speed_mps,
            )
        )
        add_frame(shot_id, goal_minute, loc, team_is_home, scorer)
        possession_home = not team_is_home

    # Substitutions — bench player on, starter off
    for sub_i, sub_minute in enumerate(sub_minutes):
        team = home if sub_i % 2 == 0 else away
        bench = _bench(team)
        starters = _outfield(team)
        on_player = bench[sub_i % len(bench)]
        off_player = starters[-(1 + (sub_i % 3))]
        event_id = eid("sub")
        events.append(
            blank_event(
                id=event_id,
                type="substitution",
                minute=sub_minute,
                occurred_at=_dt(kickoff, sub_minute),
                team_id=team.id,
                player_id=on_player.id,
                related_player_id=off_player.id,
                detail="tactical",
                location_x=50.0,
                location_y=5.0 if team.id == home.id else 95.0,
            )
        )

    # Red card
    if red_minute is not None:
        offender = rng.choice(_outfield(away))
        foul_id = eid("foul")
        events.append(
            blank_event(
                id=foul_id,
                type="foul",
                minute=red_minute,
                occurred_at=_dt(kickoff, red_minute),
                team_id=away.id,
                player_id=offender.id,
                related_player_id=rng.choice(_outfield(home)).id,
                location_x=round(rng.uniform(40, 60), 2),
                location_y=round(rng.uniform(30, 70), 2),
                outcome="conceded",
                detail="serious_foul",
            )
        )
        red_id = eid("red")
        events.append(
            blank_event(
                id=red_id,
                type="red_card",
                minute=round(red_minute + 0.2, 2),
                occurred_at=_dt(kickoff, red_minute + 0.2),
                team_id=away.id,
                player_id=offender.id,
                location_x=events[-1]["location_x"],
                location_y=events[-1]["location_y"],
                detail="straight_red",
            )
        )

    events.sort(key=lambda e: (e["minute"] is None, e["minute"] or 0.0, e["id"]))
    return events, frames


def _build_form_results(teams: list[TeamSpec]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    base = datetime(2026, 9, 1, 15, 0, tzinfo=timezone.utc)
    for t_index, team in enumerate(teams):
        rng = SeededRNG(f"form-v2:{team.id}")
        for i in range(5):
            gf = rng.randint(0, 3)
            ga = rng.randint(0, 3)
            if gf > ga:
                result = "W"
            elif gf < ga:
                result = "L"
            else:
                result = "D"
            opponent = _FORM_OPPONENTS[(t_index * 5 + i) % len(_FORM_OPPONENTS)]
            rows.append(
                {
                    "id": f"form-{team.slug}-{i + 1}",
                    "team_id": team.id,
                    "played_at": base + timedelta(days=t_index + i * 7),
                    "opponent_name": opponent,
                    "is_home": i % 2 == 0,
                    "goals_for": gf,
                    "goals_against": ga,
                    "result": result,
                    "competition": rng.choice(
                        ["Metro Premier Cup", "Coastal League", "Northern Circuit"]
                    ),
                    "provenance": RICH_PROVENANCE,
                }
            )
    return rows


def generate_rich_catalogue(*, now: datetime | None = None) -> RichCatalogue:
    """Build the full 6-match catalogue. Only live_started_at depends on `now`."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    used_names: set[str] = set()
    teams: list[TeamSpec] = []
    team_by_id: dict[str, TeamSpec] = {}
    for team_id, name, short_name, slug, formation in _TEAM_META:
        rng = SeededRNG(f"rich-v2:roster:{slug}")
        # Alternate home-ish base slots for naming diversity only.
        roster = _build_roster(rng, team_id, slug, formation, True, used_names)
        spec = TeamSpec(
            id=team_id,
            name=name,
            short_name=short_name,
            slug=slug,
            formation=formation,
            coach_name=_COACHES[team_id],
            players=roster,
        )
        teams.append(spec)
        team_by_id[team_id] = spec

    fixtures: list[dict[str, Any]] = [
        {
            "id": "m-northgate-riverside-2401",
            "competition": "Metro Premier Cup",
            "home_team_id": "team-northgate",
            "away_team_id": "team-riverside",
            "status": "live",
            "kickoff_at": datetime(2026, 10, 18, 18, 0, tzinfo=timezone.utc),
            "venue": "Northgate Arena",
            "home_formation": "4-3-3",
            "away_formation": "4-2-3-1",
            "planned_home_score": 2,
            "planned_away_score": 1,
            "target_live_minute": 67,
            "include_red": False,
            "include_penalty": True,
            "density": "high",
        },
        {
            "id": "m-harbor-eastbridge-2402",
            "competition": "Coastal League",
            "home_team_id": "team-harbor",
            "away_team_id": "team-eastbridge",
            "status": "live",
            "kickoff_at": datetime(2026, 10, 18, 19, 15, tzinfo=timezone.utc),
            "venue": "Harbor Docklands",
            "home_formation": "4-3-3",
            "away_formation": "4-2-3-1",
            "planned_home_score": 2,
            "planned_away_score": 0,
            "target_live_minute": 34,
            "include_red": False,
            "include_penalty": False,
            "density": "high",
        },
        {
            "id": "m-westfield-portside-2406",
            "competition": "Metro Premier Cup",
            "home_team_id": "team-westfield",
            "away_team_id": "team-portside",
            "status": "live",
            "kickoff_at": datetime(2026, 10, 21, 19, 45, tzinfo=timezone.utc),
            "venue": "Westfield Terrace",
            "home_formation": "4-3-3",
            "away_formation": "4-2-3-1",
            "planned_home_score": 1,
            "planned_away_score": 1,
            "target_live_minute": 12,
            "include_red": False,
            "include_penalty": False,
            "density": "high",
        },
        {
            "id": "m-oakwood-silvermere-2403",
            "competition": "Metro Premier Cup",
            "home_team_id": "team-oakwood",
            "away_team_id": "team-silvermere",
            "status": "finished",
            "kickoff_at": datetime(2026, 10, 17, 15, 0, tzinfo=timezone.utc),
            "venue": "Oakwood Park",
            "home_formation": "4-3-3",
            "away_formation": "4-2-3-1",
            "planned_home_score": 3,
            "planned_away_score": 1,
            "target_live_minute": None,
            "include_red": True,
            "include_penalty": False,
            "density": "high",
        },
        {
            "id": "m-crestvale-milltown-2404",
            "competition": "Northern Circuit",
            "home_team_id": "team-crestvale",
            "away_team_id": "team-milltown",
            "status": "finished",
            "kickoff_at": datetime(2026, 10, 16, 20, 0, tzinfo=timezone.utc),
            "venue": "Crestvale Ground",
            "home_formation": "4-3-3",
            "away_formation": "4-2-3-1",
            "planned_home_score": 1,
            "planned_away_score": 1,
            "target_live_minute": None,
            "include_red": False,
            "include_penalty": True,
            "density": "high",
        },
        {
            "id": "m-lakeside-ironford-2405",
            "competition": "Coastal League",
            "home_team_id": "team-lakeside",
            "away_team_id": "team-ironford",
            "status": "upcoming",
            "kickoff_at": datetime(2026, 10, 20, 17, 30, tzinfo=timezone.utc),
            "venue": "Lakeside Basin",
            "home_formation": "4-3-3",
            "away_formation": "4-2-3-1",
            "planned_home_score": 2,
            "planned_away_score": 1,
            "target_live_minute": None,
            "include_red": False,
            "include_penalty": False,
            "density": "high",
        },
    ]

    matches: list[dict[str, Any]] = []
    all_events: list[dict[str, Any]] = []
    all_frames: list[dict[str, Any]] = []

    for fixture in fixtures:
        home = team_by_id[fixture["home_team_id"]]
        away = team_by_id[fixture["away_team_id"]]
        # Align formations on team specs for frame generation.
        home.formation = fixture["home_formation"]
        away.formation = fixture["away_formation"]
        events, frames = _generate_match_timeline(
            match_id=fixture["id"],
            home=home,
            away=away,
            kickoff=fixture["kickoff_at"],
            planned_home=fixture["planned_home_score"],
            planned_away=fixture["planned_away_score"],
            include_red=fixture["include_red"],
            include_penalty=fixture["include_penalty"],
            density=fixture["density"],
        )
        all_events.extend(events)
        all_frames.extend(frames)
        matches.append(
            {
                "id": fixture["id"],
                "competition": fixture["competition"],
                "home_team_id": home.id,
                "away_team_id": away.id,
                "status": fixture["status"],
                "kickoff_at": fixture["kickoff_at"],
                "venue": fixture["venue"],
                "home_formation": fixture["home_formation"],
                "away_formation": fixture["away_formation"],
                "target_live_minute": fixture["target_live_minute"],
                "planned_home_score": fixture["planned_home_score"],
                "planned_away_score": fixture["planned_away_score"],
            }
        )

    # Preserve Phase-4 decision demo IDs/geometry used by decision engine tests,
    # Decision Explorer fixtures, and docs (evt-ng-pass-12, evt-ng-carry-64, …).
    existing_event_ids = {e["id"] for e in all_events}
    for row in DECISION_FIXTURE_EVENTS:
        if row["id"] in existing_event_ids:
            continue
        all_events.append(
            {
                "id": row["id"],
                "match_id": row["match_id"],
                "type": row["type"],
                "minute": row.get("minute"),
                "occurred_at": row.get("occurred_at"),
                "team_id": row.get("team_id"),
                "player_id": row.get("player_id"),
                "receiver_id": row.get("receiver_id"),
                "assist_player_id": None,
                "related_player_id": None,
                "start_x": row.get("start_x"),
                "start_y": row.get("start_y"),
                "end_x": row.get("end_x"),
                "end_y": row.get("end_y"),
                "location_x": row.get("location_x"),
                "location_y": row.get("location_y"),
                "outcome": row.get("outcome"),
                "gained_by_team_id": row.get("gained_by_team_id"),
                "goal_type": "open_play" if row.get("outcome") == "goal" else None,
                "detail": None,
                "distance_m": None,
                "duration_s": None,
                "ball_speed_mps": None,
                "shot_speed_mps": None,
            }
        )
        existing_event_ids.add(row["id"])

    existing_frame_ids = {f["id"] for f in all_frames}
    for row in DECISION_FIXTURE_FRAMES:
        if row["id"] in existing_frame_ids:
            continue
        all_frames.append(
            {
                "id": row["id"],
                "match_id": row["match_id"],
                "event_id": row.get("event_id"),
                "minute": row.get("minute"),
                "occurred_at": row.get("occurred_at"),
                "ball_x": row.get("ball_x"),
                "ball_y": row.get("ball_y"),
                "players": list(row["players"]),
            }
        )
        existing_frame_ids.add(row["id"])

    all_events.sort(
        key=lambda e: (e["minute"] is None, e["minute"] or 0.0, e["id"])
    )

    finalized_matches: list[dict[str, Any]] = []
    for match in matches:
        home_id = match["home_team_id"]
        away_id = match["away_team_id"]
        match_events = [e for e in all_events if e["match_id"] == match["id"]]
        final_home, final_away = _score_at_minute(
            match_events, home_id=home_id, away_id=away_id, max_minute=90
        )
        status = match["status"]
        live_started_at = None
        minute: int | None
        home_score: int | None
        away_score: int | None
        if status == "finished":
            minute = 90
            home_score, away_score = final_home, final_away
        elif status == "live":
            target = int(match["target_live_minute"])
            elapsed = (target / LIVE_MATCH_MINUTES) * LIVE_REAL_DURATION_S
            live_started_at = current - timedelta(seconds=elapsed)
            minute = target
            home_score, away_score = _score_at_minute(
                match_events,
                home_id=home_id,
                away_id=away_id,
                max_minute=float(target),
            )
        else:
            minute = None
            home_score = None
            away_score = None

        finalized_matches.append(
            {
                "id": match["id"],
                "competition": match["competition"],
                "home_team_id": home_id,
                "away_team_id": away_id,
                "status": status,
                "kickoff_at": match["kickoff_at"],
                "home_score": home_score,
                "away_score": away_score,
                "minute": minute,
                "venue": match["venue"],
                "home_formation": match["home_formation"],
                "away_formation": match["away_formation"],
                "planned_home_score": final_home,
                "planned_away_score": final_away,
                "live_started_at": live_started_at,
            }
        )

    team_rows = [
        {
            "id": t.id,
            "name": t.name,
            "short_name": t.short_name,
            "coach_name": t.coach_name,
        }
        for t in teams
    ]
    player_rows = [
        {
            "id": p.id,
            "name": p.name,
            "team_id": p.team_id,
            "shirt_number": p.shirt_number,
            "role": p.role,
            "position_slot": p.position_slot,
        }
        for t in teams
        for p in t.players
    ]

    return RichCatalogue(
        scenario_id=RICH_SCENARIO_ID,
        scenario_version=RICH_SCENARIO_VERSION,
        description=RICH_DESCRIPTION,
        teams=team_rows,
        players=player_rows,
        matches=finalized_matches,
        events=all_events,
        frames=all_frames,
        form_results=_build_form_results(teams),
    )


__all__ = [
    "RICH_DESCRIPTION",
    "RICH_PROVENANCE",
    "RICH_SCENARIO_ID",
    "RICH_SCENARIO_VERSION",
    "LIVE_MATCH_MINUTES",
    "LIVE_REAL_DURATION_S",
    "RichCatalogue",
    "generate_rich_catalogue",
]
