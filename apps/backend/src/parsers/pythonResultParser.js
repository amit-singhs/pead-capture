import { runPythonJson } from "../services/pythonRunner.js";

const scriptUrl = new URL("../../python/parser_service.py", import.meta.url);

export class PythonResultParser {
  async parse(filing) {
    const result = await runPythonJson(scriptUrl, { filing }, 18000);
    return result.metrics || {};
  }
}
