"use strict";

const { version: PACKAGE_VERSION } = require("../package.json");

const DEFAULT_API_URL = "https://scraperapi.thordata.com/request";
const DEFAULT_TIMEOUT_MS = 30_000;
const INTEGRATION_PLATFORM = "langchain";
const INTEGRATION_SOURCE = "javascript-sdk";

const SUPPORTED_ENGINES = Object.freeze([
  "google",
  "google_search",
  "google_light",
  "google_web",
  "google_images",
  "google_videos",
  "google_news",
  "google_shopping",
  "google_local",
  "google_places",
  "google_product",
  "google_lens",
  "google_trends",
  "google_maps",
  "google_hotels",
  "google_jobs",
  "google_scholar",
  "google_scholar_cite",
  "google_scholar_author",
  "google_play",
  "google_play_product",
  "google_play_games",
  "google_play_movies",
  "google_play_books",
  "google_finance",
  "google_finance_markets",
  "google_flights",
  "google_patents",
  "google_patents_details",
  "google_ai_mode",
  "bing",
  "bing_images",
  "bing_videos",
  "bing_news",
  "bing_shopping",
  "bing_maps",
  "yandex",
  "duckduckgo",
]);

const ENGINE_ALIASES = Object.freeze({
  google_search: "google",
  google_places: "google_local",
});

const WEB_SCRAPER_ENGINES = new Set(["google_webpage", "webpage"]);

// Fields currently read by Controllers.Request in acen-serp-api-server.
const REQUEST_PARAMETERS = new Set([
  "adlt",
  "adults",
  "after",
  "age",
  "ai_overview",
  "all_reviews",
  "amenities",
  "apps_category",
  "arrival_id",
  "as_rr",
  "as_sdt",
  "as_vis",
  "as_yhi",
  "as_ylo",
  "aspect",
  "assignee",
  "author_id",
  "bags",
  "bathrooms",
  "bedrooms",
  "before",
  "booking_token",
  "books_category",
  "brands",
  "cat",
  "cc",
  "chart",
  "check_in_date",
  "check_out_date",
  "children",
  "children_ages",
  "chips",
  "citation_id",
  "cites",
  "cluster",
  "clustered",
  "color2",
  "count",
  "country",
  "cp",
  "cr",
  "currency",
  "data",
  "data_cid",
  "data_format",
  "data_type",
  "date",
  "deep_search",
  "departure_id",
  "departure_token",
  "device",
  "df",
  "direct_link",
  "dups",
  "eco_certified",
  "efirst",
  "emissions",
  "end_date",
  "exclude_airlines",
  "exclude_conns",
  "engine",
  "face",
  "filter",
  "filters",
  "first",
  "free_cancellation",
  "free_shipping",
  "full",
  "games_category",
  "geo",
  "gl",
  "google_domain",
  "group",
  "hl",
  "hotel_class",
  "ibp",
  "image_color",
  "image_type",
  "imagesize",
  "imgar",
  "imgsz",
  "include_airlines",
  "index_market",
  "infants_in_seat",
  "infants_on_lap",
  "input_proxy",
  "integration_platform",
  "integration_source",
  "inventor",
  "isjson",
  "is_logs",
  "json",
  "kgmid",
  "kl",
  "kp",
  "lang",
  "language",
  "lat",
  "layover_duration",
  "length",
  "license",
  "licenses",
  "litigation",
  "ll",
  "location",
  "lon",
  "lr",
  "lrad",
  "lsig",
  "ltype",
  "ludocid",
  "max_duration",
  "max_price",
  "min_price",
  "mkt",
  "multi_city_json",
  "next_page_token",
  "nfpr",
  "no_cache",
  "num",
  "offer_id",
  "offers",
  "on_sale",
  "outbound_date",
  "outbound_time",
  "p",
  "page",
  "page_token",
  "patent_id",
  "patents",
  "period_unit",
  "period_value",
  "photo",
  "place_id",
  "platform",
  "price",
  "product_id",
  "product_token",
  "property_token",
  "property_types",
  "publication_token",
  "q",
  "qft",
  "rating",
  "region",
  "render_js",
  "resolution",
  "return_date",
  "return_json",
  "return_time",
  "reviews",
  "rstr",
  "safe",
  "safeSearch",
  "scholar",
  "scisbd",
  "season_id",
  "section_page_token",
  "section_token",
  "see_more_token",
  "setlang",
  "shoprs",
  "show_hidden",
  "si",
  "small_businesses",
  "so",
  "sort",
  "sort_by",
  "source_site",
  "special_offers",
  "specs",
  "start",
  "start_date",
  "status",
  "stops",
  "store",
  "store_device",
  "story_token",
  "tbm",
  "tbs",
  "text",
  "topic_token",
  "travel_class",
  "trend",
  "tz",
  "type",
  "uds",
  "url",
  "uule",
  "vacation_rentals",
  "view_op",
  "window",
  "within",
  "yandex_domain",
]);

const PARAMETER_ALIASES = Object.freeze({
  query: "q",
  language: "hl",
  country: "gl",
});

class ThorDataError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

class ThorDataConfigurationError extends ThorDataError {}

class ThorDataConnectionError extends ThorDataError {}

class ThorDataTimeoutError extends ThorDataConnectionError {}

class ThorDataAPIError extends ThorDataError {
  constructor(message, { code = null, statusCode = null, responseData = null } = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

class ThorDataAuthenticationError extends ThorDataAPIError {}

class ThorDataPermissionError extends ThorDataAPIError {}

class ThorDataRateLimitError extends ThorDataAPIError {}

class ThorDataInvalidRequestError extends ThorDataAPIError {}

class ThorDataNotCollectedError extends ThorDataAPIError {}

function resolveApiKey(options = {}) {
  return (
    options.apiKey ||
    options.apiToken ||
    options.token ||
    process.env.THORDATA_API_KEY ||
    process.env.THORDATA_API_TOKEN ||
    null
  );
}

function normalizeValue(value) {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function normalizeParams(params = {}, { filter = true } = {}) {
  const normalized = {};
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new ThorDataInvalidRequestError("params must be an object", { code: 400 });
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (filter && !REQUEST_PARAMETERS.has(key)) {
      continue;
    }
    const normalizedValue = normalizeValue(value);
    if (normalizedValue !== "") {
      normalized[key] = normalizedValue;
    }
  }
  return normalized;
}

function normalizeSearchParams(params = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(params)) {
    const apiKey = PARAMETER_ALIASES[key] || key;
    if (value === undefined || value === null || !REQUEST_PARAMETERS.has(apiKey)) {
      continue;
    }
    const normalizedValue = normalizeValue(value);
    if (normalizedValue !== "") {
      normalized[apiKey] = normalizedValue;
    }
  }
  return normalized;
}

function buildUrl(apiUrl, path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (path === "/request" || path === "request") {
    return apiUrl;
  }
  const base = apiUrl.replace(/\/request\/?$/, "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function combineSignals(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  let removeListener = null;
  if (signal) {
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
      removeListener = () => signal.removeEventListener("abort", abort);
    }
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (removeListener) {
        removeListener();
      }
    },
  };
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function parseEmbeddedJson(value) {
  return typeof value === "string" ? parseJsonText(value) : value;
}

function parseNestedJson(value) {
  const decoded = parseEmbeddedJson(value);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return decoded;
  }
  const result = { ...decoded };
  if (typeof result.json === "string") {
    result.json = parseEmbeddedJson(result.json);
  }
  if (Object.prototype.hasOwnProperty.call(result, "result")) {
    result.result = parseEmbeddedJson(result.result);
  }
  return result;
}

function errorTypeForCode(code) {
  if (code === 300) return ThorDataNotCollectedError;
  if (code === 401) return ThorDataAuthenticationError;
  if (code === 402) return ThorDataPermissionError;
  if (code === 429) return ThorDataRateLimitError;
  if (code === 400) return ThorDataInvalidRequestError;
  return ThorDataAPIError;
}

class ThorDataClient {
  constructor({ apiKey, apiToken, token, apiUrl, baseUrl, timeout = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
    const resolvedKey = resolveApiKey({ apiKey, apiToken, token });
    if (!resolvedKey || !String(resolvedKey).trim()) {
      throw new ThorDataConfigurationError(
        "ThorData API key is required; pass apiKey/apiToken or set THORDATA_API_KEY",
      );
    }
    if (/[^\x00-\x7F]/.test(String(resolvedKey).trim())) {
      throw new ThorDataConfigurationError(
        "ThorData API key must contain only ASCII characters; check the copied key or placeholder text",
      );
    }
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new ThorDataConfigurationError("timeout must be greater than zero");
    }
    const configuredUrl =
      apiUrl ||
      process.env.THORDATA_SERP_API_URL ||
      (baseUrl ? `${String(baseUrl).replace(/\/+$/, "")}/request` : DEFAULT_API_URL);
    if (!/^https?:\/\//i.test(configuredUrl)) {
      throw new ThorDataConfigurationError("apiUrl must use http or https");
    }
    this.apiKey = String(resolvedKey).trim();
    this.apiUrl = String(configuredUrl).trim();
    this.baseUrl = baseUrl || this.apiUrl.replace(/\/request\/?$/, "");
    this.timeout = timeout;
    this.headers = { ...headers };
  }

  toString() {
    return `[ThorDataClient apiUrl=${JSON.stringify(this.apiUrl)}]`;
  }

  async request(method, path = "/request", params = {}, { headers = {}, signal, filterParams = true } = {}) {
    const payload = normalizeParams(params, { filter: filterParams });
    const requestHeaders = {
      ...this.headers,
      ...headers,
      Accept: "application/json, text/html;q=0.9, */*;q=0.8",
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": `langchain-thordata-javascript/${PACKAGE_VERSION}`,
      "X-ThorData-Platform": INTEGRATION_PLATFORM,
      "X-ThorData-Source": INTEGRATION_SOURCE,
      platform: INTEGRATION_PLATFORM,
      "api-source": INTEGRATION_SOURCE,
    };
    const timeout = combineSignals(signal, this.timeout);
    try {
      return await fetch(buildUrl(this.apiUrl, path), {
        method: String(method).toUpperCase(),
        headers: requestHeaders,
        body: new URLSearchParams(payload),
        signal: timeout.signal,
      });
    } catch (error) {
      if (timeout.signal.aborted) {
        throw new ThorDataTimeoutError("ThorData SERP request timed out");
      }
      if (error instanceof TypeError && /ByteString|character at index/i.test(error.message)) {
        throw new ThorDataConfigurationError(
          "ThorData API key or custom header contains a non-ASCII character",
          { cause: error },
        );
      }
      throw new ThorDataConnectionError("Unable to connect to the ThorData SERP API", { cause: error });
    } finally {
      timeout.cleanup();
    }
  }

  async search(params = {}, options = {}) {
    return (await this.searchResponse(params, options)).result;
  }

  async searchJson(params = {}, options = {}) {
    return this.search(params, options);
  }

  async searchResponse(params = {}, options = {}) {
    const input = this._buildSearchPayload(params);
    const response = await this.request("POST", "/request", input, options);
    return this._parseResponse(response);
  }

  _buildSearchPayload(params = {}, overrides = {}) {
    const input = normalizeSearchParams({ ...params, ...overrides });
    const requestedEngine = String(input.engine || "google_search").trim().toLowerCase();
    const engine = ENGINE_ALIASES[requestedEngine] || requestedEngine;
    if (WEB_SCRAPER_ENGINES.has(engine)) {
      throw new ThorDataInvalidRequestError(
        "Web Scraper engines are not available in the SERP SDK",
        { code: 400 },
      );
    }
    if (!SUPPORTED_ENGINES.includes(requestedEngine) && !SUPPORTED_ENGINES.includes(engine)) {
      throw new ThorDataInvalidRequestError(
        `Unsupported SERP engine ${requestedEngine}; supported engines: ${SUPPORTED_ENGINES.join(", ")}`,
        { code: 400 },
      );
    }
    input.engine = engine;
    if (engine === "yandex") {
      if (input.text === undefined && input.q !== undefined) {
        input.text = input.q;
      }
      delete input.q;
    }
    if (input.json === undefined) input.json = "1";
    if (input.isjson === undefined) input.isjson = "1";
    input.integration_platform = INTEGRATION_PLATFORM;
    input.integration_source = INTEGRATION_SOURCE;
    return input;
  }

  async rawSearch(params = {}, options = {}) {
    const response = await this.request("POST", "/request", params, options);
    return response.text();
  }

  async _readResponse(response) {
    const text = await response.text();
    if (!response.ok) {
      const body = parseJsonText(text);
      const message = body && typeof body === "object" ? body.data || body.msg : `HTTP ${response.status}`;
      const ErrorType = errorTypeForCode(response.status);
      throw new ErrorType(this._redact(String(message || `HTTP ${response.status}`)), {
        code: response.status,
        statusCode: response.status,
        responseData: body,
      });
    }
    return parseJsonText(text);
  }

  async _parseResponse(response) {
    const payload = await this._readResponse(response);
    this._assertBusinessSuccess(payload, response);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { result: payload, taskId: null, raw: payload };
    }
    if (!Object.prototype.hasOwnProperty.call(payload, "data")) {
      return { result: payload, taskId: null, raw: payload };
    }
    const data = parseNestedJson(payload.data);
    if (data && typeof data === "object" && !Array.isArray(data) && Object.prototype.hasOwnProperty.call(data, "result")) {
      const taskId = data.task_id == null ? null : String(data.task_id);
      return { result: data.result, taskId, raw: payload };
    }
    return { result: data, taskId: null, raw: payload };
  }

  _assertBusinessSuccess(payload, response) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return;
    }
    const rawCode = payload.code;
    const code = typeof rawCode === "string" && /^\d+$/.test(rawCode) ? Number(rawCode) : rawCode;
    if (code === undefined || code === null || code === 200) {
      return;
    }
    const message =
      typeof payload.data === "string" ? payload.data : payload.msg || "ThorData rejected the SERP request";
    const ErrorType = errorTypeForCode(code);
    throw new ErrorType(this._redact(String(message)), {
      code,
      statusCode: response.status,
      responseData: payload.data,
    });
  }

  _redact(value) {
    return String(value).split(this.apiKey).join("***");
  }
}

async function search(params = {}, options = {}) {
  return new ThorDataClient(options).search(params, options);
}

async function searchJson(params = {}, options = {}) {
  return new ThorDataClient(options).searchJson(params, options);
}

async function rawSearch(params = {}, options = {}) {
  return new ThorDataClient(options).rawSearch(params, options);
}

module.exports = {
  DEFAULT_API_URL,
  DEFAULT_TIMEOUT_MS,
  INTEGRATION_PLATFORM,
  INTEGRATION_SOURCE,
  REQUEST_PARAMETERS,
  SUPPORTED_ENGINES,
  ThorDataAPIError,
  ThorDataAuthenticationError,
  ThorDataClient,
  ThorDataConfigurationError,
  ThorDataConnectionError,
  ThorDataError,
  ThorDataInvalidRequestError,
  ThorDataNotCollectedError,
  ThorDataPermissionError,
  ThorDataRateLimitError,
  ThorDataTimeoutError,
  Client: ThorDataClient,
  ...require("./langchain"),
  rawSearch,
  search,
  searchJson,
};
