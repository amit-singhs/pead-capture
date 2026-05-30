import { runPythonJson } from "../services/pythonRunner.js";
import { FinancialAiExtractor } from "../ai/financialExtractor.js";

const scriptUrl = new URL("../../python/parser_service.py", import.meta.url);

export class PythonResultParser {
  constructor({ aiExtractor = new FinancialAiExtractor() } = {}) {
    this.aiExtractor = aiExtractor;
  }

  async parse(filing) {
    const result = await runPythonJson(scriptUrl, { filing }, 18000);
    return this.aiExtractor.enhance({
      filing,
      metrics: result.metrics || {}
    });
  }
}
