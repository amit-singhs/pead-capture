import { apiUrl } from "./runtime.js";

const params = new URLSearchParams(window.location.search);
const signalId = params.get("id");
const content = document.querySelector("#verify-content");
const title = document.querySelector("#verify-title");
const subtitle = document.querySelector("#verify-subtitle");

const metricLabels = {
  revenue: "Revenue",
  profit: "Profit",
  eps: "EPS",
  revenueGrowth: "Revenue growth"
};

const metricEvidenceKey = {
  revenue: "revenue",
  profit: "profit",
  eps: "eps",
  revenueGrowth: "revenue"
};

const formatMoney = (value, unit = "") => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
};

const formatEps = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatPct = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
};

const comparisonClass = (current, previous) => {
  if (current === null || current === undefined || previous === null || previous === undefined) return "";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
};

const searchTermFor = (evidence) => {
  if (!evidence) return "";
  if (Array.isArray(evidence.matchedLabels) && evidence.matchedLabels.length) {
    return evidence.matchedLabels[0];
  }
  return (evidence.snippet || "").split(" ").slice(0, 5).join(" ");
};

const pdfUrlFor = (baseUrl, evidence) => {
  if (!baseUrl) return "";
  const proxiedUrl = apiUrl(`/api/pdf?url=${encodeURIComponent(baseUrl)}`);
  const hashParts = [];
  if (evidence?.page) hashParts.push(`page=${evidence.page}`);
  const searchTerm = searchTermFor(evidence);
  if (searchTerm) hashParts.push(`search=${encodeURIComponent(searchTerm)}`);
  return hashParts.length ? `${proxiedUrl}#${hashParts.join("&")}` : proxiedUrl;
};

const pageImageUrlFor = (baseUrl, evidence) => {
  if (!baseUrl) return "";
  const page = evidence?.page || 1;
  const searchTerm = searchTermFor(evidence);
  const search = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : "";
  return apiUrl(`/api/pdf-page?url=${encodeURIComponent(baseUrl)}&page=${encodeURIComponent(page)}${search}`);
};

const evidenceCard = (key, evidence) => {
  if (!evidence) {
    return `
      <article class="evidence-card" data-evidence="${key}">
        <span>${metricLabels[key] || key}</span>
        <strong>No source snippet found</strong>
        <p>The metric is visible on the dashboard, but the parser could not isolate a precise row in the text layer.</p>
      </article>
    `;
  }
  return `
    <article class="evidence-card" data-evidence="${key}">
      <span>${metricLabels[key] || key}</span>
      <strong>Page ${evidence.page}</strong>
      <p>${evidence.snippet}</p>
      <small>${evidence.note || "Source text found in the report PDF."}</small>
    </article>
  `;
};

const metricCard = ({ key, label, value, previous, trend = "", description }) => `
  <button class="verify-metric ${trend}" data-metric="${key}" type="button" aria-label="Show ${label} source evidence">
    <span>${label}</span>
    <strong>${value}</strong>
    <small>Prev ${previous}</small>
    <em>${description}</em>
  </button>
`;

const selectMetric = (key, signal) => {
  document.querySelectorAll(".verify-metric").forEach((item) => {
    item.classList.toggle("active", item.dataset.metric === key);
  });
  document.querySelectorAll(".evidence-card").forEach((item) => {
    item.classList.toggle("active", item.dataset.evidence === key);
  });

  const evidenceKey = metricEvidenceKey[key] || key;
  const evidence = signal.metrics.evidence?.[evidenceKey];
  const banner = document.querySelector("#active-evidence");
  const pageImage = document.querySelector("#pdf-page-image");
  const pageLabel = document.querySelector("#pdf-page-label");
  const fallback = document.querySelector("#pdf-fallback");
  const stage = document.querySelector(".pdf-stage");
  if (banner) {
    banner.innerHTML = evidence
      ? `<strong>${metricLabels[key]} source: Page ${evidence.page}</strong><span>${evidence.snippet}</span>`
      : `<strong>${metricLabels[key]} source</strong><span>Exact row was not found in the PDF text layer. Please review the embedded report manually.</span>`;
  }
  if (pageImage && signal.attachmentUrl) {
    pageImage.classList.remove("loaded", "failed");
    pageImage.src = pageImageUrlFor(signal.attachmentUrl, evidence);
    pageImage.alt = evidence
      ? `${metricLabels[key]} source on page ${evidence.page} of the original report PDF`
      : `${metricLabels[key]} source page from the original report PDF`;
  }
  if (pageLabel) {
    pageLabel.textContent = evidence?.page ? `Showing PDF page ${evidence.page}` : "Showing PDF page 1";
  }
  if (stage) {
    stage.classList.toggle("has-evidence", Boolean(evidence));
  }
  if (fallback) {
    fallback.href = pdfUrlFor(signal.attachmentUrl, evidence);
  }
};

const renderSignal = (signal) => {
  const metrics = signal.metrics || {};
  const unit = metrics.amountUnit || "";
  const evidence = metrics.evidence || {};
  title.textContent = signal.companyName;
  subtitle.textContent = `${signal.symbol} · ${signal.source} · ${signal.title}`;

  content.innerHTML = `
    <section class="verify-summary">
      ${metricCard({
        key: "revenue",
        label: "Revenue",
        value: formatMoney(metrics.revenueCrore, unit),
        previous: formatMoney(signal.previous?.revenueCrore, unit),
        trend: comparisonClass(metrics.revenueCrore, signal.previous?.revenueCrore),
        description: "Hover or focus to reveal where this came from."
      })}
      ${metricCard({
        key: "profit",
        label: "Profit",
        value: formatMoney(metrics.profitCrore, unit),
        previous: formatMoney(signal.previous?.profitCrore, unit),
        trend: comparisonClass(metrics.profitCrore, signal.previous?.profitCrore),
        description: "Matched against profit rows in the report."
      })}
      ${metricCard({
        key: "eps",
        label: "EPS",
        value: formatEps(metrics.eps),
        previous: formatEps(signal.previous?.eps),
        trend: comparisonClass(metrics.eps, signal.previous?.eps),
        description: "Per-share value from the PDF table."
      })}
      ${metricCard({
        key: "revenueGrowth",
        label: "Revenue growth",
        value: formatPct(metrics.revenueGrowthPct),
        previous: "0%",
        trend: comparisonClass(metrics.revenueGrowthPct, 0),
        description: "Calculated from current and previous revenue."
      })}
    </section>

    <section class="verify-workspace">
      <div class="evidence-panel">
        <div id="active-evidence" class="active-evidence"></div>
        ${evidenceCard("revenue", evidence.revenue)}
        ${evidenceCard("profit", evidence.profit)}
        ${evidenceCard("eps", evidence.eps)}
        <article class="evidence-card" data-evidence="revenueGrowth">
          <span>Revenue growth</span>
          <strong>Calculated metric</strong>
          <p>Revenue growth is recalculated from the extracted current revenue and previous revenue values.</p>
          <small>Hover Revenue to inspect the source values used for this calculation.</small>
        </article>
      </div>
      <div class="pdf-panel">
        <div class="pdf-toolbar">
          <div>
            <strong>Rendered source page</strong>
            <span id="pdf-page-label">Preparing PDF page</span>
          </div>
          <a href="${signal.attachmentUrl}" target="_blank" rel="noreferrer">Open original PDF</a>
        </div>
        <div class="pdf-stage">
          <img id="pdf-page-image" class="pdf-page-image" alt="Rendered page from report PDF" />
          <div id="pdf-render-failed" class="pdf-render-failed">
            <strong>PDF page render failed</strong>
            <span>The original PDF is still available, but this environment could not render the page preview.</span>
            <a id="pdf-fallback" href="${pdfUrlFor(signal.attachmentUrl, evidence.revenue)}" target="_blank" rel="noreferrer">Open proxied PDF</a>
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll(".verify-metric").forEach((item) => {
    const activate = () => selectMetric(item.dataset.metric, signal);
    item.addEventListener("mouseenter", activate);
    item.addEventListener("focus", activate);
    item.addEventListener("click", activate);
  });

  const pageImage = document.querySelector("#pdf-page-image");
  if (pageImage) {
    pageImage.addEventListener("load", () => pageImage.classList.add("loaded"));
    pageImage.addEventListener("error", () => pageImage.classList.add("failed"));
  }

  selectMetric("revenue", signal);
};

const cachedSignal = () => {
  if (!signalId) return null;
  try {
    const direct = localStorage.getItem(`pead.verifySignal.${signalId}`);
    if (direct) return JSON.parse(direct);
    const signals = JSON.parse(localStorage.getItem("pead.verifySignals") || "[]");
    return signals.find((signal) => signal.id === signalId) || null;
  } catch {
    return null;
  }
};

const fetchSignalFromApi = async () => {
  const response = await fetch(apiUrl(`/api/signals/${encodeURIComponent(signalId)}`));
  if (response.ok) {
    const { signal } = await response.json();
    return signal;
  }
  const snapshotResponse = await fetch(apiUrl("/api/snapshot"));
  if (!snapshotResponse.ok) return null;
  const snapshot = await snapshotResponse.json();
  return (snapshot.signals || []).find((signal) => signal.id === signalId) || null;
};

const load = async () => {
  if (!signalId) {
    content.innerHTML = `<div class="empty">Missing signal id. Go back to the dashboard and open Verify with PDF again.</div>`;
    return;
  }

  let signal = cachedSignal();
  if (!signal) signal = await fetchSignalFromApi();

  if (!signal) {
    content.innerHTML = `<div class="empty">This signal is not available yet. Keep the dashboard tab open, then click Verify with PDF again.</div>`;
    return;
  }

  renderSignal(signal);
};

load();
