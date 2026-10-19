"""Deterministic synthetic scenario rematch-phase4-v1.

Aligned with the fictional clubs/fixtures from the frontend rematch-phase2-v1
catalogue, plus a small set of player/ball frames for Match Analysis demos.

All values are illustrative — not official Premier League (or any league) records.
Coordinates use the frontend PitchPoint convention (0–100%, origin bottom-left).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, TypedDict

PHASE4_SCENARIO_ID = "rematch-phase4-v1"
PHASE4_SCENARIO_VERSION = "1.0.0"
PHASE4_PROVENANCE = "synthetic"

PHASE4_DESCRIPTION = (
    "Fictional multi-competition match catalogue for local API development and "
    "tests. Extends the Phase 2 frontend fixture IDs with sparse events and a "
    "small Northgate–Riverside frame set. Scores and minutes are demo values only."
)


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


class TeamSeed(TypedDict):
    id: str
    name: str
    short_name: str


class PlayerSeed(TypedDict):
    id: str
    name: str
    team_id: str
    shirt_number: int


class MatchSeed(TypedDict, total=False):
    id: str
    competition: str
    home_team_id: str
    away_team_id: str
    status: str
    kickoff_at: datetime
    home_score: int | None
    away_score: int | None
    minute: int | None
    venue: str


class EventSeed(TypedDict, total=False):
    id: str
    match_id: str
    type: str
    minute: float
    occurred_at: datetime
    team_id: str
    player_id: str | None
    receiver_id: str | None
    start_x: float | None
    start_y: float | None
    end_x: float | None
    end_y: float | None
    location_x: float | None
    location_y: float | None
    outcome: str | None
    gained_by_team_id: str | None


class PlayerPosSeed(TypedDict):
    id: str
    player_id: str
    team_id: str
    x: float
    y: float


class FrameSeed(TypedDict, total=False):
    id: str
    match_id: str
    event_id: str | None
    minute: int
    occurred_at: datetime
    ball_x: float | None
    ball_y: float | None
    players: list[PlayerPosSeed]


TEAMS: list[TeamSeed] = [
    {"id": "team-northgate", "name": "Northgate FC", "short_name": "NGFC"},
    {"id": "team-riverside", "name": "Riverside United", "short_name": "RIV"},
    {"id": "team-harbor", "name": "Harbor Athletic", "short_name": "HAR"},
    {"id": "team-eastbridge", "name": "Eastbridge City", "short_name": "EBC"},
    {"id": "team-oakwood", "name": "Oakwood Wanderers", "short_name": "OAK"},
    {"id": "team-silvermere", "name": "Silvermere FC", "short_name": "SIL"},
    {"id": "team-crestvale", "name": "Crestvale Rovers", "short_name": "CRE"},
    {"id": "team-milltown", "name": "Milltown Athletic", "short_name": "MIL"},
    {"id": "team-lakeside", "name": "Lakeside Town", "short_name": "LAK"},
    {"id": "team-ironford", "name": "Ironford United", "short_name": "IRN"},
    {"id": "team-westfield", "name": "Westfield Borough", "short_name": "WES"},
    {"id": "team-portside", "name": "Portside Albion", "short_name": "POR"},
]

PLAYERS: list[PlayerSeed] = [
    {
        "id": "player-northgate-8",
        "name": "Jamie Cole",
        "team_id": "team-northgate",
        "shirt_number": 8,
    },
    {
        "id": "player-northgate-9",
        "name": "Omar Hale",
        "team_id": "team-northgate",
        "shirt_number": 9,
    },
    {
        "id": "player-northgate-11",
        "name": "Leo Park",
        "team_id": "team-northgate",
        "shirt_number": 11,
    },
    {
        "id": "player-riverside-6",
        "name": "Noah Greer",
        "team_id": "team-riverside",
        "shirt_number": 6,
    },
    {
        "id": "player-riverside-10",
        "name": "Samir Quinn",
        "team_id": "team-riverside",
        "shirt_number": 10,
    },
    {
        "id": "player-oakwood-7",
        "name": "Theo Marsh",
        "team_id": "team-oakwood",
        "shirt_number": 7,
    },
    {
        "id": "player-oakwood-10",
        "name": "Kai Benton",
        "team_id": "team-oakwood",
        "shirt_number": 10,
    },
    {
        "id": "player-silvermere-1",
        "name": "Ellis Ward",
        "team_id": "team-silvermere",
        "shirt_number": 1,
    },
]

MATCHES: list[MatchSeed] = [
    {
        "id": "m-northgate-riverside-2401",
        "competition": "Metro Premier Cup",
        "home_team_id": "team-northgate",
        "away_team_id": "team-riverside",
        "status": "live",
        "kickoff_at": _dt("2026-10-18T18:00:00.000Z"),
        "home_score": 1,
        "away_score": 1,
        "minute": 67,
        "venue": "Northgate Arena",
    },
    {
        "id": "m-harbor-eastbridge-2402",
        "competition": "Coastal League",
        "home_team_id": "team-harbor",
        "away_team_id": "team-eastbridge",
        "status": "live",
        "kickoff_at": _dt("2026-10-18T19:15:00.000Z"),
        "home_score": 2,
        "away_score": 0,
        "minute": 34,
        "venue": "Harbor Docklands",
    },
    {
        "id": "m-oakwood-silvermere-2403",
        "competition": "Metro Premier Cup",
        "home_team_id": "team-oakwood",
        "away_team_id": "team-silvermere",
        "status": "finished",
        "kickoff_at": _dt("2026-10-17T15:00:00.000Z"),
        "home_score": 3,
        "away_score": 1,
        "minute": None,
        "venue": "Oakwood Park",
    },
    {
        "id": "m-crestvale-milltown-2404",
        "competition": "Northern Circuit",
        "home_team_id": "team-crestvale",
        "away_team_id": "team-milltown",
        "status": "finished",
        "kickoff_at": _dt("2026-10-16T20:00:00.000Z"),
        "home_score": 0,
        "away_score": 0,
        "minute": None,
        "venue": "Crestvale Ground",
    },
    {
        "id": "m-lakeside-ironford-2405",
        "competition": "Coastal League",
        "home_team_id": "team-lakeside",
        "away_team_id": "team-ironford",
        "status": "upcoming",
        "kickoff_at": _dt("2026-10-20T17:30:00.000Z"),
        "home_score": None,
        "away_score": None,
        "minute": None,
        "venue": "Lakeside Basin",
    },
    {
        "id": "m-westfield-portside-2406",
        "competition": "Metro Premier Cup",
        "home_team_id": "team-westfield",
        "away_team_id": "team-portside",
        "status": "upcoming",
        "kickoff_at": _dt("2026-10-21T19:45:00.000Z"),
        "home_score": None,
        "away_score": None,
        "minute": None,
        "venue": "Westfield Terrace",
    },
]

EVENTS: list[EventSeed] = [
    {
        "id": "evt-ng-pass-12",
        "match_id": "m-northgate-riverside-2401",
        "type": "pass",
        "minute": 12,
        "occurred_at": _dt("2026-10-18T18:12:00.000Z"),
        "team_id": "team-northgate",
        "player_id": "player-northgate-8",
        "receiver_id": "player-northgate-11",
        "start_x": 42.0,
        "start_y": 48.0,
        "end_x": 58.0,
        "end_y": 62.0,
        "outcome": "complete",
    },
    {
        "id": "evt-ng-shot-23",
        "match_id": "m-northgate-riverside-2401",
        "type": "shot",
        "minute": 23,
        "occurred_at": _dt("2026-10-18T18:23:00.000Z"),
        "team_id": "team-northgate",
        "player_id": "player-northgate-9",
        "location_x": 88.0,
        "location_y": 52.0,
        "outcome": "goal",
    },
    {
        "id": "evt-ng-pressure-41",
        "match_id": "m-northgate-riverside-2401",
        "type": "pressure",
        "minute": 41,
        "occurred_at": _dt("2026-10-18T18:41:00.000Z"),
        "team_id": "team-riverside",
        "player_id": "player-riverside-6",
        "location_x": 55.0,
        "location_y": 40.0,
    },
    {
        "id": "evt-ng-possession-52",
        "match_id": "m-northgate-riverside-2401",
        "type": "possession_change",
        "minute": 52,
        "occurred_at": _dt("2026-10-18T18:52:00.000Z"),
        "team_id": "team-riverside",
        "gained_by_team_id": "team-riverside",
    },
    {
        "id": "evt-ng-shot-61",
        "match_id": "m-northgate-riverside-2401",
        "type": "shot",
        "minute": 61,
        "occurred_at": _dt("2026-10-18T19:01:00.000Z"),
        "team_id": "team-riverside",
        "player_id": "player-riverside-10",
        "location_x": 14.0,
        "location_y": 47.0,
        "outcome": "goal",
    },
    {
        "id": "evt-ng-carry-64",
        "match_id": "m-northgate-riverside-2401",
        "type": "carry",
        "minute": 64,
        "occurred_at": _dt("2026-10-18T19:04:00.000Z"),
        "team_id": "team-northgate",
        "player_id": "player-northgate-11",
        "start_x": 35.0,
        "start_y": 30.0,
        "end_x": 52.0,
        "end_y": 44.0,
    },
    {
        "id": "evt-oak-pass-18",
        "match_id": "m-oakwood-silvermere-2403",
        "type": "pass",
        "minute": 18,
        "occurred_at": _dt("2026-10-17T15:18:00.000Z"),
        "team_id": "team-oakwood",
        "player_id": "player-oakwood-7",
        "receiver_id": "player-oakwood-10",
        "start_x": 60.0,
        "start_y": 55.0,
        "end_x": 78.0,
        "end_y": 48.0,
        "outcome": "complete",
    },
    {
        "id": "evt-oak-shot-33",
        "match_id": "m-oakwood-silvermere-2403",
        "type": "shot",
        "minute": 33,
        "occurred_at": _dt("2026-10-17T15:33:00.000Z"),
        "team_id": "team-oakwood",
        "player_id": "player-oakwood-10",
        "location_x": 91.0,
        "location_y": 50.0,
        "outcome": "goal",
    },
    {
        "id": "evt-oak-tackle-55",
        "match_id": "m-oakwood-silvermere-2403",
        "type": "tackle",
        "minute": 55,
        "occurred_at": _dt("2026-10-17T15:55:00.000Z"),
        "team_id": "team-silvermere",
        "player_id": "player-silvermere-1",
        "location_x": 22.0,
        "location_y": 60.0,
        "outcome": "won",
    },
]

# Sparse frames for the live Northgate match — enough to show player markers.
FRAMES: list[FrameSeed] = [
    {
        "id": "frm-ng-12",
        "match_id": "m-northgate-riverside-2401",
        "event_id": "evt-ng-pass-12",
        "minute": 12,
        "occurred_at": _dt("2026-10-18T18:12:00.000Z"),
        "ball_x": 42.0,
        "ball_y": 48.0,
        "players": [
            {
                "id": "frm-ng-12-p-ng8",
                "player_id": "player-northgate-8",
                "team_id": "team-northgate",
                "x": 42.0,
                "y": 48.0,
            },
            {
                "id": "frm-ng-12-p-ng11",
                "player_id": "player-northgate-11",
                "team_id": "team-northgate",
                "x": 58.0,
                "y": 62.0,
            },
            {
                "id": "frm-ng-12-p-riv6",
                "player_id": "player-riverside-6",
                "team_id": "team-riverside",
                "x": 50.0,
                "y": 45.0,
            },
        ],
    },
    {
        "id": "frm-ng-23",
        "match_id": "m-northgate-riverside-2401",
        "event_id": "evt-ng-shot-23",
        "minute": 23,
        "occurred_at": _dt("2026-10-18T18:23:00.000Z"),
        "ball_x": 88.0,
        "ball_y": 52.0,
        "players": [
            {
                "id": "frm-ng-23-p-ng9",
                "player_id": "player-northgate-9",
                "team_id": "team-northgate",
                "x": 86.0,
                "y": 52.0,
            },
            {
                "id": "frm-ng-23-p-ng8",
                "player_id": "player-northgate-8",
                "team_id": "team-northgate",
                "x": 72.0,
                "y": 40.0,
            },
            {
                "id": "frm-ng-23-p-riv6",
                "player_id": "player-riverside-6",
                "team_id": "team-riverside",
                "x": 90.0,
                "y": 48.0,
            },
        ],
    },
    {
        "id": "frm-ng-64",
        "match_id": "m-northgate-riverside-2401",
        "event_id": "evt-ng-carry-64",
        "minute": 64,
        "occurred_at": _dt("2026-10-18T19:04:00.000Z"),
        "ball_x": 44.0,
        "ball_y": 37.0,
        "players": [
            {
                "id": "frm-ng-64-p-ng11",
                "player_id": "player-northgate-11",
                "team_id": "team-northgate",
                "x": 44.0,
                "y": 37.0,
            },
            {
                "id": "frm-ng-64-p-ng9",
                "player_id": "player-northgate-9",
                "team_id": "team-northgate",
                "x": 68.0,
                "y": 55.0,
            },
            {
                "id": "frm-ng-64-p-riv10",
                "player_id": "player-riverside-10",
                "team_id": "team-riverside",
                "x": 40.0,
                "y": 42.0,
            },
        ],
    },
]


def scenario_manifest() -> dict[str, Any]:
    return {
        "id": PHASE4_SCENARIO_ID,
        "version": PHASE4_SCENARIO_VERSION,
        "provenance": PHASE4_PROVENANCE,
        "description": PHASE4_DESCRIPTION,
        "team_count": len(TEAMS),
        "player_count": len(PLAYERS),
        "match_count": len(MATCHES),
        "event_count": len(EVENTS),
        "frame_count": len(FRAMES),
    }
