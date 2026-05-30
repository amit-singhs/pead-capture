const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUnit = (value) => {
  const unit = String(value || "").trim().toLowerCase();
  if (["crore", "lakh", "million", "thousand", "rupees"].includes(unit)) return unit;
  if (unit === "lakhs" || unit === "lac" || unit === "lacs") return "lakh";
  if (unit === "crores") return "crore";
  return null;
};

const sanitizeEps = (value) => {
  const parsed = finiteNumber(value);
  if (parsed === null || Math.abs(parsed) > 10000) return null;
  return parsed;
};

const pctChange = (current, previous) => {
  if (current === null || previous === null || previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
};

const evidenceFromAiMetric = (metric) => {
  if (!metric || !metric.page) return null;
  return {
    page: Number(metric.page),
    snippet: String(metric.snippet || "").slice(0, 700),
    matchedLabels: [metric.rowLabel, metric.currentColumnLabel, metric.previousColumnLabel].filter(Boolean),
    locatorType: "ai-text-snippet",
    precision: "ai-page-and-snippet",
    note: "AI verified this metric against the rendered PDF page and table text."
  };
};

const confidenceAverage = (values) => {
  const clean = values.map(finiteNumber).filter((value) => value !== null);
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

export const mergeAiExtraction = ({ localMetrics, aiResult, provider, model }) => {
  const metrics = aiResult?.metrics || {};
  const revenue = metrics.revenue || {};
  const profit = metrics.profitAfterTax || {};
  const eps = metrics.eps || {};
  const amountUnit = normalizeUnit(aiResult?.amountUnit) || localMetrics.amountUnit || null;

  const revenueCurrent = finiteNumber(revenue.value) ?? localMetrics.revenueCrore ?? null;
  const revenuePrevious = finiteNumber(revenue.previousValue) ?? localMetrics.previousRevenueCrore ?? null;
  const profitCurrent = finiteNumber(profit.value) ?? localMetrics.profitCrore ?? null;
  const profitPrevious = finiteNumber(profit.previousValue) ?? localMetrics.previousProfitCrore ?? null;
  const epsCurrent = sanitizeEps(eps.value) ?? localMetrics.eps ?? null;
  const epsPrevious = sanitizeEps(eps.previousValue) ?? localMetrics.previousEps ?? null;

  const warnings = Array.isArray(aiResult?.warnings) ? aiResult.warnings.filter(Boolean) : [];
  const metricConfidence = confidenceAverage([
    aiResult?.confidence,
    revenue.confidence,
    profit.confidence,
    eps.confidence
  ]);
  const parserConfidence = Math.max(localMetrics.parserConfidence || 0, Math.min(0.97, metricConfidence || 0));

  return {
    ...localMetrics,
    isQuarterlyResult: Boolean(aiResult?.containsQuarterlyResults),
    resultType: aiResult?.resultType || localMetrics.resultType || "unknown",
    reportingBasis: aiResult?.reportingBasis || "unknown",
    selectedBasis: aiResult?.selectedBasis || "unknown",
    periodLabel: aiResult?.periodLabel || "",
    revenueCrore: revenueCurrent,
    previousRevenueCrore: revenuePrevious,
    profitCrore: profitCurrent,
    previousProfitCrore: profitPrevious,
    eps: epsCurrent,
    previousEps: epsPrevious,
    revenueGrowthPct: pctChange(revenueCurrent, revenuePrevious) ?? localMetrics.revenueGrowthPct ?? null,
    profitGrowthPct: pctChange(profitCurrent, profitPrevious) ?? localMetrics.profitGrowthPct ?? null,
    epsGrowthPct: pctChange(epsCurrent, epsPrevious) ?? localMetrics.epsGrowthPct ?? null,
    amountUnit,
    amountUnitMissing: !amountUnit && (revenueCurrent !== null || profitCurrent !== null),
    currency: aiResult?.currency || localMetrics.currency || "INR",
    evidence: {
      revenue: evidenceFromAiMetric(revenue) || localMetrics.evidence?.revenue || null,
      profit: evidenceFromAiMetric(profit) || localMetrics.evidence?.profit || null,
      eps: evidenceFromAiMetric(eps) || localMetrics.evidence?.eps || null
    },
    parserConfidence,
    extractionMode: `${localMetrics.extractionMode || "local"}+ai-${provider}`,
    ai: {
      provider,
      model,
      used: true,
      confidence: metricConfidence,
      warnings,
      candidatePageCount: localMetrics.aiCandidatePages?.length || 0
    },
    extractionWarning: warnings.length
      ? warnings.slice(0, 2).join(" ")
      : localMetrics.extractionWarning
  };
};

export const stripAiCandidatePages = (metrics) => {
  const { aiCandidatePages, ...rest } = metrics;
  return rest;
};
