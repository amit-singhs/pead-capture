import { config } from "../config.js";
import { createAnthropicProvider } from "./providers/anthropicProvider.js";
import { createGeminiProvider } from "./providers/geminiProvider.js";
import { createOpenAiProvider } from "./providers/openaiProvider.js";
import { mergeAiExtraction, stripAiCandidatePages } from "./normalizer.js";
import { sha256 } from "../utils/hash.js";
import { logger } from "../utils/logger.js";

const cache = new Map();
let activeAiRequests = 0;
const queuedAiRequests = [];
let nextAiAllowedAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withAiSlot = (task) =>
  new Promise((resolve, reject) => {
    const run = async () => {
      activeAiRequests += 1;
      try {
        const waitMs = Math.max(0, nextAiAllowedAt - Date.now());
        if (waitMs > 0) await sleep(waitMs);
        resolve(await task());
      } catch (error) {
        if (error.status === 429) {
          const cooldown = error.retryAfterMs || config.ai.rateLimitCooldownMs;
          nextAiAllowedAt = Math.max(nextAiAllowedAt, Date.now() + cooldown);
        }
        reject(error);
      } finally {
        activeAiRequests -= 1;
        const next = queuedAiRequests.shift();
        if (next) next();
      }
    };

    if (activeAiRequests < config.ai.concurrency) {
      run();
      return;
    }
    queuedAiRequests.push(run);
  });

const providerFactory = () => {
  const common = {
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    timeoutMs: config.ai.timeoutMs
  };
  if (config.ai.provider === "gemini") return createGeminiProvider(common);
  if (config.ai.provider === "openai") return createOpenAiProvider(common);
  if (config.ai.provider === "anthropic" || config.ai.provider === "claude") {
    return createAnthropicProvider(common);
  }
  return null;
};

const shouldUseAi = (metrics) => {
  if (!config.ai.apiKey || config.ai.provider === "disabled" || config.ai.extractionMode === "disabled") {
    return false;
  }
  if (config.ai.extractionMode === "always") return true;
  if (config.ai.extractionMode === "fallback") {
    const missingCore = metrics.revenueCrore === null || metrics.profitCrore === null || metrics.eps === null;
    const missingUnit = metrics.amountUnitMissing || !metrics.amountUnit;
    const lowConfidence = (metrics.parserConfidence || 0) < config.ai.minLocalConfidence;
    return missingCore || missingUnit || lowConfidence || Boolean(metrics.extractionWarning);
  }
  return false;
};

const compactPageText = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, config.ai.maxCharsPerPage);

const buildInput = ({ filing, metrics }) => ({
  filing: {
    source: filing.source,
    symbol: filing.symbol,
    companyName: filing.companyName,
    title: filing.title,
    receivedAt: filing.receivedAt,
    portalPublishedAt: filing.portalPublishedAt,
    attachmentUrl: filing.attachmentUrl
  },
  localExtraction: {
    amountUnit: metrics.amountUnit,
    revenue: metrics.revenueCrore,
    previousRevenue: metrics.previousRevenueCrore,
    profitAfterTax: metrics.profitCrore,
    previousProfitAfterTax: metrics.previousProfitCrore,
    eps: metrics.eps,
    previousEps: metrics.previousEps,
    confidence: metrics.parserConfidence,
    warnings: [metrics.extractionWarning].filter(Boolean)
  },
  candidatePages: (metrics.aiCandidatePages || [])
    .slice(0, config.ai.maxPages)
    .map((page) => ({
      page: page.page,
      text: compactPageText(page.text)
    }))
});

export class FinancialAiExtractor {
  constructor() {
    this.provider = providerFactory();
  }

  async enhance({ filing, metrics }) {
    if (!shouldUseAi(metrics)) return stripAiCandidatePages(metrics);
    if (!this.provider) return stripAiCandidatePages(metrics);
    if (!metrics.aiCandidatePages?.length) {
      return {
        ...stripAiCandidatePages(metrics),
        ai: {
          provider: config.ai.provider,
          model: config.ai.model,
          used: false,
          reason: "no-candidate-pages"
        }
      };
    }

    const input = buildInput({ filing, metrics });
    const cacheKey = sha256(JSON.stringify({
      provider: this.provider.name,
      model: this.provider.model,
      attachmentUrl: filing.attachmentUrl,
      input
    }));

    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const cooldownMs = Math.max(0, nextAiAllowedAt - Date.now());
    if (cooldownMs > 0) {
      return {
        ...stripAiCandidatePages(metrics),
        ai: {
          provider: this.provider.name,
          model: this.provider.model,
          used: false,
          error: `AI provider is rate-limited; skipped for ${Math.ceil(cooldownMs / 1000)}s cooldown`
        }
      };
    }

    try {
      const aiResult = await withAiSlot(() => this.provider.extract(input));
      const merged = stripAiCandidatePages(
        mergeAiExtraction({
          localMetrics: metrics,
          aiResult,
          provider: this.provider.name,
          model: this.provider.model
        })
      );
      cache.set(cacheKey, merged);
      logger.info("ai.extraction.completed", {
        provider: this.provider.name,
        model: this.provider.model,
        symbol: filing.symbol,
        containsQuarterlyResults: merged.isQuarterlyResult,
        confidence: merged.ai?.confidence
      });
      return merged;
    } catch (error) {
      logger.info("ai.extraction.failed", {
        provider: this.provider.name,
        symbol: filing.symbol,
        errorMessage: error.message,
        status: error.status || null,
        cooldownMs: error.status === 429 ? config.ai.rateLimitCooldownMs : 0
      });
      return {
        ...stripAiCandidatePages(metrics),
        ai: {
          provider: this.provider.name,
          model: this.provider.model,
          used: false,
          error: error.message
        }
      };
    }
  }
}
