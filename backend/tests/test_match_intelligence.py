from app.schemas.intelligence import MatchIntelligenceSchema


def test_intelligence_schema_defaults():
    payload = MatchIntelligenceSchema(
        matchId="m-test",
        eventCounts={"pass": 2},
        totalEvents=2,
        eventsWithCoordinates=1,
        alignedFrames=1,
        pathMetricsPresent=0,
        keyMoments=[],
        limitations=["x"],
    )
    assert payload.provenance == "synthetic"
    assert payload.source == "seeded_events_only"
