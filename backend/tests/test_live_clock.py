from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.live_clock import (
    LIVE_MATCH_MINUTES,
    LIVE_REAL_DURATION_S,
    elapsed_seconds,
    match_minute_from_elapsed,
    score_from_events,
)


def test_minute_mapping_endpoints() -> None:
    assert match_minute_from_elapsed(0) == 0
    assert match_minute_from_elapsed(LIVE_REAL_DURATION_S / 2) == 45
    assert match_minute_from_elapsed(LIVE_REAL_DURATION_S) == LIVE_MATCH_MINUTES
    assert match_minute_from_elapsed(LIVE_REAL_DURATION_S + 10) == LIVE_MATCH_MINUTES


def test_elapsed_seconds_independent() -> None:
    start = datetime(2026, 10, 24, 12, 0, tzinfo=timezone.utc)
    now = start + timedelta(seconds=90)
    assert elapsed_seconds(start, now) == 90.0


def test_score_from_events_own_goal() -> None:
    class _Evt:
        def __init__(self, **kwargs):
            self.type = kwargs.get("type", "shot")
            self.outcome = kwargs.get("outcome")
            self.minute = kwargs.get("minute")
            self.team_id = kwargs.get("team_id")
            self.goal_type = kwargs.get("goal_type")

    events = [
        _Evt(outcome="goal", minute=10, team_id="home", goal_type="open_play"),
        _Evt(outcome="goal", minute=20, team_id="home", goal_type="own_goal"),
        _Evt(outcome="saved", minute=30, team_id="away"),
    ]
    home, away = score_from_events(
        events, home_team_id="home", away_team_id="away", max_minute=90
    )
    assert home == 1
    assert away == 1
