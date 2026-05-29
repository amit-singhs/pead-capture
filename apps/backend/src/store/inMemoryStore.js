export class InMemoryStore {
  #filings = new Map();
  #signals = [];
  #errors = [];
  #pollStatus = null;

  hasFiling(id) {
    return this.#filings.has(id);
  }

  saveFiling(filing) {
    this.#filings.set(filing.id, filing);
  }

  saveSignal(signal) {
    this.#signals.unshift(signal);
    this.#signals = this.#signals.slice(0, 200);
  }

  saveError(error) {
    this.#errors.unshift(error);
    this.#errors = this.#errors.slice(0, 100);
  }

  savePollStatus(pollStatus) {
    this.#pollStatus = pollStatus;
  }

  latestSignalForSymbol(symbol) {
    return this.#signals.find((signal) => signal.symbol === symbol) || null;
  }

  snapshot() {
    const freshnessMs = Number(process.env.REPORT_FRESHNESS_HOURS || 5) * 60 * 60 * 1000;
    const now = Date.now();
    const filings = [...this.#filings.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return {
      filings: filings.slice(0, 100),
      freshFilings: filings
        .filter((filing) => now - new Date(filing.receivedAt).getTime() <= freshnessMs)
        .slice(0, 20),
      previousFilings: filings
        .filter((filing) => now - new Date(filing.receivedAt).getTime() > freshnessMs)
        .slice(0, 20),
      signals: this.#signals,
      errors: this.#errors,
      pollStatus: this.#pollStatus
    };
  }
}
