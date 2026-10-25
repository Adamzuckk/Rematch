"""Grounded Ask-the-Crew workflow for Match Studio.

Routes free-form questions to deterministic local agents or honest capability
messages. Never invents match facts. Optional Gemini enrichment is only used
indirectly when the established event-intelligence path is selected.
"""

from __future__ import annotations

import re
from sqlalchemy.orm import Session

from app.schemas.ask import (
    AskAnswerBody,
    AskEvidenceRef,
    AskFactClass,
    AskIntent,
    AskRequest,
    AskResponse,
    AskStatus,
)
from app.schemas.event import MatchEventSchema, PassEventSchema, ShotEventSchema
from app.schemas.narrator import LocalizedNarrative
from app.services import matches as match_service
from app.services.decision import (
    EventNotFoundError,
    InsufficientEvidenceError,
    MatchNotFoundError,
)
from app.services.decision.engine import ANALYZABLE_TYPES
from app.services.event_intelligence import build_event_intelligence
from app.services.match_intelligence import build_match_intelligence_narrative

_GREETING_RE = re.compile(
    r"^(hi|hello|hey|good morning|good afternoon|good evening|"
    r"السلام عليكم|مرحبا|أهلا|اهلا|صباح الخير|مساء الخير)"
    r"[!?.،\s]*$",
    re.IGNORECASE,
)
_HELP_RE = re.compile(
    r"^(help|\?|؟|مساعدة|ساعدني|what can you (do|answer)|capabilities)"
    r"[!?.،\s]*$",
    re.IGNORECASE,
)
_VERIFY_RE = re.compile(
    r"verif|evidence|claim|fact[- ]?check|supports this|"
    r"تحقق|دليل|أدلة|ادعاء",
    re.IGNORECASE,
)
_WHATIF_RE = re.compile(
    r"what if|alternative|compare|other options|what would change|"
    r"press(?:ed)? higher|formation|ماذا لو|بديل|بدائل|ضغط",
    re.IGNORECASE,
)
_LOCAL_FACTS_RE = re.compile(
    r"who (?:was )?involved|which player|player name|who (?:passed|scored|acted)|"
    r"receiver|team(?: name)?|minute|what type|"
    r"من (?:اللاعب|شارك)|أي لاعب|اسم اللاعب",
    re.IGNORECASE,
)
_NARRATIVE_RE = re.compile(
    r"why|explain|summar(?:y|ize)|what happened|decision|how did|"
    r"why did this (?:goal|decision)|goal happen|"
    r"لماذا|اشرح|ملخص|لخص|ماذا حدث|القرار|الهدف",
    re.IGNORECASE,
)
_UNSUPPORTED_TACTICS_RE = re.compile(
    r"press(?:ed)? higher|formation|tactics?|xG|possession|"
    r"match[- ]wide|key decision moments|before the goal|"
    r"تكتك|تكتيك|حيازة|قبل الهدف",
    re.IGNORECASE,
)


def classify_ask_intent(question: str) -> AskIntent:
    text = question.strip()
    if not text:
        return "help"
    if _GREETING_RE.match(text):
        return "greeting"
    if _HELP_RE.match(text):
        return "help"
    if _UNSUPPORTED_TACTICS_RE.search(text) and not _NARRATIVE_RE.search(text):
        return "unsupported"
    if _VERIFY_RE.search(text):
        return "verification"
    if _WHATIF_RE.search(text):
        return "whatif"
    if _LOCAL_FACTS_RE.search(text):
        return "local_facts"
    if _NARRATIVE_RE.search(text):
        return "narrative"
    return "unsupported"


def _localized(
    *,
    headline_en: str,
    headline_ar: str,
    observations_en: list[str],
    observations_ar: list[str],
    limitations_en: list[str],
    limitations_ar: list[str],
    method: str = "ask_crew_grounded_v1",
) -> AskAnswerBody:
    return AskAnswerBody(
        english=LocalizedNarrative(
            headline=headline_en,
            keyObservations=observations_en,
            limitations=limitations_en,
            analysisMethod=method,
        ),
        arabic=LocalizedNarrative(
            headline=headline_ar,
            keyObservations=observations_ar,
            limitations=limitations_ar,
            analysisMethod=method,
        ),
    )


def _capability_answer() -> AskAnswerBody:
    return _localized(
        headline_en="Ask the crew — grounded match analysis",
        headline_ar="اسأل الطاقم — تحليل مباراة مبني على الأدلة",
        observations_en=[
            "I can explain a selected pass, shot, or carry using the Decision, Verifier, and Narrator workflow.",
            "I can list who was involved from the selected match-event record and roster.",
            "I can point you to WHAT IF / Decision Explorer for scored alternatives.",
            "I do not invent players, assists, xG, possession, or tactical counterfactuals.",
        ],
        observations_ar=[
            "أستطيع شرح تمريرة أو تسديدة أو حمل محدد عبر مسار القرار والمدقق والراوي.",
            "أستطيع سرد المشاركين من سجل الحدث المحدد وقائمة اللاعبين فقط.",
            "أستطيع توجيهك إلى ماذا لو / مستكشف القرار للبدائل المسجّلة.",
            "لا أخترع لاعبين أو تمريرات حاسمة أو xG أو حيازة أو تكتيكات افتراضية.",
        ],
        limitations_en=[
            "This is not unrestricted AI chat. Answers stay tied to selected match evidence and supported intents.",
            "Match-wide summaries, pre-goal multi-event context, and free-form tactics remain unsupported.",
        ],
        limitations_ar=[
            "هذه ليست محادثة ذكاء اصطناعي مطلقة. الإجابات مرتبطة بأدلة المباراة والنوايا المدعومة.",
            "ملخصات المباراة الكاملة وسياق ما قبل الهدف والتكتيك الحر ما زالت غير مدعومة.",
        ],
        method="ask_crew_capability_v1",
    )


def _unsupported_answer(reason_en: str, reason_ar: str) -> AskAnswerBody:
    return _localized(
        headline_en="That question is outside Ask the crew’s grounded scope",
        headline_ar="هذا السؤال خارج نطاق الطاقم المبني على الأدلة",
        observations_en=[
            reason_en,
            "Try a suggested question, ask who was involved in the selected moment, or ask why this decision unfolded.",
            "Greetings and capability questions are answered; unrestricted football chat is not.",
        ],
        observations_ar=[
            reason_ar,
            "جرّب سؤالاً مقترحاً، أو اسأل من شارك في اللحظة المحددة، أو لماذا تطوّر هذا القرار.",
            "التحيات وأسئلة القدرات مدعومة؛ الدردشة الكروية المطلقة غير مدعومة.",
        ],
        limitations_en=[
            "No match facts were invented for this reply.",
        ],
        limitations_ar=[
            "لم تُختلق أي حقائق مباراة لهذه الإجابة.",
        ],
        method="ask_crew_unsupported_v1",
    )


def _player_name(event: MatchEventSchema, players: dict[str, str]) -> str | None:
    if not event.playerId:
        return None
    return players.get(event.playerId)


def _team_name(event: MatchEventSchema, match) -> str | None:
    if not event.teamId:
        return None
    if event.teamId == match.homeTeam.id:
        return match.homeTeam.name
    if event.teamId == match.awayTeam.id:
        return match.awayTeam.name
    return None


def _local_facts_answer(
    *,
    match,
    event: MatchEventSchema,
    players: dict[str, str],
) -> tuple[AskAnswerBody, list[AskEvidenceRef], list[AskFactClass], list[str]]:
    missing: list[str] = []
    team = _team_name(event, match)
    player = _player_name(event, players)
    if not team:
        missing.append("team")
    if not player:
        missing.append("player")

    receiver: str | None = None
    outcome: str | None = None
    if isinstance(event, PassEventSchema):
        if event.receiverId:
            receiver = players.get(event.receiverId)
        if not receiver:
            missing.append("receiver")
        outcome = event.outcome
        if not outcome:
            missing.append("passOutcome")
    if isinstance(event, ShotEventSchema):
        outcome = event.outcome
        if not outcome:
            missing.append("shotOutcome")

    minute_label = f"{int(event.minute)}'" if event.minute is not None else "unknown"

    observations_en = [
        f"Minute: {minute_label}",
        f"Event type: {event.type}",
        f"Team: {team or 'missing from event record'}",
        f"Player: {player or 'missing from event record'}",
    ]
    observations_ar = [
        f"الدقيقة: {minute_label}",
        f"نوع الحدث: {event.type}",
        f"الفريق: {team or 'ناقص من سجل الحدث'}",
        f"اللاعب: {player or 'ناقص من سجل الحدث'}",
    ]
    if receiver is not None or "receiver" in missing:
        observations_en.append(
            f"Receiver: {receiver or 'missing from event record'}"
        )
        observations_ar.append(
            f"المستلم: {receiver or 'ناقص من سجل الحدث'}"
        )
    if outcome:
        observations_en.append(f"Outcome: {outcome}")
        observations_ar.append(f"النتيجة: {outcome}")

    limitations_en = [
        "These fields come only from the selected seeded event and roster.",
        "No distances, speeds, possession, or tactics are invented.",
    ]
    limitations_ar = [
        "هذه الحقول من الحدث المحدد وقائمة اللاعبين فقط.",
        "لا تُختلق مسافات أو سرعات أو حيازة أو تكتيك.",
    ]
    if missing:
        limitations_en.append(f"Missing from event record: {', '.join(missing)}")
        limitations_ar.append(f"ناقص من سجل الحدث: {', '.join(missing)}")

    evidence = [
        AskEvidenceRef(
            kind="event",
            id=event.id,
            matchId=match.id,
            detail=event.type,
        )
    ]
    return (
        _localized(
            headline_en="Match-event facts for the selected moment",
            headline_ar="حقائق حدث المباراة للحظة المحددة",
            observations_en=observations_en,
            observations_ar=observations_ar,
            limitations_en=limitations_en,
            limitations_ar=limitations_ar,
            method="ask_crew_local_facts_v1",
        ),
        evidence,
        ["match_data"],
        missing,
    )


def _narrative_from_agents(
    db: Session,
    match_id: str,
    event_id: str,
) -> AskResponse:
    composed = build_match_intelligence_narrative(db, match_id, event_id)
    partial = composed.analysis.completeness.level != "complete" or any(
        item.evidenceValidationStatus != "verified"
        for item in composed.verificationResults
    )
    status: AskStatus = "partial" if partial else "answered"
    fact_classes: list[AskFactClass] = ["match_data", "calculated"]
    if composed.analysis.alternatives:
        fact_classes.append("alternative_estimate")
    if partial:
        fact_classes.append("unknown")

    return AskResponse(
        matchId=match_id,
        eventId=event_id,
        status=status,
        intent="narrative",
        provenance=composed.provenance,
        answer=AskAnswerBody(
            english=composed.narrative.english,
            arabic=composed.narrative.arabic,
        ),
        evidence=[
            AskEvidenceRef(
                kind="event",
                id=event_id,
                matchId=match_id,
                detail="decision_analysis_narrative",
            )
        ],
        relatedEventIds=[event_id],
        factClasses=fact_classes,
        reason=None,
        verificationResults=list(composed.verificationResults),
    )


def _verification_from_agents(
    db: Session,
    match_id: str,
    event_id: str,
) -> AskResponse:
    composed = build_match_intelligence_narrative(db, match_id, event_id)
    results = composed.verificationResults
    verified = sum(1 for r in results if r.evidenceValidationStatus == "verified")
    partial = sum(
        1 for r in results if r.evidenceValidationStatus == "partially_supported"
    )
    unsupported = sum(
        1 for r in results if r.evidenceValidationStatus == "unsupported"
    )
    answer = _localized(
        headline_en="Evidence checks for this decision moment",
        headline_ar="فحوص الأدلة لهذه اللحظة القرارية",
        observations_en=[
            f"Returned evidence checks: {len(results)}",
            f"Verified references/calculations: {verified}",
            f"Partially supported: {partial}",
            f"Unsupported: {unsupported}",
            composed.narrative.english.headline,
            *composed.narrative.english.keyObservations[:2],
        ],
        observations_ar=[
            f"فحوص الأدلة المعادة: {len(results)}",
            f"مراجع/حسابات موثّقة: {verified}",
            f"مدعوم جزئياً: {partial}",
            f"غير مدعوم: {unsupported}",
            composed.narrative.arabic.headline,
            *composed.narrative.arabic.keyObservations[:2],
        ],
        limitations_en=[
            "Evidence validation checks references and registered calculations only.",
            "claimSupportStatus remains not_assessed — natural-language truth is not certified.",
            *composed.narrative.english.limitations[:2],
        ],
        limitations_ar=[
            "التحقق يفحص المراجع والحسابات المسجّلة فقط.",
            "claimSupportStatus يبقى not_assessed — لا تُعتمد حقيقة اللغة الطبيعية.",
            *composed.narrative.arabic.limitations[:2],
        ],
        method="ask_crew_verification_v1",
    )
    status: AskStatus = (
        "partial"
        if partial or unsupported or composed.analysis.completeness.level != "complete"
        else "answered"
    )
    return AskResponse(
        matchId=match_id,
        eventId=event_id,
        status=status,
        intent="verification",
        provenance=composed.provenance,
        answer=answer,
        evidence=[
            AskEvidenceRef(
                kind="event",
                id=event_id,
                matchId=match_id,
                detail="verification_results",
            )
        ],
        relatedEventIds=[event_id],
        factClasses=["match_data", "calculated", "unknown"],
        reason=None,
        verificationResults=list(results),
    )


def _briefing_from_event_intelligence(
    db: Session,
    match_id: str,
    event_id: str,
) -> AskResponse:
    """Use the established event-intelligence path (optional Gemini enrichment)."""
    briefing = build_event_intelligence(db, match_id, event_id)
    status: AskStatus = "answered"
    fact_classes: list[AskFactClass] = ["match_data"]
    if any(s.tier == "metric" for s in briefing.statements):
        fact_classes.append("calculated")
    if any(s.tier in ("hypothesis", "missing") for s in briefing.statements):
        fact_classes.append("unknown")
        status = "partial"
    return AskResponse(
        matchId=match_id,
        eventId=event_id,
        status=status,
        intent="narrative",
        provenance=briefing.provenance,
        answer=AskAnswerBody(
            english=briefing.english,
            arabic=briefing.arabic,
        ),
        evidence=[
            AskEvidenceRef(
                kind="event",
                id=event_id,
                matchId=match_id,
                detail=(
                    "event_intelligence_llm"
                    if briefing.llmConnected
                    else "event_intelligence_deterministic"
                ),
            )
        ],
        relatedEventIds=[event_id],
        factClasses=fact_classes,
        reason=(
            "Answer uses the event-intelligence briefing"
            + (" with validated LLM wording." if briefing.llmConnected else ".")
        ),
        verificationResults=[],
    )


def answer_ask(
    db: Session,
    match_id: str,
    body: AskRequest,
) -> AskResponse:
    """Answer one Ask-the-Crew question for a match."""
    try:
        match = match_service.get_match(db, match_id)
    except match_service.MatchNotFoundError as exc:
        raise MatchNotFoundError(exc.match_id) from None

    question = body.question.strip()
    intent = classify_ask_intent(question)
    event_id = body.eventId
    event: MatchEventSchema | None = None
    if event_id:
        event = match_service.get_event(db, match_id, event_id)
        if event is None:
            raise EventNotFoundError(match_id, event_id)

    def finalize(
        response: AskResponse,
    ) -> AskResponse:
        return response.model_copy(
            update={"clientRequestId": body.clientRequestId},
        )

    if intent in ("greeting", "help"):
        return finalize(
            AskResponse(
                matchId=match_id,
                eventId=event_id,
                status="answered",
                intent=intent,
                provenance=match.provenance,
                answer=_capability_answer(),
                evidence=[],
                relatedEventIds=[event_id] if event_id else [],
                factClasses=["capability"],
                reason="Capability explanation — not unrestricted chat.",
            )
        )

    if intent == "unsupported":
        return finalize(
            AskResponse(
                matchId=match_id,
                eventId=event_id,
                status="unsupported",
                intent="unsupported",
                provenance=match.provenance,
                answer=_unsupported_answer(
                    "Ask the crew only answers greetings, selected-event facts, "
                    "decision narratives/evidence checks, or points you to WHAT IF.",
                    "الطاقم يجيب فقط على التحيات وحقائق الحدث المحدد وسرد/أدلة القرار "
                    "أو يوجّهك إلى ماذا لو.",
                ),
                evidence=[],
                relatedEventIds=[event_id] if event_id else [],
                factClasses=["capability", "unknown"],
                reason="Intent is outside the grounded ask contract.",
            )
        )

    if intent == "whatif":
        return finalize(
            AskResponse(
                matchId=match_id,
                eventId=event_id,
                status="unsupported",
                intent="whatif",
                provenance=match.provenance,
                answer=_unsupported_answer(
                    "Use Compare in WHAT IF / Decision Explorer for scored alternatives. "
                    "Ask the crew does not invent tactical counterfactuals.",
                    "استخدم قارن في ماذا لو / مستكشف القرار للبدائل المسجّلة. "
                    "الطاقم لا يخترع تكتيكات افتراضية.",
                ),
                evidence=[],
                relatedEventIds=[event_id] if event_id else [],
                factClasses=["capability", "alternative_estimate"],
                reason="WHAT IF belongs to Decision Explorer, not free-form ask.",
            )
        )

    if event is None:
        return finalize(
            AskResponse(
                matchId=match_id,
                eventId=None,
                status="unavailable",
                intent=intent,
                provenance=match.provenance,
                answer=_unsupported_answer(
                    "Select a LIVE moment first so the crew can ground the answer in an event.",
                    "اختر لحظة من مباشر أولاً حتى يبني الطاقم الإجابة على حدث.",
                ),
                evidence=[],
                relatedEventIds=[],
                factClasses=["unknown"],
                reason="eventId is required for this intent.",
            )
        )

    players = {
        p.id: p.name for p in match_service.list_players_for_match(db, match_id)
    }

    if intent == "local_facts":
        answer, evidence, fact_classes, _missing = _local_facts_answer(
            match=match, event=event, players=players
        )
        return finalize(
            AskResponse(
                matchId=match_id,
                eventId=event.id,
                status="answered",
                intent="local_facts",
                provenance=event.provenance,
                answer=answer,
                evidence=evidence,
                relatedEventIds=[event.id],
                factClasses=fact_classes,
                reason=None,
            )
        )

    is_decision = event.type in ANALYZABLE_TYPES

    if intent == "verification":
        if not is_decision:
            return finalize(
                AskResponse(
                    matchId=match_id,
                    eventId=event.id,
                    status="unavailable",
                    intent="verification",
                    provenance=event.provenance,
                    answer=_unsupported_answer(
                        "Evidence checks require a pass, shot, or carry decision candidate.",
                        "فحوص الأدلة تتطلب مرشّح قرار من نوع تمريرة أو تسديدة أو حمل.",
                    ),
                    evidence=[
                        AskEvidenceRef(
                            kind="event",
                            id=event.id,
                            matchId=match_id,
                            detail=event.type,
                        )
                    ],
                    relatedEventIds=[event.id],
                    factClasses=["unknown"],
                    reason="Selected event is not a decision candidate.",
                )
            )
        try:
            return finalize(_verification_from_agents(db, match_id, event.id))
        except InsufficientEvidenceError as exc:
            return finalize(
                AskResponse(
                    matchId=match_id,
                    eventId=event.id,
                    status="unavailable",
                    intent="verification",
                    provenance=event.provenance,
                    answer=_unsupported_answer(
                        f"Insufficient evidence for verification: {exc.reason}",
                        f"أدلة غير كافية للتحقق: {exc.reason}",
                    ),
                    evidence=[],
                    relatedEventIds=[event.id],
                    factClasses=["unknown"],
                    reason=exc.reason,
                )
            )

    # narrative (and related explain/why)
    if is_decision:
        try:
            return finalize(_narrative_from_agents(db, match_id, event.id))
        except InsufficientEvidenceError:
            # Fall through to event-intelligence briefing when analysis cannot run.
            pass

    return finalize(_briefing_from_event_intelligence(db, match_id, event.id))
