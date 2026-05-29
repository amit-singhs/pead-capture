import { fetchBuffer } from "../utils/http.js";
import { spawn } from "node:child_process";
import { config } from "../config.js";

const percentAfter = (text, phrases) => {
  for (const phrase of phrases) {
    const pattern = new RegExp(`${phrase}[^\\d-]{0,32}(-?\\d+(?:\\.\\d+)?)\\s*%`, "i");
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
};

const croreAfter = (text, phrases) => {
  for (const phrase of phrases) {
    const pattern = new RegExp(`${phrase}[^\\d-]{0,32}(?:rs\\.?|inr)?\\s*(-?\\d+(?:,\\d{2,3})*(?:\\.\\d+)?)\\s*(?:crore|cr)`, "i");
    const match = text.match(pattern);
    if (match) return Number(match[1].replaceAll(",", ""));
  }
  return null;
};

const scriptPath = new URL("../../scripts/extract_pdf_text.py", import.meta.url);

const extractPdfText = (buffer) =>
  new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath, [scriptPath.pathname], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `PDF parser exited ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(buffer);
  });

const fallbackPdfText = (buffer) => {
  return buffer
    .toString("latin1")
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120_000);
};

export class ResultParser {
  async parse(filing) {
    const text = filing.inlineText || await this.#downloadText(filing);
    const normalized = text.toLowerCase();

    return {
      revenueGrowthPct: percentAfter(normalized, [
        "revenue from operations increased",
        "revenue increased",
        "total income increased",
        "sales increased"
      ]),
      profitGrowthPct: percentAfter(normalized, [
        "net profit increased",
        "profit after tax increased",
        "pat increased",
        "net profit grew"
      ]),
      epsGrowthPct: percentAfter(normalized, ["eps increased", "eps grew"]),
      ebitdaMarginChangePct: percentAfter(normalized, [
        "ebitda margin expanded by",
        "operating margin expanded by",
        "margin expanded by"
      ]),
      revenueCrore: croreAfter(normalized, ["revenue from operations", "total income", "revenue"]),
      profitCrore: croreAfter(normalized, ["net profit", "profit after tax", "pat"]),
      parserConfidence: filing.inlineText ? 0.92 : 0.72,
      extractionMode: filing.inlineText ? "inline-text" : "pdf-text-worker",
      textPreview: text.slice(0, 360)
    };
  }

  async #downloadText(filing) {
    if (!filing.attachmentUrl) return "";
    const buffer = await fetchBuffer(filing.attachmentUrl);
    try {
      return await extractPdfText(buffer);
    } catch {
      return fallbackPdfText(buffer);
    }
  }
}
