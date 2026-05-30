import { extractionInstructions, extractionSchema } from "../schema.js";

export const createAnthropicProvider = ({ apiKey, model, timeoutMs }) => ({
  name: "anthropic",
  model: model || "claude-3-5-haiku-latest",
  async extract(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1800,
          temperature: 0,
          system: extractionInstructions,
          messages: [{ role: "user", content: JSON.stringify(input) }],
          tools: [
            {
              name: "return_financial_result_extraction",
              description: "Return the extracted financial result JSON.",
              input_schema: extractionSchema
            }
          ],
          tool_choice: { type: "tool", name: "return_financial_result_extraction" }
        })
      });
      if (!response.ok) {
        const error = new Error(`Anthropic extraction failed: ${response.status}`);
        error.status = response.status;
        error.retryAfterMs = Number(response.headers.get("retry-after") || 0) * 1000;
        throw error;
      }
      const data = await response.json();
      const toolUse = (data?.content || []).find((part) => part.type === "tool_use");
      return toolUse?.input || {};
    } finally {
      clearTimeout(timer);
    }
  }
});
