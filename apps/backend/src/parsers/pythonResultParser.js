import { runPythonJson } from "../services/pythonRunner.js";
import { FinancialAiExtractor } from "../ai/financialExtractor.js";

const scriptUrl = new URL("../../python/parser_service.py", import.meta.url);

export class PythonResultParser {
  constructor({ aiExtractor = new FinancialAiExtractor(), timeoutMs = 18000 } = {}) {
    this.aiExtractor = aiExtractor;
    this.timeoutMs = timeoutMs;
  }

  async parse(filing) {
    const result = await runPythonJson(scriptUrl, { filing }, this.timeoutMs);
    return this.aiExtractor.enhance({
      filing,
      metrics: result.metrics || {}
    });
  }
}
