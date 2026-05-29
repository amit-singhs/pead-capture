import { sha256 } from "../utils/hash.js";

const companies = [
  ["RELIANCE", "Reliance Industries"],
  ["TCS", "Tata Consultancy Services"],
  ["INFY", "Infosys"],
  ["HDFCBANK", "HDFC Bank"],
  ["ICICIBANK", "ICICI Bank"]
];

export class MockCollector {
  name = "MOCK";
  #cursor = 0;

  async collect({ watchlist }) {
    const [symbol, companyName] = companies[this.#cursor % companies.length];
    this.#cursor += 1;
    if (watchlist.size && !watchlist.has(symbol)) return [];

    const now = new Date();
    const revenueGrowth = 8 + Math.round(Math.random() * 18);
    const profitGrowth = 5 + Math.round(Math.random() * 32);
    const epsGrowth = 4 + Math.round(Math.random() * 25);
    const text = `
      ${companyName} announces unaudited financial results for the quarter.
      Revenue from operations increased ${revenueGrowth}% year on year.
      Net profit increased ${profitGrowth}% year on year.
      EBITDA margin expanded by ${Math.round(Math.random() * 220) / 100}%.
      EPS increased ${epsGrowth}%.
    `;

    return [
      {
        id: sha256(["MOCK", symbol, now.toISOString(), text].join("|")),
        source: "MOCK",
        symbol,
        companyName,
        title: "Quarterly financial results",
        receivedAt: now.toISOString(),
        disseminatedAt: now.toISOString(),
        attachmentUrl: null,
        inlineText: text,
        raw: { simulated: true }
      }
    ];
  }
}
