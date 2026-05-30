const state = {
  filings: [],
  freshFilings: [],
  previousFilings: [],
  signals: [],
  errors: [],
  pollStatus: null,
  activeSource: sessionStorage.getItem("pead.activeSource") || "NSE",
  signalFilter: sessionStorage.getItem("pead.signalFilter") || "ALL"
};

const $ = (selector) => document.querySelector(selector);

const formatDateTime = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));

const displayPublishedAt = (item) => item.portalPublishedAt || formatDateTime(item.receivedAt);

const formatLatency = (ms) => {
  if (!Number.isFinite(ms)) return "--";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
};

const timeAgo = (value) => {
  if (!value) return "--";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return { value: Math.max(1, Math.floor(diff / 1000)), unit: "s ago" };
  if (diff < 3_600_000) return { value: Math.floor(diff / 60_000), unit: "m ago" };
  return { value: Math.floor(diff / 3_600_000), unit: "h ago" };
};

const rollingAge = (value) => {
  if (!value) return "--";
  const age = timeAgo(value);
  return `
    <span class="time-ago" data-time="${value}">
      <span class="counter-number">${age.value}</span><span class="counter-unit">${age.unit}</span>
    </span>
  `;
};

const formatNumber = (value, suffix = "") => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
};

const formatMoney = (value, unit = "") => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  const formatted = Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `₹${formatted}${unit ? ` ${unit}` : " (unit not found)"}`;
};

const formatEps = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const scoreClass = (score) => {
  if (score >= 70) return "hot";
  if (score >= 55) return "warm";
  if (score <= 35) return "cold";
  return "neutral";
};

const byActiveSource = (item) => item.source === state.activeSource;

const bySignalFilter = (item) => state.signalFilter === "ALL" || item.action === state.signalFilter;
const activeSignals = () => state.signals.filter(byActiveSource).filter(bySignalFilter);
const activeFilings = (items) => items.filter(byActiveSource);

const persistLatestReports = () => {
  const latestBySource = {};
  for (const source of ["NSE", "BSE"]) {
    const latest = state.filings.find((filing) => filing.source === source);
    if (latest) latestBySource[source] = latest;
  }
  sessionStorage.setItem("pead.latestReports", JSON.stringify(latestBySource));
};

const persistVerificationSignals = () => {
  const compactSignals = state.signals.slice(0, 80);
  try {
    localStorage.setItem("pead.verifySignals", JSON.stringify(compactSignals));
  } catch {
    localStorage.removeItem("pead.verifySignals");
  }
};

const comparisonClass = (current, previous) => {
  if (current === null || current === undefined || previous === null || previous === undefined) return "";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
};

const metric = ({ label, current, previous, suffix = "", tip, formatter = formatNumber }) => `
  <div class="metric-pill tip ${comparisonClass(current, previous)}" data-tip="${tip}">
    <span>${label}</span>
    <strong>${formatter(current, suffix)}</strong>
    <small>Prev ${formatter(previous, suffix)}</small>
  </div>
`;

const aiStatus = (metrics = {}) => {
  if (metrics.ai?.used) {
    const confidence = Math.round((metrics.ai.confidence || 0) * 100);
    return `<span class="ai-badge verified">AI ${metrics.ai.provider} ${confidence}%</span>`;
  }
  if (metrics.ai?.error) {
    const label = String(metrics.ai.error).includes("429") ? "AI rate limited" : "AI failed";
    return `<span class="ai-badge failed">${label}</span>`;
  }
  if (metrics.ai?.reason) return `<span class="ai-badge muted">AI ${metrics.ai.reason}</span>`;
  return `<span class="ai-badge muted">Local parser</span>`;
};

const verifyUrl = (signal) => `/verify.html?id=${encodeURIComponent(signal.id)}`;

const renderSignals = () => {
  const root = $("#signals");
  const signals = activeSignals();
  if (!signals.length) {
    root.innerHTML = `<div class="empty">Awaiting the next ${state.activeSource} result filing.</div>`;
    return;
  }

  root.innerHTML = signals
    .map((signal) => `
      <article class="signal-card ${scoreClass(signal.score)}">
        <div class="signal-main">
          <div>
            <div class="symbol-row">
              <strong>${signal.symbol}</strong>
              <span class="source-badge ${signal.source.toLowerCase()}">${signal.source}</span>
              <span class="date-badge">${displayPublishedAt(signal)}</span>
              <span class="age-badge">${rollingAge(signal.receivedAt)}</span>
            </div>
            <h3>${signal.companyName}</h3>
            <p>${signal.title}</p>
          </div>
          <div class="score tip score-tip" data-tip="PEAD score summarizes whether the latest result looks stronger or weaker than the previous result.">
            <span>${signal.action}</span>
            <strong>${signal.score}</strong>
          </div>
        </div>
        <div class="metric-row">
          ${metric({
            label: "Revenue",
            current: signal.metrics.revenueCrore,
            previous: signal.previous?.revenueCrore,
            suffix: signal.metrics.amountUnit || "",
            formatter: formatMoney,
            tip: "Sales reported in the latest result compared with the previous quarter. Units follow the PDF table."
          })}
          ${metric({
            label: "Profit",
            current: signal.metrics.profitCrore,
            previous: signal.previous?.profitCrore,
            suffix: signal.metrics.amountUnit || "",
            formatter: formatMoney,
            tip: "Net profit in the latest result compared with the previous quarter. Units follow the PDF table."
          })}
          ${metric({
            label: "EPS",
            current: signal.metrics.eps,
            previous: signal.previous?.eps,
            formatter: formatEps,
            tip: "Profit earned per share, compared with the previous quarter."
          })}
          ${metric({
            label: "Revenue growth",
            current: signal.metrics.revenueGrowthPct,
            previous: 0,
            suffix: "%",
            tip: "Percentage change in sales versus the previous available result."
          })}
        </div>
        <div class="signal-foot">
          <span>Latency ${formatLatency(signal.latencyMs)}</span>
          <span>Confidence ${Math.round((signal.confidence || 0) * 100)}%</span>
          ${aiStatus(signal.metrics)}
          ${signal.metrics.extractionWarning ? `<span class="warning-note">${signal.metrics.extractionWarning}</span>` : ""}
          ${signal.attachmentUrl ? `<a href="${verifyUrl(signal)}" data-verify-signal="${encodeURIComponent(signal.id)}" target="_blank" rel="noreferrer">Verify with PDF</a>` : ""}
        </div>
      </article>
    `)
    .join("");
};

const renderFilings = () => {
  const root = $("#filings");
  const sourceFresh = activeFilings(state.freshFilings);
  const sourceAll = activeFilings(state.filings);
  const filings = sourceFresh.length ? sourceFresh : sourceAll;
  if (!filings.length) {
    const latestReports = JSON.parse(sessionStorage.getItem("pead.latestReports") || "{}");
    const latest = latestReports[state.activeSource];
    if (!latest) {
      root.innerHTML = `<div class="empty small">No ${state.activeSource} filings detected yet.</div>`;
      return;
    }
    root.innerHTML = filingCard(latest, "Last seen in this browser session");
    return;
  }

  root.innerHTML = filings
    .slice(0, 5)
    .map((filing) => filingCard(filing))
    .join("");
};

const filingCard = (filing, note = "") => `
  <article class="filing-item ${filing.extraClass || ""}">
    <div>
      <strong>${filing.symbol}</strong>
      <p>${filing.companyName}</p>
      ${note ? `<small class="session-note">${note}</small>` : ""}
    </div>
    <span class="source-badge ${filing.source.toLowerCase()}">${filing.source}</span>
    <time>${displayPublishedAt(filing)}</time>
    <small class="report-age">${rollingAge(filing.receivedAt)}</small>
    <div class="filing-links">
      ${filing.attachmentUrl ? `<a href="${filing.attachmentUrl}" target="_blank" rel="noreferrer">PDF</a>` : ""}
      ${filing.portalUrl ? `<a href="${filing.portalUrl}" target="_blank" rel="noreferrer">Portal</a>` : ""}
    </div>
  </article>
`;

const renderPreviousFilings = () => {
  const root = $("#previous-filings");
  const previousFilings = activeFilings(state.previousFilings);
  if (!previousFilings.length) {
    root.innerHTML = `<div class="empty small">Reports older than 5 hours will appear here.</div>`;
    return;
  }
  root.innerHTML = previousFilings
    .slice(0, 5)
    .map((filing) => filingCard({ ...filing, extraClass: "muted-item" }))
    .join("");
};

const renderErrors = () => {
  const root = $("#errors");
  if (!state.errors.length) {
    root.textContent = "No collector errors.";
    return;
  }
  root.innerHTML = state.errors
    .slice(0, 4)
    .map((error) => `<p><strong>${error.source || error.stage}</strong> ${error.message}</p>`)
    .join("");
};

const renderStats = () => {
  const signals = activeSignals();
  const filings = activeFilings(state.filings);
  $("#signal-count").textContent = signals.length;
  $("#filing-count").textContent = filings.length;
  $("#buy-count").textContent = signals.filter((item) => item.score >= 70).length;
  $("#last-poll").innerHTML = state.pollStatus ? rollingAge(state.pollStatus.at) : "--";
  const latest = signals[0];
  $("#latest-latency").textContent = latest ? formatLatency(latest.latencyMs) : "--";
  $("#last-updated").textContent = latest ? `Updated ${formatDateTime(latest.processedAt)}` : "Waiting for data";
};

const renderPollStatus = () => {
  const root = $("#poll-status");
  const poll = state.pollStatus;
  if (!poll) {
    root.textContent = "Waiting for first live poll.";
    return;
  }
  const found = activeFilings(state.freshFilings).length;
  const source = (poll.sources || []).find((item) => item.name === state.activeSource);
  const sourceText = (poll.sources || [])
    .map((source) => `${source.name}: ${source.ok ? `${source.count} found` : "failed"}`)
    .join(" · ");
  root.innerHTML = `
    <strong>Last checked ${rollingAge(poll.at)}</strong>
    <span>${found} ${state.activeSource} quarterly result report${found === 1 ? "" : "s"} found in the last 5 hours.</span>
    <small>${source ? `${source.name}: ${source.ok ? `${source.count} found` : "failed"}` : sourceText || "Live exchange poll completed."}</small>
  `;
};

const renderMarketTabs = () => {
  document.querySelectorAll(".market-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === state.activeSource);
  });
};

const renderFilterTabs = () => {
  document.querySelectorAll(".filter-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.signalFilter);
  });
};

const render = () => {
  renderStats();
  renderSignals();
  renderFilings();
  renderPreviousFilings();
  renderErrors();
  renderPollStatus();
  renderMarketTabs();
  renderFilterTabs();
  persistLatestReports();
  persistVerificationSignals();
  updateDynamicTimes();
};

const mergeUnique = (collection, item) => {
  if (collection.some((current) => current.id === item.id)) return collection;
  return [item, ...collection].slice(0, 200);
};

const applySnapshot = (snapshot) => {
  state.filings = snapshot.filings || [];
  state.freshFilings = snapshot.freshFilings || [];
  state.previousFilings = snapshot.previousFilings || [];
  state.signals = snapshot.signals || [];
  state.errors = snapshot.errors || [];
  state.pollStatus = snapshot.pollStatus || null;
  render();
};

const updateDynamicTimes = () => {
  document.querySelectorAll(".time-ago").forEach((element) => {
    const age = timeAgo(element.dataset.time);
    const number = element.querySelector(".counter-number");
    const unit = element.querySelector(".counter-unit");
    if (!number || !unit || age === "--") return;
    const nextValue = String(age.value);
    if (number.textContent !== nextValue) {
      number.textContent = nextValue;
      number.classList.remove("spin-up");
      void number.offsetWidth;
      number.classList.add("spin-up");
    }
    const nextUnit = age.unit;
    if (unit.textContent !== nextUnit) unit.textContent = nextUnit;
  });
};

const connect = () => {
  const dot = $("#connection-dot");
  const label = $("#connection-label");
  const events = new EventSource("/api/events");

  events.addEventListener("open", () => {
    dot.classList.add("online");
    label.textContent = "Live";
  });

  events.addEventListener("snapshot", (event) => {
    applySnapshot(JSON.parse(event.data));
  });

  events.addEventListener("filing", (event) => {
    const filing = JSON.parse(event.data);
    state.filings = mergeUnique(state.filings, filing);
    state.freshFilings = mergeUnique(state.freshFilings, filing);
    render();
  });

  events.addEventListener("signal", (event) => {
    state.signals = mergeUnique(state.signals, JSON.parse(event.data));
    render();
  });

  events.addEventListener("error-event", (event) => {
    state.errors = [JSON.parse(event.data), ...state.errors].slice(0, 100);
    render();
  });

  events.addEventListener("poll-status", (event) => {
    state.pollStatus = JSON.parse(event.data);
    render();
  });

  events.addEventListener("error", () => {
    dot.classList.remove("online");
    label.textContent = "Reconnecting";
  });
};

$("#refresh-button").addEventListener("click", async () => {
  const response = await fetch("/api/snapshot");
  applySnapshot(await response.json());
});

document.querySelectorAll(".market-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeSource = button.dataset.source;
    sessionStorage.setItem("pead.activeSource", state.activeSource);
    render();
  });
});

document.querySelectorAll(".filter-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.signalFilter = button.dataset.filter;
    sessionStorage.setItem("pead.signalFilter", state.signalFilter);
    render();
  });
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-verify-signal]");
  if (!link) return;
  const id = decodeURIComponent(link.dataset.verifySignal);
  const signal = state.signals.find((item) => item.id === id);
  if (!signal) return;
  try {
    localStorage.setItem(`pead.verifySignal.${id}`, JSON.stringify(signal));
    localStorage.setItem("pead.verifySignal.latest", JSON.stringify(signal));
  } catch {
    localStorage.removeItem(`pead.verifySignal.${id}`);
  }
});

connect();
render();
setInterval(updateDynamicTimes, 1000);
