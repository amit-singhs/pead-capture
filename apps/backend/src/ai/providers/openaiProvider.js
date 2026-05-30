import { extractionInstructions, extractionSchema } from "../schema.js";

export const createOpenAiProvider = ({ apiKey, model, timeoutMs }) => ({
  name: "openai",
  model: model || "gpt-4o-mini",
  async extract(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          messages: [
            { role: "system", content: extractionInstructions },
            { role: "user", content: JSON.stringify(input) }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "financial_result_extraction",
              strict: true,
              schema: extractionSchema
            }
          }
        })
      });
      if (!response.ok) {
        const error = new Error(`OpenAI extraction failed: ${response.status}`);
        error.status = response.status;
        error.retryAfterMs = Number(response.headers.get("retry-after") || 0) * 1000;
        throw error;
      }
      const data = await response.json();
      return JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    } finally {
      clearTimeout(timer);
    }
  }
});
