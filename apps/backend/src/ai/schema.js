const metricValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: ["number", "null"] },
    previousValue: { type: ["number", "null"] },
    rowLabel: { type: "string" },
    currentColumnLabel: { type: "string" },
    previousColumnLabel: { type: "string" },
    page: { type: ["number", "null"] },
    snippet: { type: "string" },
    confidence: { type: "number" }
  },
  required: [
    "value",
    "previousValue",
    "rowLabel",
    "currentColumnLabel",
    "previousColumnLabel",
    "page",
    "snippet",
    "confidence"
  ]
};

export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    containsQuarterlyResults: { type: "boolean" },
    resultType: { type: "string", enum: ["quarterly", "annual", "mixed", "not_results", "unknown"] },
    reportingBasis: { type: "string", enum: ["standalone", "consolidated", "both", "unknown"] },
    selectedBasis: { type: "string", enum: ["standalone", "consolidated", "unknown"] },
    periodLabel: { type: "string" },
    currency: { type: "string" },
    amountUnit: { type: "string", enum: ["crore", "lakh", "million", "thousand", "rupees", "unknown"] },
    metrics: {
      type: "object",
      additionalProperties: false,
      properties: {
        revenue: metricValueSchema,
        profitAfterTax: metricValueSchema,
        eps: metricValueSchema
      },
      required: ["revenue", "profitAfterTax", "eps"]
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    confidence: { type: "number" }
  },
  required: [
    "containsQuarterlyResults",
    "resultType",
    "reportingBasis",
    "selectedBasis",
    "periodLabel",
    "currency",
    "amountUnit",
    "metrics",
    "warnings",
    "confidence"
  ]
};

export const extractionInstructions = `You extract and verify Indian listed-company quarterly financial results.

Return only JSON that matches the schema. Use null when a value is not explicitly present.

Rules:
- Decide whether the filing contains quarterly financial results with revenue/income, profit, or EPS.
- Prefer consolidated numbers when both standalone and consolidated are present, otherwise use standalone.
- Use the latest quarter column, not year-to-date, unless the PDF only contains year numbers.
- Preserve the amount unit exactly as stated in the table: crore, lakh, million, thousand, rupees, or unknown.
- Revenue should usually come from "Revenue from operations", "Total income", or "Total revenue".
- Profit should be profit after tax / net profit after tax.
- EPS should be basic EPS unless only diluted EPS is available.
- Include page, row label, column label, and a short source snippet for every value.
- Do not invent numbers. If the page text is ambiguous, return null and explain in warnings.
- Flag suspicious extraction cases in warnings, such as missing units, annual-only reports, or unclear standalone/consolidated basis.`;
