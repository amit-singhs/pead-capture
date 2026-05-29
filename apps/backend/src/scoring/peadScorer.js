const contribution = (value, weight, cap) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(-cap, Math.min(cap, value)) * weight;
};

const actionFromScore = (score) => {
  if (score >= 70) return "BUY WATCH";
  if (score >= 55) return "POSITIVE";
  if (score <= 35) return "AVOID / SELL WATCH";
  return "NEUTRAL";
};

export class PeadScorer {
  score(filing, metrics, previousSignal = null) {
    const previous = {
      revenueCrore:
        metrics.previousRevenueCrore ?? previousSignal?.metrics?.revenueCrore ?? null,
      profitCrore:
        metrics.previousProfitCrore ?? previousSignal?.metrics?.profitCrore ?? null,
      eps:
        metrics.previousEps ?? previousSignal?.metrics?.eps ?? null,
      score: previousSignal?.score ?? null,
      receivedAt: previousSignal?.receivedAt ?? null,
      filingId: previousSignal?.filingId ?? null
    };
    const base = 50;
    const score = Math.round(
      base +
        contribution(metrics.revenueGrowthPct, 0.55, 25) +
        contribution(metrics.profitGrowthPct, 0.7, 35) +
        contribution(metrics.epsGrowthPct, 0.45, 25) +
        contribution(metrics.ebitdaMarginChangePct, 2.2, 5)
    );
    const bounded = Math.max(0, Math.min(100, score));

    return {
      id: `${filing.id}:signal`,
      filingId: filing.id,
      source: filing.source,
      symbol: filing.symbol,
      companyName: filing.companyName,
      title: filing.title,
      receivedAt: filing.receivedAt,
      processedAt: new Date().toISOString(),
      latencyMs: Date.now() - new Date(filing.receivedAt).getTime(),
      score: bounded,
      action: actionFromScore(bounded),
      confidence: metrics.parserConfidence,
      metrics,
      previous,
      attachmentUrl: filing.attachmentUrl
    };
  }
}
