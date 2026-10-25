"""Deterministic bilingual narration of a supplied Match Intelligence truth pack.

No external LLM. Distinguishes recorded facts, calculated metrics, and
hypothetical alternatives. Never invents players, outcomes, or causal links.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.schemas.narrator import (
    LocalizedNarrative,
    MatchIntelligenceTruthPack,
    NarratorOutput,
)

SCORING_METHOD = "geometric_progression_v1"
ANALYSIS_METHOD = "deterministic_evidence_templates_v2"

_EVENT_LABELS = {
    "pass": ("pass", "تمريرة"),
    "carry": ("carry", "حمل الكرة"),
    "shot": ("shot", "تسديدة"),
    "tackle": ("tackle", "تدخل"),
    "pressure": ("pressure", "ضغط"),
    "possession_change": ("possession change", "تغيير الاستحواذ"),
    "foul": ("foul", "خطأ"),
    "yellow_card": ("yellow card", "بطاقة صفراء"),
    "red_card": ("red card", "بطاقة حمراء"),
    "substitution": ("substitution", "تبديل"),
    "offside": ("offside", "تسلل"),
    "counterattack": ("counterattack", "هجمة مرتدة"),
    "reverse_attack": ("reverse attack", "هجوم معاكس"),
    "counter_press": ("counter-press", "ضغط مرتد"),
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
    "foul": {
        "conceded": ("conceded", "محتسب ضد"),
        "won": ("won", "محتسب لصالح"),
        "unknown": ("unknown", "غير محددة"),
    },
    "offside": {
        "flagged": ("flagged", "محتسب"),
        "unknown": ("unknown", "غير محددة"),
    },
}
_GOAL_TYPE_LABELS = {
    "open_play": ("open play", "لعب مفتوح"),
    "penalty": ("penalty", "ركلة جزاء"),
    "free_kick": ("free kick", "ركلة حرة"),
    "own_goal": ("own goal", "هدف عكسي"),
}


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _ctx(analysis: Any) -> dict[str, Any]:
    if analysis is None:
        return {}
    raw = getattr(analysis, "context", None)
    return raw if isinstance(raw, dict) else {}


def _event_type(pack: MatchIntelligenceTruthPack) -> str | None:
    if pack.event is not None:
        return pack.event.type
    if pack.decisionAnalysis is not None:
        return pack.decisionAnalysis.eventType
    return None


def _headline(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> str:
    match = pack.match
    event_type = _event_type(pack)
    label = _EVENT_LABELS.get(event_type or "", ("event", "الحدث"))[1 if arabic else 0]
    ctx = _ctx(pack.decisionAnalysis)
    outcome = ctx.get("outcome")
    is_goal = event_type == "shot" and outcome == "goal"

    if match is not None:
        home = match.homeTeam.name
        away = match.awayTeam.name
        if is_goal:
            return (
                f"{home} × {away}: هدف مسجّل"
                if arabic
                else f"{home} vs {away}: Goal"
            )
        if arabic:
            return f"{home} × {away}: ماذا حدث — {label}"
        return f"{home} vs {away}: What happened — {label.title()}"
    if event_type is not None:
        return f"تحليل {label}" if arabic else f"Event analysis: {label.title()}"
    if arabic:
        return "لا تتوفر بيانات كافية لإعداد السرد"
    return "Match narrative unavailable"


def _what_happened(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    rows: list[str] = []
    event = pack.event
    analysis = pack.decisionAnalysis
    ctx = _ctx(analysis)
    event_type = _event_type(pack)

    player = ctx.get("playerName")
    if not isinstance(player, str):
        player = None
    receiver = ctx.get("receiverName")
    if not isinstance(receiver, str):
        receiver = None
    assist = ctx.get("assistPlayerName")
    if not isinstance(assist, str):
        assist = None
    related = ctx.get("relatedPlayerName")
    if not isinstance(related, str):
        related = None
    minute = ctx.get("minute")
    outcome = ctx.get("outcome")
    goal_type = ctx.get("goalType")
    detail = ctx.get("detail")

    if event is not None:
        if player is None and event.playerId:
            player = event.playerId
        if minute is None:
            minute = event.minute
        if outcome is None:
            outcome = getattr(event, "outcome", None)
        if goal_type is None:
            goal_type = getattr(event, "goalType", None)
        if detail is None:
            detail = getattr(event, "detail", None)
        if receiver is None:
            receiver = getattr(event, "receiverId", None)
        if assist is None:
            assist = getattr(event, "assistPlayerId", None)
        if related is None:
            related = getattr(event, "relatedPlayerId", None)

    label = _EVENT_LABELS.get(event_type or "", ("event", "الحدث"))[1 if arabic else 0]

    if isinstance(minute, (int, float)):
        rows.append(
            f"في الدقيقة {minute:g}' سُجّل حدث {label}."
            if arabic
            else f"At minute {minute:g}', the log records a {label}."
        )
    else:
        rows.append(
            f"سُجّل حدث {label} دون دقيقة محددة في السجل."
            if arabic
            else f"A {label} is recorded without a minute on the log."
        )

    if player:
        rows.append(
            f"اللاعب الأساسي المسجّل: {player}."
            if arabic
            else f"Primary player on record: {player}."
        )
    else:
        rows.append(
            "لا يوجد لاعب أساسي مسجّل لهذا الحدث."
            if arabic
            else "No primary player is recorded for this event."
        )

    if event_type == "pass":
        if receiver:
            rows.append(
                f"المستلم المسجّل: {receiver}."
                if arabic
                else f"Recorded receiver: {receiver}."
            )
        outcome_l = _OUTCOME_LABELS.get("pass", {}).get(str(outcome or ""), None)
        if outcome_l:
            rows.append(
                f"نتيجة التمريرة المسجّلة: {outcome_l[1]}."
                if arabic
                else f"Recorded pass outcome: {outcome_l[0]}."
            )
        if detail == "key_pass":
            rows.append(
                "تفاصيل الحدث تصنّف التمريرة كمفتاحية."
                if arabic
                else "Event detail marks this pass as a key pass."
            )

    elif event_type == "shot":
        outcome_l = _OUTCOME_LABELS.get("shot", {}).get(str(outcome or ""), None)
        if outcome_l:
            rows.append(
                f"نتيجة التسديدة المسجّلة: {outcome_l[1]}."
                if arabic
                else f"Recorded shot outcome: {outcome_l[0]}."
            )
        if outcome == "goal":
            if goal_type == "own_goal":
                rows.append(
                    f"الهدف مسجّل كهدف عكسي{' بمشاركة ' + player if player else ''}."
                    if arabic
                    else f"Goal recorded as an own goal{f' involving {player}' if player else ''}."
                )
            elif player:
                rows.append(
                    f"المسجّل على السجل: {player}."
                    if arabic
                    else f"Scorer on record: {player}."
                )
            if assist:
                rows.append(
                    f"صانع الهدف المسجّل: {assist}."
                    if arabic
                    else f"Assist provider on record: {assist}."
                )
            elif goal_type == "penalty":
                rows.append(
                    "لا توجد صناعة هدف مسجّلة لركلة الجزاء."
                    if arabic
                    else "No assist is recorded for this penalty kick."
                )
            else:
                rows.append(
                    "صانع الهدف غير موجود في سجل هذا الهدف."
                    if arabic
                    else "Assist provider is not present on this goal record."
                )
        goal_l = _GOAL_TYPE_LABELS.get(str(goal_type or ""), None)
        if goal_l:
            rows.append(
                f"نوع الهدف/التسديدة المسجّل: {goal_l[1]}."
                if arabic
                else f"Recorded shot/goal type: {goal_l[0]}."
            )

    elif event_type == "carry":
        rows.append(
            "حدث حمل الكرة يعتمد على مسار البداية والنهاية المسجّلين."
            if arabic
            else "The carry uses the recorded start and end path on the log."
        )

    elif event_type == "foul" and related:
        rows.append(
            f"اللاعب المرتبط في سجل الخطأ: {related}."
            if arabic
            else f"Related player on the foul record: {related}."
        )

    elif event_type == "substitution" and related:
        rows.append(
            f"التبديل المسجّل: دخول {player or '—'} وخروج {related}."
            if arabic
            else f"Substitution on record: {player or '—'} on, {related} off."
        )

    return _unique(rows)[:5]


def _why_it_mattered(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    rows: list[str] = []
    analysis = pack.decisionAnalysis
    ctx = _ctx(analysis)
    event_type = _event_type(pack)
    outcome = ctx.get("outcome")

    if analysis is not None and analysis.observed.compositeScore is not None:
        observed = analysis.observed
        action = _ACTION_LABELS.get(observed.kind, ("observed action", "الإجراء المسجل"))[
            1 if arabic else 0
        ]
        score = str(observed.compositeScore)
        method = analysis.scoringMethodId
        rows.append(
            (
                f"[مقياس] درجة {action}: {score} ({method}). "
                f"هذه هندسة بنسبة الملعب وليست احتمالاً أو xG."
            )
            if arabic
            else (
                f"[Metric] {action.title()} score: {score} ({method}). "
                f"Pitch-percent geometry only — not probability or xG."
            )
        )

        nearest = ctx.get("nearest_opponent_distance")
        if isinstance(nearest, (int, float)):
            rows.append(
                (
                    f"[مقياس] أقرب منافس عند نقطة البداية في الإطار: "
                    f"{float(nearest):.2f} بنسبة الملعب."
                )
                if arabic
                else (
                    f"[Metric] Nearest opponent at the action origin in the aligned frame: "
                    f"{float(nearest):.2f} pitch percent."
                )
            )

    if event_type == "shot" and outcome == "goal":
        rows.append(
            "[حقيقة] ساهمت هذه التسديدة بهدف وفق حقل نتيجة الحدث."
            if arabic
            else "[Fact] This shot contributed a goal according to the event outcome field."
        )
    elif event_type == "shot" and outcome in ("saved", "blocked", "off_target"):
        rows.append(
            "[حقيقة] لم تتحول هذه التسديدة إلى هدف وفق النتيجة المسجّلة."
            if arabic
            else "[Fact] This shot did not become a goal according to the recorded outcome."
        )
    elif event_type == "pass" and outcome == "incomplete":
        rows.append(
            "[حقيقة] التمريرة غير المكتملة تعني أن الاستحواذ لم ينتقل بنجاح عبر هذا الحدث."
            if arabic
            else "[Fact] The incomplete pass means possession did not transfer successfully via this event."
        )
    elif event_type == "pass" and outcome == "complete":
        rows.append(
            "[حقيقة] التمريرة المكتملة حافظت على الاستحواذ وفق السجل."
            if arabic
            else "[Fact] The completed pass retained possession according to the log."
        )
    elif event_type in ("pressure", "counter_press"):
        rows.append(
            "[حقيقة] إجراء الضغط مسجّل كتأثير دفاعي على حامل الكرة في تلك اللحظة."
            if arabic
            else "[Fact] The pressing action is recorded as defensive pressure on the ball carrier at that moment."
        )
    elif event_type == "tackle" and outcome == "won":
        rows.append(
            "[حقيقة] التدخل الناجح مسجّل كاستعادة دفاعية للكرة."
            if arabic
            else "[Fact] The won tackle is recorded as a defensive regain."
        )

    verify_row = None
    if pack.verificationResults:
        verify_row = (
            "[حقيقة] تم التحقق من مراجع الأدلة؛ ولم يُقيّم صدق الادعاء النصي."
            if arabic
            else "[Fact] Evidence references were checked; claim wording truth remains not assessed."
        )

    if not rows and verify_row is None:
        rows.append(
            "لا تتوفر مقاييس محسوبة؛ يعتمد التفسير على حقول الحدث المسجّلة فقط."
            if arabic
            else "No calculated metrics are available; impact is described only from recorded event fields."
        )

    rows = _unique(rows)
    # Always keep verifier honesty visible when present (do not truncate it away).
    if verify_row is not None:
        rows = [row for row in rows if row != verify_row][:3] + [verify_row]
    return rows[:4]


def _what_could_have(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    rows: list[str] = []
    analysis = pack.decisionAnalysis

    if analysis is None:
        rows.append(
            "لا يتوفر تحليل قرار هندسي، لذلك لا تُذكر بدائل افتراضية."
            if arabic
            else "No geometric decision analysis was supplied, so no hypothetical alternatives are stated."
        )
        return rows

    top_rank = next((item for item in analysis.ranking if item.rank == 1), None)
    alternative = next(
        (
            item
            for item in analysis.alternatives
            if top_rank and item.actionId == top_rank.actionId
        ),
        None,
    )
    if alternative is not None and alternative.compositeScore is not None:
        action = _ACTION_LABELS.get(
            alternative.kind, ("hypothetical pass", "التمريرة الافتراضية")
        )[1 if arabic else 0]
        score = str(alternative.compositeScore)
        rows.append(
            (
                f"[افتراض] أفضل بديل في الإطار: {action} بدرجة {score}. "
                f"هذا ليس حدث مباراة مسجّلاً ولا يتنبأ بهدف أو نتيجة نهائية."
            )
            if arabic
            else (
                f"[Hypothesis] Best frame-backed alternative: {action}, score {score}. "
                f"Not a recorded match event; does not predict a goal or final score."
            )
        )
    elif not analysis.alternatives:
        rows.append(
            "[مفقود] لا تتوفر بدائل افتراضية مدعومة بإطار لهذه اللحظة."
            if arabic
            else "[Missing] No frame-backed hypothetical alternatives are available for this moment."
        )

    observed_rank = next(
        (
            item.rank
            for item in analysis.ranking
            if item.actionId == analysis.observed.actionId
        ),
        None,
    )
    if (
        observed_rank is not None
        and top_rank is not None
        and top_rank.rank == 1
        and top_rank.actionId != analysis.observed.actionId
    ):
        rows.append(
            (
                f"[افتراض] الإجراء المسجّل ترتيبه #{observed_rank} تحت {SCORING_METHOD}؛ "
                f"بديل إطار أفضل هندسياً موجود في الترتيب."
            )
            if arabic
            else (
                f"[Hypothesis] Observed action ranks #{observed_rank} under {SCORING_METHOD}; "
                f"a geometrically stronger frame alternative appears in the ranking."
            )
        )

    return _unique(rows)[:4]


def _limitations(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> list[str]:
    analysis = pack.decisionAnalysis
    synthetic = (
        pack.match is not None and pack.match.provenance == "synthetic"
    ) or (pack.event is not None and pack.event.provenance == "synthetic")

    rows = [
        (
            "تحليل حتمي مبني على الأدلة — لا يوجد مزوّد ذكاء اصطناعي خارجي متصل."
            if arabic
            else "Deterministic evidence-based analysis — no external AI provider is connected."
        )
    ]

    if analysis is None:
        rows.append(
            "لا تتضمن حزمة الحقيقة تحليلاً للقرار، لذلك لا يُذكر تقييم هندسي أو بديل."
            if arabic
            else "No decision analysis was supplied, so no geometric score or alternative is stated."
        )
        return rows[:3]

    if analysis.scoringMethodId == SCORING_METHOD:
        rows.append(
            "الدرجة الهندسية ليست احتمالاً ولا تثبت جودة القرار واقعياً."
            if arabic
            else "The geometric score is not a probability or proof of real-world decision quality."
        )
    if synthetic:
        rows.append(
            "البيانات اصطناعية وليست إحصاءات رسمية للمباراة."
            if arabic
            else "The data is synthetic, not official match statistics."
        )
    if pack.verificationResults:
        rows.append(
            "التحقق من المراجع لا يثبت صدق صياغة الادعاء."
            if arabic
            else "Reference checks do not establish natural-language claim truth."
        )
    return _unique(rows)[:3]


def _compose_locale(pack: MatchIntelligenceTruthPack, *, arabic: bool) -> LocalizedNarrative:
    what = _what_happened(pack, arabic=arabic)
    why = _why_it_mattered(pack, arabic=arabic)
    otherwise = _what_could_have(pack, arabic=arabic)
    observations = _unique([*what[:2], *why[:2], *otherwise[:2]])
    if pack.verificationResults:
        honesty = next(
            (
                row
                for row in why
                if "not assessed" in row.lower() or "لم يُقيّم" in row
            ),
            None,
        )
        if honesty is not None:
            observations = _unique([*observations, honesty])
    return LocalizedNarrative(
        headline=_headline(pack, arabic=arabic),
        keyObservations=observations[:6],
        limitations=_limitations(pack, arabic=arabic),
        whatHappened=what,
        whyItMattered=why,
        whatCouldHaveHappened=otherwise,
        analysisMethod=ANALYSIS_METHOD,
    )


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
        english=_compose_locale(pack, arabic=False),
        arabic=_compose_locale(pack, arabic=True),
    )
