"""Deterministic bilingual narration of a supplied Match Intelligence truth pack."""

from __future__ import annotations

from collections.abc import Iterable

from app.schemas.narrator import (
    LocalizedNarrative,
    MatchIntelligenceTruthPack,
    NarratorOutput,
)

SCORING_METHOD = "geometric_progression_v1"

_EVENT_LABELS = {
    "pass": ("pass", "تمريرة"),
    "carry": ("carry", "حمل الكرة"),
    "shot": ("shot", "تسديدة"),
    "tackle": ("tackle", "تدخل"),
    "pressure": ("pressure", "ضغط"),
    "possession_change": ("possession change", "تغيير الاستحواذ"),
}
_ACTION_LABELS = {
    "observed_pass": ("observed pass", "التمريرة المسجلة"),
    "observed_carry": ("observed carry", "حمل الكرة المسجل"),
    "observed_shot": ("observed shot", "التسديدة المسجلة"),
    "hypothetical_pass": ("hypothetical pass", "التمريرة الافتراضية"),
}
_OUTCOME_LABELS = {
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
}

_STANDARD_LIMITATION_TRANSLATIONS = {
    "Synthetic demo data — not official match statistics.": (
        "Synthetic demo data — not official match statistics.",
        "البيانات اصطناعية لأغراض العرض وليست إحصاءات رسمية للمباراة.",
    ),
    "Alternatives exist only for teammates present in an aligned frame.": (
        "Alternatives exist only for teammates present in an aligned frame.",
        "تتوفر البدائل فقط لزملاء الفريق الظاهرين في إطار متزامن.",
    ),
    "The aligned frame is sparse; teammates without a recorded position are not evaluated.": (
        "The aligned frame is sparse; teammates without a recorded position are not evaluated.",
        "الإطار المتزامن محدود؛ ولا يُقيَّم زملاء الفريق الذين لا تتوفر لهم مواقع مسجلة.",
    ),
    "No aligned frame is available for alternative destinations.": (
        "No aligned frame is available for alternative destinations.",
        "لا يتوفر إطار متزامن لتحديد وجهات بديلة.",
    ),
}


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _source_limitations(pack: MatchIntelligenceTruthPack) -> list[str]:
    analysis = pack.decisionAnalysis
    if analysis is None:
        return []
    values = list(analysis.limitations)
    values.extend(analysis.observed.limitations)
    for alternative in analysis.alternatives:
        values.extend(alternative.limitations)
    # The stable localized warning below is clearer and more precise than
    # copying the backend's overlapping scoring disclaimer verbatim.
    if analysis.scoringMethodId == SCORING_METHOD:
        values = [value for value in values if "not xG" not in value]
    return _unique(values)


def _headline(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> str:
    match = pack.match
    event = pack.event
    event_type = event.type if event is not None else (
        pack.decisionAnalysis.eventType if pack.decisionAnalysis is not None else None
    )
    label = _EVENT_LABELS.get(event_type or "", ("event", "الحدث"))[1 if arabic else 0]

    if match is not None:
        home = match.homeTeam.name
        away = match.awayTeam.name
        if arabic:
            return f"{home} × {away}: تحليل قرار {label}"
        return f"{home} vs {away}: {label.title()} decision"
    if event_type is not None:
        return f"تحليل قرار {label}" if arabic else f"Decision analysis: {label.title()}"
    if arabic:
        return "لا تتوفر بيانات كافية لإعداد السرد"
    return "Match narrative unavailable"


def _outcome_observation(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> str | None:
    event = pack.event
    if event is None:
        return None
    outcome = getattr(event, "outcome", None)
    localized = _OUTCOME_LABELS.get(event.type, {}).get(outcome)
    if localized is None:
        return None
    value = localized[1 if arabic else 0]
    if arabic:
        return f"تسجّل بيانات الحدث نتيجة الإجراء على أنها: {value}."
    return f"The supplied event record lists the outcome as {value}."


def _observations(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    rows: list[str] = []
    event = pack.event
    analysis = pack.decisionAnalysis

    if event is not None:
        label = _EVENT_LABELS[event.type][1 if arabic else 0]
        if arabic:
            rows.append(f"يتضمن سجل المباراة حدث {label} بالمعرّف {event.id}.")
        else:
            rows.append(f"The supplied match record contains a {label} event (ID {event.id}).")
        if event.minute is not None:
            rows.append(
                f"دقيقة الحدث المسجلة: {event.minute}." if arabic
                else f"Recorded event minute: {event.minute}."
            )
        outcome = _outcome_observation(pack, arabic=arabic)
        if outcome:
            rows.append(outcome)

    if analysis is not None:
        observed = analysis.observed
        if observed.compositeScore is not None:
            action = _ACTION_LABELS[observed.kind][1 if arabic else 0]
            score = str(observed.compositeScore)
            if analysis.scoringMethodId == SCORING_METHOD:
                rows.append(
                    f"سجلت {action} درجة تقدّم هندسي مركبة مقدارها {score} وفق {SCORING_METHOD}."
                    if arabic
                    else f"The {action} has a backend-returned geometric progression composite score of {score} under {SCORING_METHOD}."
                )
            else:
                rows.append(
                    f"سجلت {action} الدرجة المركبة {score} وفق طريقة {analysis.scoringMethodId}."
                    if arabic
                    else f"The {action} has a backend-returned composite score of {score} under {analysis.scoringMethodId}."
                )

        ranks = {item.actionId: item.rank for item in analysis.ranking}
        for alternative in analysis.alternatives:
            action = _ACTION_LABELS[alternative.kind][1 if arabic else 0]
            rank = ranks.get(alternative.actionId)
            rank_text = (
                f" بترتيب مُعاد من الخادم {rank}" if arabic and rank is not None
                else f" with backend-reported rank {rank}" if rank is not None
                else ""
            )
            if alternative.compositeScore is None:
                rows.append(
                    f"تتضمن الحزمة {action} لكن لا تتوفر لها درجة مركبة."
                    if arabic
                    else f"The supplied analysis includes a {action} alternative, but its composite score is unavailable."
                )
                continue
            score = str(alternative.compositeScore)
            if analysis.scoringMethodId == SCORING_METHOD:
                rows.append(
                    f"تتضمن الحزمة {action}{rank_text} بدرجة تقدّم هندسي مركبة مقدارها {score}."
                    if arabic
                    else f"The supplied analysis lists a {action} alternative{rank_text}, with a geometric progression composite score of {score}."
                )
            else:
                rows.append(
                    f"تتضمن الحزمة {action}{rank_text} بدرجة مركبة مقدارها {score} وفق {analysis.scoringMethodId}."
                    if arabic
                    else f"The supplied analysis lists a {action} alternative{rank_text}, with a composite score of {score} under {analysis.scoringMethodId}."
                )

    for result in pack.verificationResults:
        rows.append(
            f"تحقق الخادم من مراجع الأدلة بالحالة {result.evidenceValidationStatus}؛ ولم يُقيّم صدق الادعاء لغوياً."
            if arabic
            else f"Verifier evidence/reference validation is {result.evidenceValidationStatus}; claim truth remains not assessed."
        )

    return _unique(rows)


def _limitations(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    rows: list[str] = []
    analysis = pack.decisionAnalysis

    if pack.match is not None and pack.match.provenance == "synthetic":
        rows.append(
            "البيانات اصطناعية ولا تمثل سجلاً رسمياً لمباراة حقيقية."
            if arabic
            else "The supplied match data is synthetic, not an official real-match record."
        )
    elif pack.event is not None and pack.event.provenance == "synthetic":
        rows.append(
            "بيانات الحدث اصطناعية."
            if arabic
            else "The supplied event data is synthetic."
        )

    if analysis is not None:
        if analysis.scoringMethodId == SCORING_METHOD:
            rows.append(
                "درجة geometric_progression_v1 هندسية؛ وليست xG أو احتمال نجاح التمريرة، ولا تثبت جودة القرار في الواقع."
                if arabic
                else "geometric_progression_v1 is a geometric score, not xG or a pass-success probability, and it does not prove real-world decision quality."
            )
        if not analysis.completeness.hasAlignedFrame:
            rows.append(
                "لا يتوفر إطار متزامن في التحليل المقدم."
                if arabic
                else "The supplied analysis has no aligned frame."
            )
        if not analysis.alternatives:
            rows.append(
                "لا تتضمن الحزمة بدائل قابلة للمقارنة."
                if arabic
                else "No alternatives are included in the supplied analysis."
            )
        for source_limit in _source_limitations(pack):
            if arabic:
                localized = _STANDARD_LIMITATION_TRANSLATIONS.get(source_limit)
                rows.append(
                    localized[1]
                    if localized
                    else f"قيد وارد في حزمة الحقيقة (بالنص الأصلي): «{source_limit}»"
                )
            else:
                rows.append(source_limit)
    else:
        rows.append(
            "لا تتضمن حزمة الحقيقة تحليلاً للقرار، لذلك لا يُذكر تقييم أو بديل."
            if arabic
            else "The supplied truth pack contains no decision analysis, so no score or alternative is stated."
        )

    if pack.verificationResults:
        rows.append(
            "التحقق المتاح يراجع المراجع والحسابات فقط، ولا يقيّم صدق الصياغة الطبيعية."
            if arabic
            else "The available verifier checks references and calculations only; it does not assess natural-language truth."
        )
    if pack.unresolvedDetails:
        rows.append(
            "البيانات المقدمة لا تثبت التفاصيل المطلوبة غير المدعومة."
            if arabic
            else "The supplied data does not establish the requested unsupported detail."
        )
    if pack.event is None and analysis is None:
        rows.append(
            "لا يتضمن المصدر حدثاً أو تحليلاً يثبت تفاصيل خاصة بالحدث."
            if arabic
            else "The supplied truth pack contains no event or analysis to establish event-specific details."
        )
    return _unique(rows)


def narrate_truth_pack(pack: MatchIntelligenceTruthPack) -> NarratorOutput:
    """Render supplied match facts as concise English and Arabic narratives.

    This component is deterministic, does not call other services, and does not
    interpret claim statements as facts.
    """
    if not isinstance(pack, MatchIntelligenceTruthPack):
        pack = MatchIntelligenceTruthPack.model_validate(pack)

    return NarratorOutput(
        matchId=pack.match.id if pack.match else pack.decisionAnalysis.matchId if pack.decisionAnalysis else None,
        eventId=pack.event.id if pack.event else pack.decisionAnalysis.eventId if pack.decisionAnalysis else None,
        provenance=(
            pack.event.provenance if pack.event else
            pack.match.provenance if pack.match else
            pack.decisionAnalysis.provenance if pack.decisionAnalysis else None
        ),
        english=LocalizedNarrative(
            headline=_headline(pack, arabic=False),
            keyObservations=_observations(pack, arabic=False),
            limitations=_limitations(pack, arabic=False),
        ),
        arabic=LocalizedNarrative(
            headline=_headline(pack, arabic=True),
            keyObservations=_observations(pack, arabic=True),
            limitations=_limitations(pack, arabic=True),
        ),
    )
