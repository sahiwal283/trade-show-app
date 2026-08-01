/**
 * insightNarrative — turns the joined ROI model into 2–4 plain-English
 * sentences an executive can act on. Every figure is computed strictly
 * from the model — nothing is invented, and sentences that lack data
 * simply don't render.
 */

import {
  RoiModel,
  RoiShowRow,
  CONV_DOUBLE_DOWN,
  MIN_LEADS_FOR_REASSESS,
  fmtMoneyCompact,
  fmtMult,
} from './roiData';

const MAX_INSIGHTS = 4;
/** Below this, unattributed revenue is noise not worth a callout. */
const MIN_UNATTRIBUTED_REVENUE = 1000;

const showLabel = (r: RoiShowRow) => `${r.name} ${r.year}`;

function bestRoiSentence(model: RoiModel): string | null {
  const best = model.ranked[0];
  if (!best || best.roi === null || best.roi <= 0 || best.revenue <= 0) return null;
  return (
    `${showLabel(best)} converted ${best.converted} of ${best.leads} ` +
    `lead${best.leads === 1 ? '' : 's'} into ${fmtMoneyCompact(best.revenue)} — ` +
    `highest ROI in the portfolio (${fmtMult(best.roi)}).`
  );
}

function followUpSentence(model: RoiModel, exclude: RoiShowRow | undefined): string | null {
  // Reassess-flagged shows get their own sentence — don't double-feature them
  const candidates = model.ranked.filter(
    (r) =>
      r !== exclude &&
      r.verdict !== 'reassess' &&
      r.leads >= MIN_LEADS_FOR_REASSESS &&
      r.convRate !== null &&
      r.convRate < CONV_DOUBLE_DOWN
  );
  if (candidates.length === 0) return null;
  const pick = candidates.reduce((a, b) => (b.leads - b.converted > a.leads - a.converted ? b : a));
  const conversions =
    pick.converted === 0
      ? 'no conversions yet'
      : `only ${pick.converted} conversion${pick.converted === 1 ? '' : 's'} so far`;
  return `${showLabel(pick)} has ${pick.leads} leads but ${conversions} — follow-up opportunity.`;
}

function reassessSentence(model: RoiModel): string | null {
  const flagged = model.ranked.filter((r) => r.verdict === 'reassess');
  if (flagged.length === 0) return null;
  if (flagged.length === 1) {
    const r = flagged[0];
    return (
      `${showLabel(r)} returned ${fmtMult(r.roi ?? 0)} on ${fmtMoneyCompact(r.invested)} ` +
      `invested — a candidate to renegotiate or cut.`
    );
  }
  const names = flagged.slice(0, 2).map(showLabel).join(' and ');
  const more = flagged.length > 2 ? ` (+${flagged.length - 2} more)` : '';
  return `${names}${more} returned less than $0.50 per dollar invested — candidates to renegotiate or cut.`;
}

function unattributedSentence(model: RoiModel): string | null {
  if (model.unattributedRevenue < MIN_UNATTRIBUTED_REVENUE) return null;
  return (
    `${fmtMoneyCompact(model.unattributedRevenue)} of converted-lead revenue has no show ` +
    `attribution — tag "Unknown Show" leads in the CRM to credit it.`
  );
}

function portfolioSentence(model: RoiModel): string | null {
  const p = model.portfolio;
  if (p.roi === null || p.matchedShowYears === 0) return null;
  return (
    `Across ${p.matchedShowYears} matched show-year${p.matchedShowYears === 1 ? '' : 's'}, ` +
    `${fmtMoneyCompact(p.invested)} invested has returned ${fmtMoneyCompact(p.revenue)} ` +
    `in attributed revenue (${fmtMult(p.roi)}).`
  );
}

function costOnlyInsights(model: RoiModel): string[] {
  if (model.rows.length === 0) return [];
  const out = [
    'No CRM lead data is matched to these shows yet — the ranking below reflects cost only.',
  ];
  const top = model.needsData[0];
  const total = model.portfolio.totalInvestedAllShows;
  if (top && total > 0) {
    const share = Math.round((top.invested / total) * 100);
    out.push(
      `${showLabel(top)} is the largest line item at ${fmtMoneyCompact(top.invested)} — ` +
        `${share}% of total trade show spend.`
    );
  }
  return out;
}

/** 2–4 decision-grade sentences, most important first. */
export function buildInsights(model: RoiModel): string[] {
  if (!model.hasLeadData) return costOnlyInsights(model);

  const best = model.ranked[0];
  const sentences = [
    bestRoiSentence(model),
    followUpSentence(model, best),
    reassessSentence(model),
    unattributedSentence(model),
  ].filter((s): s is string => s !== null);

  if (sentences.length < 2) {
    const fallback = portfolioSentence(model);
    if (fallback) sentences.push(fallback);
  }
  return sentences.slice(0, MAX_INSIGHTS);
}
