from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.common import PitchPointSchema, TeamSchema
from app.schemas.decision import (
    ActionScoreSchema,
    ClaimVerificationResponseSchema,
    DataCompletenessSchema,
    DecisionAnalysisSchema,
    EvidenceReferenceSchema,
    RankingEntrySchema,
)
from app.schemas.event import CarryEventSchema
from app.schemas.match import MatchSummarySchema
from app.schemas.narrator import MatchIntelligenceTruthPack
from app.services.narrator import narrate_truth_pack


def _truth_pack(*, with_verification: bool = True) -> MatchIntelligenceTruthPack:
    match = MatchSummarySchema(
        id="match-demo-1",
        competition="Demo League",
        homeTeam=TeamSchema(id="home", name="Northgate", shortName="NG"),
        awayTeam=TeamSchema(id="away", name="Riverside", shortName="RS"),
        status="finished",
        kickoffAt="2026-10-01T12:00:00Z",
        provenance="synthetic",
        scenarioId="seeded-test",
    )
    event = CarryEventSchema(
        id="event-demo-1",
        matchId=match.id,
        minute=64,
        teamId="home",
        playerId="player-8",
        provenance="synthetic",
        type="carry",
        start=PitchPointSchema(x=30, y=40),
        end=PitchPointSchema(x=50, y=60),
    )
    observed = ActionScoreSchema(
        actionId="observed:event-demo-1",
        kind="observed_carry",
        label="Observed carry",
        start=PitchPointSchema(x=30, y=40),
        end=PitchPointSchema(x=50, y=60),
        metrics=[],
        compositeScore=36.63380605388592,
        rankable=True,
    )
    alternative = ActionScoreSchema(
        actionId="hypothetical:pass-1",
        kind="hypothetical_pass",
        label="Hypothetical pass",
        start=PitchPointSchema(x=30, y=40),
        end=PitchPointSchema(x=70, y=60),
        targetPlayerId="player-9",
        metrics=[],
        compositeScore=68.62,
        rankable=True,
    )
    analysis = DecisionAnalysisSchema(
        matchId=match.id,
        eventId=event.id,
        eventType="carry",
        isHomeTeam=True,
        scoringMethodId="geometric_progression_v1",
        scoringMethodVersion="1.0.0",
        scoringAssumptions=[],
        observed=observed,
        alternatives=[alternative],
        ranking=[
            RankingEntrySchema(
                rank=1,
                actionId=alternative.actionId,
                kind=alternative.kind,
                label=alternative.label,
                compositeScore=alternative.compositeScore,
                targetPlayerId=alternative.targetPlayerId,
                rankable=True,
            )
        ],
        claims=[],
        completeness=DataCompletenessSchema(
            level="complete",
            hasCoordinates=True,
            hasAlignedFrame=True,
            teammatePositionsInFrame=1,
            opponentPositionsInFrame=1,
            alternativeCount=1,
        ),
        confidence="high",
        limitations=[
            "Synthetic demo data — not official match statistics.",
            "Scoring method geometric_progression_v1 uses geometric progression only; it is not xG, probability, or an objective quality judgment.",
        ],
        context={},
        provenance="synthetic",
    )
    verification = []
    if with_verification:
        verification = [
            ClaimVerificationResponseSchema(
                id="claim-probability",
                statement="This geometric composite score is the probability of pass success",
                status="verified",
                evidenceValidationStatus="verified",
                claimSupportStatus="not_assessed",
                validationMethod="match_event_evidence_catalog_v1",
                validationScope="evidence_reference_membership_and_registered_calculation_consistency",
                evidence=[
                    EvidenceReferenceSchema(
                        kind="event", id=event.id, matchId=match.id
                    ),
                    EvidenceReferenceSchema(
                        kind="calculation",
                        id="calc:observed:event-demo-1:composite_score",
                        matchId=match.id,
                    ),
                ],
                reason="References validated",
                limitations=[
                    "Validated references do not establish statement truth.",
                    "geometric_progression_v1 is not a pass-success probability.",
                ],
                calculation={
                    "id": "calc:observed:event-demo-1:composite_score",
                    "value": observed.compositeScore,
                },
            )
        ]
    return MatchIntelligenceTruthPack(
        match=match,
        event=event,
        decisionAnalysis=analysis,
        verificationResults=verification,
    )


def test_narrator_generates_english_from_supplied_analysis() -> None:
    output = narrate_truth_pack(_truth_pack())

    assert "Northgate vs Riverside" in output.english.headline
    assert any("event-demo-1" in row for row in output.english.keyObservations)
    assert any("36.63380605388592" in row for row in output.english.keyObservations)
    assert any("backend-reported rank 1" in row for row in output.english.keyObservations)
    assert any("not xG or a pass-success probability" in row for row in output.english.limitations)
    assert not any("player-9" in row for row in output.english.keyObservations)


def test_narrator_generates_arabic_and_keeps_proper_names() -> None:
    output = narrate_truth_pack(_truth_pack())

    assert "Northgate × Riverside" in output.arabic.headline
    assert "تحليل قرار حمل الكرة" in output.arabic.headline
    assert any("درجة تقدّم هندسي مركبة" in row for row in output.arabic.keyObservations)
    assert any("احتمال نجاح التمريرة" in row for row in output.arabic.limitations)
    assert output.provenance == "synthetic"


def test_legacy_verified_status_is_not_narrated_as_claim_truth() -> None:
    output = narrate_truth_pack(_truth_pack())
    false_statement = "This geometric composite score is the probability of pass success"

    assert all(false_statement not in row for row in output.english.keyObservations)
    assert any(
        "evidence/reference validation is verified; claim truth remains not assessed"
        in row
        for row in output.english.keyObservations
    )
    assert any("لم يُقيّم صدق الادعاء لغوياً" in row for row in output.arabic.keyObservations)


def test_missing_analysis_and_unresolved_detail_are_stated_without_invention() -> None:
    pack = MatchIntelligenceTruthPack(unresolvedDetails=["pass completion probability"])
    output = narrate_truth_pack(pack)

    assert output.english.keyObservations == []
    assert any("does not establish the requested" in row for row in output.english.limitations)
    assert any("لا تثبت التفاصيل المطلوبة" in row for row in output.arabic.limitations)
    assert all(
        "probability" not in row.lower()
        for row in [output.english.headline, *output.english.keyObservations]
    )


def test_truth_pack_rejects_mismatched_event_and_analysis() -> None:
    pack = _truth_pack(with_verification=False).model_dump()
    pack["event"]["id"] = "other-event"

    with pytest.raises(ValidationError, match="does not belong to its event"):
        MatchIntelligenceTruthPack.model_validate(pack)
