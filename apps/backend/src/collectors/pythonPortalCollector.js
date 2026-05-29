import { runPythonJson } from "../services/pythonRunner.js";

const scriptUrl = new URL("../../python/polling_service.py", import.meta.url);

export class PythonPortalCollector {
  name = "PYTHON_EXCHANGE_POLLER";

  constructor({ eventBus }) {
    this.eventBus = eventBus;
  }

  async collect({ watchlist }) {
    const result = await runPythonJson(scriptUrl, {
      watchlist: [...watchlist]
    });
    const poll = {
      at: result.polledAt || new Date().toISOString(),
      durationMs: result.durationMs || 0,
      sources: result.sources || [],
      foundCount: result.filings?.length || 0
    };
    this.eventBus.emit("poll-status", poll);
    return result.filings || [];
  }
}
