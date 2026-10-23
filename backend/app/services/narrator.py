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

def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


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
    if analysis is not None:
        observed = analysis.observed
        if observed.compositeScore is not None:
            action = _ACTION_LABELS[observed.kind][1 if arabic else 0]
            score = str(observed.compositeScore)
            if analysis.scoringMethodId == SCORING_METHOD:
                rows.append(
                    f"درجة {action}: {score} ({SCORING_METHOD})."
                    if arabic
                    else f"{action.title()} score: {score} ({SCORING_METHOD})."
                )
            else:
                rows.append(
                    f"درجة {action}: {score} ({analysis.scoringMethodId})."
                    if arabic
                    else f"{action.title()} score: {score} ({analysis.scoringMethodId})."
                )

        top_rank = next((item for item in analysis.ranking if item.rank == 1), None)
        alternative = next(
            (item for item in analysis.alternatives if top_rank and item.actionId == top_rank.actionId),
            None,
        )
        if alternative is not None and alternative.compositeScore is not None:
            action = _ACTION_LABELS[alternative.kind][1 if arabic else 0]
            score = str(alternative.compositeScore)
            rows.append(
                f"أفضل بديل مسجل: {action}، بدرجة {score}."
                if arabic
                else f"Best ranked alternative: {action}, score {score}."
            )

    if pack.verificationResults:
        rows.append(
            "تم التحقق من مراجع الأدلة؛ ولم يُقيّم صدق الادعاء."
            if arabic
            else "Evidence references were checked; claim truth remains not assessed."
        )
    elif event is not None:
        outcome = _outcome_observation(pack, arabic=arabic)
        if outcome:
            rows.append(outcome)

    return _unique(rows)[:3]


def _limitations(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    analysis = pack.decisionAnalysis
    synthetic = (
        pack.match is not None and pack.match.provenance == "synthetic"
    ) or (pack.event is not None and pack.event.provenance == "synthetic")
    if analysis is None:
        return [
            "لا تتضمن حزمة الحقيقة تحليلاً للقرار، لذلك لا يُذكر تقييم أو بديل."
            if arabic
            else "No decision analysis was supplied, so no score or alternative is stated."
        ]
    if analysis.scoringMethodId == SCORING_METHOD:
        method_limit = (
            "الدرجة هندسية وليست احتمالاً، ومراجع الأدلة لا تثبت صدق الادعاء."
            if arabic and pack.verificationResults
            else "الدرجة الهندسية ليست احتمالاً ولا تثبت جودة القرار واقعياً."
            if arabic
            else "The geometric score is not a probability or proof of real-world decision quality."
        )
    else:
        method_limit = (
            "مراجع الأدلة لا تثبت صدق الادعاء."
            if arabic and pack.verificationResults
            else "التحليل يعكس البيانات المقدمة فقط."
            if arabic
            else "The analysis reflects only the supplied data."
        )
    if synthetic:
        method_limit = (
            "الدرجة هندسية وليست احتمالاً، والبيانات اصطناعية وليست إحصاءات رسمية."
            if arabic and analysis.scoringMethodId == SCORING_METHOD
            else "التحليل يعتمد بيانات اصطناعية وليست إحصاءات رسمية."
            if arabic
            else "The geometric score is not a probability; the data is synthetic, not official match statistics."
            if analysis.scoringMethodId == SCORING_METHOD
            else "The analysis uses synthetic data, not official match statistics."
        )
    return [method_limit]


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
