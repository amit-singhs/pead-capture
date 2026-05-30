import { extractionInstructions, extractionSchema } from "../schema.js";

const jsonFromGemini = (data) => {
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  return JSON.parse(text);
};

export const createGeminiProvider = ({ apiKey, model, timeoutMs }) => ({
  name: "gemini",
  model: model || "gemini-2.5-flash",
  async extract(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${extractionInstructions}\n\nInput:\n${JSON.stringify(input)}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseJsonSchema: extractionSchema
            }
          })
        }
      );
      if (!response.ok) {
        const error = new Error(`Gemini extraction failed: ${response.status}`);
        error.status = response.status;
        error.retryAfterMs = Number(response.headers.get("retry-after") || 0) * 1000;
        throw error;
      }
      return jsonFromGemini(await response.json());
    } finally {
      clearTimeout(timer);
    }
  }
});
