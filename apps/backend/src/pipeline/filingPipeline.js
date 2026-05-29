import { logger } from "../utils/logger.js";

export class FilingPipeline {
  constructor({ store, eventBus, parser, scorer }) {
    this.store = store;
    this.eventBus = eventBus;
    this.parser = parser;
    this.scorer = scorer;
  }

  async process(filing) {
    if (this.store.hasFiling(filing.id)) return;

    this.store.saveFiling(filing);
    this.eventBus.emit("filing", filing);
    logger.info("filing.detected", {
      source: filing.source,
      symbol: filing.symbol,
      title: filing.title
    });

    try {
      const metrics = await this.parser.parse(filing);
      const previousSignal = this.store.latestSignalForSymbol(filing.symbol);
      const signal = this.scorer.score(filing, metrics, previousSignal);
      this.store.saveSignal(signal);
      this.eventBus.emit("signal", signal);
      logger.info("signal.created", {
        symbol: signal.symbol,
        score: signal.score,
        action: signal.action,
        latencyMs: signal.latencyMs
      });
    } catch (error) {
      this.recordError({
        stage: "pipeline",
        source: filing.source,
        symbol: filing.symbol,
        message: error.message,
        at: new Date().toISOString()
      });
    }
  }

  recordError(error) {
    this.store.saveError(error);
    this.eventBus.emit("error-event", error);
  }

  recordPollStatus(pollStatus) {
    this.store.savePollStatus(pollStatus);
  }
}
