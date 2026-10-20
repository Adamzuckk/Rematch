"""Integrity checks for generated match bundles."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.simulation.coordinates import is_valid_pitch_value
from app.simulation.generator.match_generator import MatchBundle

ANALYZABLE = frozenset({"pass", "shot", "carry"})


@dataclass
class ValidationReport:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def fail(self, msg: str) -> None:
        self.errors.append(msg)
        self.ok = False

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def validate_frame_integrity(frame: dict[str, Any], *, require_full_xi: bool = True) -> ValidationReport:
    report = ValidationReport(ok=True)
    players = frame.get("players") or []
    ids = [p["player_id"] for p in players]
    if require_full_xi:
        if len(players) != 22:
            report.fail(f"Frame {frame.get('id')}: expected 22 players, got {len(players)}")
        if len(set(ids)) != len(ids):
            report.fail(f"Frame {frame.get('id')}: duplicate player ids")
    for p in players:
        if not is_valid_pitch_value(p.get("x")) or not is_valid_pitch_value(p.get("y")):
            report.fail(f"Frame {frame.get('id')}: invalid player coord {p.get('player_id')}")
    if frame.get("ball_x") is not None or frame.get("ball_y") is not None:
        if not is_valid_pitch_value(frame.get("ball_x")) or not is_valid_pitch_value(frame.get("ball_y")):
            report.fail(f"Frame {frame.get('id')}: invalid ball coordinates")
    elif require_full_xi:
        report.fail(f"Frame {frame.get('id')}: missing ball position")
    return report


def validate_match_bundle(bundle: MatchBundle, *, min_eligible: int = 10) -> ValidationReport:
    report = ValidationReport(ok=True)
    events = sorted(bundle.events, key=lambda e: (e["minute"], e["id"]))
    # Ordering
    prev = -1.0
    for e in events:
        if e["minute"] < prev - 1e-9:
            report.fail(f"Event ordering violated at {e['id']}")
        prev = e["minute"]

    # Score vs goals
    home_id = bundle.home.id
    away_id = bundle.away.id
    goals_h = sum(1 for e in events if e["type"] == "shot" and e["outcome"] == "goal" and e["team_id"] == home_id)
    goals_a = sum(1 for e in events if e["type"] == "shot" and e["outcome"] == "goal" and e["team_id"] == away_id)
    if bundle.match.get("home_score") != goals_h or bundle.match.get("away_score") != goals_a:
        report.fail(
            f"Score mismatch: match says {bundle.match.get('home_score')}-{bundle.match.get('away_score')} "
            f"but goal events are {goals_h}-{goals_a}"
        )

    player_ids = {p.id for p in bundle.home.players + bundle.away.players}
    if len(bundle.home.players) != 11 or len(bundle.away.players) != 11:
        report.fail("Each team must have exactly 11 players")

    for e in events:
        if e.get("player_id") and e["player_id"] not in player_ids:
            report.fail(f"Event {e['id']} references unknown player {e['player_id']}")
        if e.get("receiver_id") and e["receiver_id"] not in player_ids:
            report.fail(f"Event {e['id']} references unknown receiver {e['receiver_id']}")
        for key in ("start_x", "start_y", "end_x", "end_y", "location_x", "location_y"):
            val = e.get(key)
            if val is not None and not is_valid_pitch_value(val):
                report.fail(f"Event {e['id']} invalid {key}={val}")

    # Eligible frames
    frames_by_event = {f["event_id"]: f for f in bundle.frames if f.get("event_id")}
    eligible = []
    for e in events:
        if e["type"] not in ANALYZABLE:
            continue
        has_coords = False
        if e["type"] in ("pass", "carry"):
            has_coords = e.get("start_x") is not None and e.get("end_x") is not None
        elif e["type"] == "shot":
            has_coords = e.get("location_x") is not None
        if not has_coords:
            continue
        fr = frames_by_event.get(e["id"])
        if fr is None:
            report.warn(f"Analyzable event {e['id']} has no aligned frame")
            continue
        fr_report = validate_frame_integrity(fr, require_full_xi=True)
        if not fr_report.ok:
            for err in fr_report.errors:
                report.fail(err)
            continue
        # Need at least one teammate besides actor for pass alternatives
        team_id = e.get("team_id")
        teammates = [p for p in fr["players"] if p["team_id"] == team_id and p["player_id"] != e.get("player_id")]
        if e["type"] == "pass" and e.get("receiver_id"):
            teammates = [p for p in teammates if p["player_id"] != e["receiver_id"]]
        if e["type"] in ("pass", "carry") and len(teammates) < 1:
            report.warn(f"Event {e['id']} frame lacks alternative teammates")
        else:
            eligible.append(e["id"])

    if len(eligible) < min_eligible:
        report.fail(
            f"Only {len(eligible)} eligible decision moments (need >= {min_eligible})"
        )

    # Metric sanity
    for e in events:
        if e.get("distance_m") is not None and e["distance_m"] < 0:
            report.fail(f"Event {e['id']} negative distance")
        if e.get("ball_speed_mps") is not None and e["ball_speed_mps"] > 60:
            report.warn(f"Event {e['id']} unusually high ball speed {e['ball_speed_mps']} m/s")
        if e.get("shot_speed_mps") is not None and e["shot_speed_mps"] > 50:
            report.warn(f"Event {e['id']} unusually high shot speed {e['shot_speed_mps']} m/s")

    return report
