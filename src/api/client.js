import { getRealtimeClientId } from "@/lib/realtimeClientId";

const rawApiBase = import.meta.env.VITE_API_BASE_URL;
let API_BASE;
if (rawApiBase) {
  const cleaned = rawApiBase.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
  if (cleaned.startsWith(":") || /^:\d+$/.test(cleaned)) {
    const host = (typeof window !== "undefined" && window.location && window.location.hostname) || "localhost";
    const proto = (typeof window !== "undefined" && window.location && window.location.protocol) || "http:";
    API_BASE = `${proto}//${host}${cleaned}/api`;
  } else {
    API_BASE = cleaned + "/api";
  }
} else {
  API_BASE = "/api";
}

export { API_BASE };

// Helpful runtime debug when devtools are open
try {
  // eslint-disable-next-line no-console
  console.debug("[api] API_BASE:", API_BASE);
} catch (e) {}

const isDev = import.meta.env.DEV === true;
const normalizePath = (path) => (path.startsWith("/") ? path : `/${path}`);
const buildRequestUrl = (path) => `${API_BASE.replace(/\/+$/, "")}${normalizePath(path)}`;
const buildDirectDevUrl = (path) => {
  const configuredTarget = import.meta.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:5000";
  let targetUrl;
  try {
    targetUrl = new URL(configuredTarget);
  } catch {
    return null;
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(targetUrl.hostname)) return null;

  const host = (typeof window !== "undefined" && window.location?.hostname) || "localhost";
  const port = targetUrl.port || (targetUrl.protocol === "https:" ? "443" : "80");
  const safeHost = host.includes(":") ? `[${host}]` : host;
  return `${targetUrl.protocol}//${safeHost}:${port}/api${normalizePath(path)}`;
};

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token && token !== "null" && token !== "undefined") {
    headers.Authorization = `Bearer ${token}`;
  }
  const realtimeClientId = getRealtimeClientId();
  if (realtimeClientId) headers["X-Client-Id"] = realtimeClientId;

  const maxRetries = options._retries || 3;
  let attempt = 0;
  let response;
  const normalizedPath = normalizePath(path);
  const requestUrl = buildRequestUrl(normalizedPath);

  while (attempt < maxRetries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(requestUrl, {
        ...options,
        headers,
      });

      if ((response.status === 502 || response.status === 503) && attempt < maxRetries - 1) {
        attempt += 1;
        // Give the Vite proxy or MongoDB connection time to become ready.
        await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt)));
        continue;
      }

      break;
    } catch (fetchError) {
      attempt += 1;
      const isLast = attempt >= maxRetries;
      if (isLast) {
        if (isDev && API_BASE === "/api" && typeof window !== "undefined") {
          const directDevUrl = buildDirectDevUrl(normalizedPath);
          if (directDevUrl) {
            try {
              // eslint-disable-next-line no-await-in-loop
              response = await fetch(directDevUrl, {
                ...options,
                headers,
              });
              break;
            } catch (directFetchError) {
              const message =
                directFetchError?.message === "Failed to fetch"
                  ? `Unable to connect to the backend server at ${directDevUrl}. Ensure the backend is running and try again.`
                  : directFetchError?.message || "Network error while connecting to the backend.";
              const error = new Error(message);
              error.cause = directFetchError;
              error.isNetworkError = true;
              throw error;
            }
          }
        }

        const message =
          fetchError?.message === "Failed to fetch"
            ? "Unable to connect to the server. Please ensure the backend is running and try again later."
            : fetchError?.message || "Network error while connecting to the API.";
        const error = new Error(message);
        error.cause = fetchError;
        error.isNetworkError = true;
        throw error;
      }
      // exponential backoff
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }

  if (response && response.status === 502 && isDev && API_BASE === "/api" && typeof window !== "undefined") {
    const directDevUrl = buildDirectDevUrl(normalizedPath);
    if (directDevUrl) {
      try {
        response = await fetch(directDevUrl, {
          ...options,
          headers,
        });
      } catch (directDevError) {
        const message =
          directDevError?.message === "Failed to fetch"
            ? `Unable to connect to the backend server at ${directDevUrl}. Ensure the backend is running and try again.`
            : directDevError?.message || "Network error while connecting to the backend.";
        const error = new Error(message);
        error.cause = directDevError;
        error.isNetworkError = true;
        throw error;
      }
    }
  }

  let data = {};
  let rawText = "";
  try {
    rawText = await response.text();
    data = rawText ? JSON.parse(rawText) : {};
  } catch (parseError) {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401 && data.code === "SESSION_REVOKED" && typeof window !== "undefined" && localStorage.getItem("token") === token) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:session-revoked"));
    }

    const errorMessage =
      data.message ||
      data.error ||
      (typeof data.details === "string" ? data.details : data.details?.message) ||
      rawText ||
      "API request failed";
    const error = new Error(errorMessage);
    error.response = response;
    error.data = data;
    const retryAfterSeconds = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      error.retryAfterSeconds = Math.ceil(retryAfterSeconds);
    }
    error.rawText = rawText;
    throw error;
  }

  return data;
}
