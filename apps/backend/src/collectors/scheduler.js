import { logger } from "../utils/logger.js";

const jitter = (base) => Math.round(base * (0.85 + Math.random() * 0.3));

export class CollectorScheduler {
  #timer = null;
  #running = false;

  constructor({ collectors, pipeline, config }) {
    this.collectors = collectors;
    this.pipeline = pipeline;
    this.config = config;
    this.watchlist = new Set(config.watchlist);
  }

  start() {
    logger.info("collector.scheduler.started", {
      collectors: this.collectors.map((collector) => collector.name),
      mode: this.config.mode,
      watchlist: [...this.watchlist]
    });
    this.#tick();
  }

  stop() {
    clearTimeout(this.#timer);
  }

  async #tick() {
    if (this.#running) return;
    this.#running = true;
    const started = performance.now();

    await Promise.all(
      this.collectors.map(async (collector) => {
        try {
          const filings = await collector.collect({ watchlist: this.watchlist });
          await Promise.all(filings.map((filing) => this.pipeline.process(filing)));
          logger.debug("collector.completed", {
            source: collector.name,
            count: filings.length
          });
        } catch (error) {
          logger.warn("collector.failed", {
            source: collector.name,
            error: error.message
          });
          this.pipeline.recordError({
            stage: "collect",
            source: collector.name,
            message: error.message,
            at: new Date().toISOString()
          });
        }
      })
    );

    this.#running = false;
    const elapsed = Math.round(performance.now() - started);
    this.#timer = setTimeout(() => this.#tick(), jitter(this.config.pollIntervalMs));
    logger.debug("collector.tick.finished", { elapsed });
  }
}
