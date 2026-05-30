const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const params = new URLSearchParams(window.location.search);
const configuredBaseUrl =
  params.get("apiBaseUrl") ||
  window.__PEAD_CONFIG__?.apiBaseUrl ||
  localStorage.getItem("pead.apiBaseUrl") ||
  "";

const apiBaseUrl = normalizeBaseUrl(configuredBaseUrl);
if (params.has("apiBaseUrl")) {
  if (apiBaseUrl) localStorage.setItem("pead.apiBaseUrl", apiBaseUrl);
  else localStorage.removeItem("pead.apiBaseUrl");
}

export const apiUrl = (path) => `${apiBaseUrl}${path}`;

export const eventUrl = (path) => apiUrl(path);
