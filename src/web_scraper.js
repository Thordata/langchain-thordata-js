"use strict";

const { performance } = require("node:perf_hooks");
const { ThorDataError } = require("./errors");

const WEB_SCRAPER_BUILDER_URL = "https://scraperapi.thordata.com/builder";
const WEB_SCRAPER_TASK_API_BASE_URL = "https://api.thordata.com/api/web-scraper-api";
const WEB_SCRAPER_DOWNLOAD_URL = "https://scraperapi.thordata.com/download";
const DEFAULT_MAX_WAIT_SECONDS = 300;
const POLL_INTERVAL_MS = 5_000;

const SUPPORTED_WEB_SCRAPERS = Object.freeze([
  "linkedin_company_information_by-url",
  "linkedin_job_listings_information_by-job-url",
  "youtube_video-post_by-keyword",
  "facebook_profile_by-profiles-url",
  "youtube_video-post_by-explore",
  "twitter_profile_by-profileurl",
  "amazon_product_by-category-url",
]);

const SORT_BY_VALUES = Object.freeze([
  "Best Sellers",
  "Newest Arrivals",
  "Avg. Customer Review",
  "Price: High to Low",
  "Price: Low to High",
  "Featured",
]);

const SPIDER_DEFINITIONS = Object.freeze({
  "linkedin_company_information_by-url": {
    spiderName: "linkedin.com",
    fields: { url: { type: "url", required: true } },
  },
  "linkedin_job_listings_information_by-job-url": {
    spiderName: "linkedin.com",
    fields: { job_url: { type: "url", required: true } },
  },
  "youtube_video-post_by-keyword": {
    spiderName: "youtube.com",
    fields: {
      keyword: { type: "string", required: true },
      num_of_posts: { type: "positiveIntegerString", required: false },
    },
  },
  "facebook_profile_by-profiles-url": {
    spiderName: "facebook.com",
    fields: { url: { type: "url", required: true } },
  },
  "youtube_video-post_by-explore": {
    spiderName: "youtube.com",
    fields: {
      url: { type: "url", required: true },
      all_tabs: { type: "allTabs", required: false },
    },
  },
  "twitter_profile_by-profileurl": {
    spiderName: "x.com",
    fields: { url: { type: "url", required: true } },
  },
  "amazon_product_by-category-url": {
    spiderName: "amazon.com",
    fields: {
      url: { type: "url", required: true },
      page_turning: { type: "positiveInteger", required: false },
      sort_by: {
        type: "option",
        required: false,
        default: "Best Sellers",
        options: SORT_BY_VALUES,
        aliases: {
          "Average Rating": "Avg. Customer Review",
          "Featured Recommendations": "Featured",
        },
      },
    },
  },
});

const ERROR_MESSAGES = Object.freeze({
  invalid_parameters: "Web Scraper parameters are invalid.",
  submission_unknown: "Web Scraper submission outcome is unknown.",
  submission_failed: "Web Scraper submission was rejected.",
  scrape_failed: "Web Scraper returned only failed records or the task failed.",
  download_url_invalid: "Web Scraper returned an invalid download address.",
  invalid_result: "Web Scraper results are not valid JSON records.",
  wait_timeout: "Web Scraper exceeded the maximum wait time.",
  protocol_error: "Web Scraper returned an incompatible response.",
  authentication_failed: "Web Scraper authentication failed.",
  permission_denied: "Web Scraper permission was denied.",
  insufficient_balance: "Web Scraper account balance is insufficient.",
  request_failed: "Web Scraper request failed.",
});

class ThorDataWebScraperError extends ThorDataError {
  constructor(errorCode, { stage, taskId = null, spiderId = null, reason = null, serviceCode = null, secrets = [] } = {}) {
    const code = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, errorCode)
      ? errorCode
      : "request_failed";
    const safeTaskId = typeof taskId === "string" && /^[\w-]{1,200}$/u.test(taskId)
      && redactValueText(taskId, secrets, 1) === taskId ? taskId : null;
    const safeSpiderId = typeof spiderId === "string" && /^[\w-]{1,120}$/u.test(spiderId)
      && redactValueText(spiderId, secrets, 1) === spiderId ? spiderId : null;
    const detail = redactText(reason, secrets);
    const message = `${ERROR_MESSAGES[code]}${detail ? ` ${detail}` : ""}${safeTaskId ? ` Task ID: ${safeTaskId}.` : ""}`;
    super(message);
    this.name = "ThorDataWebScraperError";
    this.errorCode = code;
    this.stage = redactText(stage || "request", secrets);
    this.taskId = safeTaskId;
    this.spiderId = safeSpiderId;
    this.reason = detail || null;
    this.serviceCode = typeof serviceCode === "string" ? redactText(serviceCode, secrets)
      : typeof serviceCode === "number" && Number.isFinite(serviceCode) ? serviceCode : null;
  }
}

function redactText(value, secrets = []) {
  if (value === null || value === undefined) return "";
  let text = String(value)
    .replace(/https?:\/\/[^\s"<>]*(?:api_key|access_token|authorization|sign|token)=[^\s"<>]*/giu, "[redacted URL]")
    .replace(/\b(api[_-]?key|authorization|sign|token)\s*[:=]\s*[^\s,;"}]+/giu, "$1: [redacted]")
    .replace(/[\r\n\t]+/gu, " ");
  text = redactValueText(text, secrets, 1);
  return text.slice(0, 250).trim();
}

function redactValueText(value, secrets = [], minSecretLength = 8) {
  let text = String(value);
  const variants = new Set();
  const shortVariants = new Set();
  for (const secret of secrets.filter((entry) => typeof entry === "string" && entry.length >= minSecretLength)) {
    variants.add(secret);
    variants.add(encodeURIComponent(secret));
    variants.add(new URLSearchParams({ key: secret }).toString().slice(4));
  }
  if (minSecretLength > 1) {
    for (const secret of secrets.filter((entry) => typeof entry === "string" && entry && entry.length < minSecretLength)) {
      shortVariants.add(secret);
      shortVariants.add(encodeURIComponent(secret));
      shortVariants.add(new URLSearchParams({ key: secret }).toString().slice(4));
    }
  }
  // Percent-encoded letters are case-insensitive; replace only known credentials.
  for (const secret of [...variants].sort((a, b) => b.length - a.length)) {
    const pattern = secret.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
      .replace(/%[0-9a-f]{2}/giu, (part) => [...part].map((char) => /[a-f]/iu.test(char) ? `[${char.toLowerCase()}${char.toUpperCase()}]` : char).join(""));
    text = text.replace(new RegExp(pattern, "gu"), "[redacted]");
  }
  for (const secret of [...shortVariants].sort((a, b) => b.length - a.length)) {
    const pattern = secret.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
      .replace(/%[0-9a-f]{2}/giu, (part) => [...part].map((char) => /[a-f]/iu.test(char) ? `[${char.toLowerCase()}${char.toUpperCase()}]` : char).join(""));
    if (text === secret) {
      text = "[redacted]";
      continue;
    }
    text = text.replace(new RegExp(`(\\bBearer\\s+|\\bapi[_-]?key\\s*[:=]\\s*)${pattern}(?=$|[\\s,;\"'}])`, "giu"), "$1[redacted]");
  }
  return text;
}

function redactValue(value, secrets = []) {
  if (typeof value === "string") return redactValueText(value, secrets);
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [redactValueText(key, secrets), redactValue(entry, secrets)]));
  }
  return value;
}

function invalidError(ErrorType, message) {
  if (ErrorType === ThorDataWebScraperError) {
    return new ErrorType("invalid_parameters", { stage: "validate", reason: message });
  }
  return new ErrorType(message, { code: 400 });
}

function positiveInteger(value, key, ErrorType) {
  if (typeof value !== "number" && typeof value !== "string") throw invalidError(ErrorType, `${key} must be a positive integer`);
  const text = String(value);
  if (!/^\d+$/u.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
    throw invalidError(ErrorType, `${key} must be a positive integer`);
  }
  return Number(text);
}

function validateUrl(value, key, ErrorType) {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw invalidError(ErrorType, `${key} must be an HTTP or HTTPS URL`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw invalidError(ErrorType, `${key} must be an HTTP or HTTPS URL`);
  }
  if (!/^(?:http:|https:)$/iu.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw invalidError(ErrorType, `${key} must be an HTTP or HTTPS URL`);
  }
  return value;
}

function validateWebScraperParams(spiderId, params, ErrorType = ThorDataWebScraperError) {
  const definition = typeof spiderId === "string" && Object.prototype.hasOwnProperty.call(SPIDER_DEFINITIONS, spiderId)
    ? SPIDER_DEFINITIONS[spiderId] : null;
  if (!definition) throw invalidError(ErrorType, `Unsupported Web Scraper spider ${spiderId}`);
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw invalidError(ErrorType, "Web Scraper params must be an object");
  }
  const unknown = Object.keys(params).filter((key) => !Object.prototype.hasOwnProperty.call(definition.fields, key));
  if (unknown.length) throw invalidError(ErrorType, `Unknown Web Scraper parameters: ${unknown.join(", ")}`);
  const normalized = {};
  for (const [key, field] of Object.entries(definition.fields)) {
    const value = Object.prototype.hasOwnProperty.call(params, key) ? params[key] : field.default;
    if (value === undefined || value === null || value === "") {
      if (field.required) throw invalidError(ErrorType, `Missing required Web Scraper parameter: ${key}`);
      continue;
    }
    if (field.type === "url") normalized[key] = validateUrl(value, key, ErrorType);
    else if (field.type === "string") {
      if (typeof value !== "string" || !value.trim()) throw invalidError(ErrorType, `${key} must be a non-empty string`);
      normalized[key] = value;
    } else if (field.type === "positiveIntegerString") normalized[key] = String(positiveInteger(value, key, ErrorType));
    else if (field.type === "positiveInteger") normalized[key] = positiveInteger(value, key, ErrorType);
    else if (field.type === "allTabs") {
      if (typeof value !== "boolean") throw invalidError(ErrorType, "all_tabs must be a boolean");
      normalized[key] = value ? "true" : "flase";
    } else if (field.type === "option") {
      const mappedValue = field.aliases?.[value] ?? value;
      if (typeof mappedValue !== "string" || !field.options.includes(mappedValue)) {
        throw invalidError(ErrorType, `${key} must be one of the supported options`);
      }
      normalized[key] = mappedValue;
    }
  }
  return normalized;
}

function coerceCode(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/u.test(value.trim())) return Number(value.trim());
  return null;
}

function businessErrorCode(code, fallback) {
  if ([401, 10013, 10014, 10047, 10048].includes(code)) return "authentication_failed";
  if (code === 402) return "insufficient_balance";
  if (code === 403) return "permission_denied";
  return fallback;
}

function reason(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.msg || payload.message || payload.error || (typeof payload.data === "string" ? payload.data : null);
}

async function requestJson(request, method, url, headers, body, timeout, context, signal) {
  let response;
  let text;
  try {
    response = await request(method, url, headers, body, timeout, signal);
    text = await response.text();
  } catch (error) {
    const code = context.stage === "submit" ? "submission_unknown" : "request_failed";
    throw new ThorDataWebScraperError(code, { ...context, reason: error });
  }
  let payload;
  try {
    payload = parseJsonDocuments(text);
  } catch (error) {
    throw new ThorDataWebScraperError("protocol_error", { ...context, reason: "Response was not valid JSON" });
  }
  if (!response.ok) {
    const status = Number(response.status);
    const code = context.stage === "submit" && status >= 500 ? "submission_unknown" : businessErrorCode(status, context.stage === "submit" ? "submission_failed" : "request_failed");
    throw new ThorDataWebScraperError(code, { ...context, reason: reason(payload) || `HTTP ${status}` });
  }
  return payload;
}

function parseJsonDocuments(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Support multiple consecutive top-level JSON arrays.
  }
  const values = [];
  let index = 0;
  while (index < text.length) {
    while (/\s/u.test(text[index] || "")) index += 1;
    if (index >= text.length) break;
    const start = index;
    const opening = text[index];
    if (opening !== "[" && opening !== "{") throw new Error("invalid JSON document");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === "[" || character === "{") depth += 1;
      else if (character === "]" || character === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    if (end < 0) throw new Error("unterminated JSON document");
    values.push(JSON.parse(text.slice(start, end)));
    index = end;
  }
  if (values.length === 1) return values[0];
  if (values.length && values.every((value) => Array.isArray(value))) return values.flat();
  throw new Error("expected one JSON document or concatenated JSON arrays");
}

function checkEnvelope(payload, expectedCode, context, fallback) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ThorDataWebScraperError("protocol_error", context);
  }
  const code = coerceCode(payload.code);
  if (code !== expectedCode) {
    throw new ThorDataWebScraperError(businessErrorCode(code, fallback), { ...context, reason: reason(payload) });
  }
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new ThorDataWebScraperError("protocol_error", context);
  }
  return payload.data;
}

function validateDownloadUrl(value, taskId, spiderId, apiKey) {
  let parsed;
  try {
    if (typeof value !== "string" || value !== value.trim()) throw new Error("invalid");
    parsed = new URL(value);
  } catch {
    throw new ThorDataWebScraperError("download_url_invalid", { stage: "download_url", taskId, spiderId });
  }
  const trusted = new URL(WEB_SCRAPER_DOWNLOAD_URL);
  if (parsed.origin !== trusted.origin || parsed.pathname !== trusted.pathname || parsed.username || parsed.password || parsed.hash) {
    throw new ThorDataWebScraperError("download_url_invalid", { stage: "download_url", taskId, spiderId });
  }
  const allowed = new Set(["task_id", "type", "api_key"]);
  const seen = new Set();
  for (const key of parsed.searchParams.keys()) {
    if (seen.has(key) || !allowed.has(key)) throw new ThorDataWebScraperError("download_url_invalid", { stage: "download_url", taskId, spiderId });
    seen.add(key);
  }
  if (parsed.searchParams.get("task_id") !== taskId || parsed.searchParams.get("type") !== "json") {
    throw new ThorDataWebScraperError("download_url_invalid", { stage: "download_url", taskId, spiderId });
  }
  return parsed.toString();
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === "object") return Object.values(value).some(meaningful);
  return true;
}

function failureCode(value) {
  if (value === null || value === undefined || typeof value === "string" && !value.trim()) return false;
  if (typeof value !== "number" && typeof value !== "string") return true;
  const numeric = Number(value);
  return !Number.isFinite(numeric) || numeric !== 0 && numeric !== 200;
}

function failedRecord(record) {
  return record.success === false
    || (record.error !== false && record.error !== 0 && meaningful(record.error))
    || failureCode(record.error_code);
}

function parseDownloadResult(payload, taskId, spiderId, inputKeys, secrets, raw) {
  let value;
  try {
    value = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    throw new ThorDataWebScraperError("invalid_result", { stage: "parse", taskId, spiderId, secrets });
  }
  if (value && typeof value === "object" && !Array.isArray(value) && coerceCode(value.code) !== null && coerceCode(value.code) !== 200 && (value.msg || value.message)) {
    throw new ThorDataWebScraperError(businessErrorCode(coerceCode(value.code), "scrape_failed"), { stage: "parse", taskId, spiderId, reason: reason(value), serviceCode: value.code, secrets });
  }
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : null;
  if (!rows || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new ThorDataWebScraperError("invalid_result", { stage: "parse", taskId, spiderId });
  }
  const records = rows.map((row) => ({ ...row }));
  const errors = records.filter(failedRecord).length;
  if (records.length && errors === records.length) {
    throw new ThorDataWebScraperError("scrape_failed", { stage: "parse", taskId, spiderId, reason: records[0].error, serviceCode: records[0].error_code, secrets });
  }
  const ignored = new Set(["input", "input_url", "url", "job_url", "keyword", "success", "error", "error_code"]);
  const hasMeaningful = records.some((row) => Object.entries(row)
    .filter(([key]) => !inputKeys.has(key) && !ignored.has(key))
    .some(([, entry]) => meaningful(entry)));
  const status = errors ? "partial" : hasMeaningful ? "completed" : "empty";
  return {
    taskId,
    spiderId,
    status,
    recordCount: records.length,
    errorRecordCount: errors,
    result: redactValue(records, secrets),
    raw: redactValue(raw, secrets),
  };
}

async function runWebScraper({
  request,
  apiKey,
  spiderId,
  params,
  maxWaitSeconds = DEFAULT_MAX_WAIT_SECONDS,
  includeErrors = true,
  fileName = "{{TasksID}}",
  InvalidError = ThorDataWebScraperError,
  signal,
  requestTimeout = 30_000,
  sleep = (milliseconds, sleepSignal) => new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      sleepSignal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    sleepSignal.addEventListener("abort", done, { once: true });
  }),
  now = () => performance.now(),
}) {
  const normalized = validateWebScraperParams(spiderId, params, InvalidError);
  if (!Number.isInteger(maxWaitSeconds) || maxWaitSeconds < 1 || maxWaitSeconds > DEFAULT_MAX_WAIT_SECONDS) {
    throw invalidError(InvalidError, "max_wait_seconds must be between 1 and 300");
  }
  if (typeof includeErrors !== "boolean") throw invalidError(InvalidError, "include_errors must be a boolean");
  if (typeof fileName !== "string" || !fileName.trim()) throw invalidError(InvalidError, "file_name must be a non-empty string");
  const deadline = now() + maxWaitSeconds * 1_000;
  const secrets = [apiKey];
  const context = (stage, taskId = null) => ({ stage, taskId, spiderId, secrets });
  const remaining = (stage, taskId = null) => {
    if (signal && signal.aborted) throw new ThorDataWebScraperError(stage === "submit" ? "submission_unknown" : "request_failed", { ...context(stage, taskId), reason: "Request cancelled" });
    const value = deadline - now();
    if (value <= 0) throw new ThorDataWebScraperError(stage === "submit" ? "submission_unknown" : "wait_timeout", context(stage, taskId));
    return value;
  };
  const bounded = async (stage, taskId, operation, cap = Infinity) => {
    const budget = remaining(stage, taskId);
    const timeout = Math.min(budget, cap);
    const controller = new AbortController();
    let failure = null;
    let rejectInterrupt;
    const interrupted = new Promise((_, reject) => { rejectInterrupt = reject; });
    const stop = (code, reason) => {
      failure = new ThorDataWebScraperError(code, { ...context(stage, taskId), reason });
      rejectInterrupt(failure);
      controller.abort(failure);
    };
    const cancel = () => stop(stage === "submit" ? "submission_unknown" : "request_failed", "Request cancelled");
    const timer = setTimeout(() => stop(stage === "submit" ? "submission_unknown" : budget <= cap ? "wait_timeout" : "request_failed", "Request timed out"), timeout);
    if (signal) signal.addEventListener("abort", cancel, { once: true });
    try {
      // Cover headers, body, and parsing; recheck the absolute deadline after synchronous parsing.
      const result = await Promise.race([operation(controller.signal, timeout), interrupted]);
      remaining(stage, taskId);
      return result;
    } catch (error) {
      if (failure) throw failure;
      remaining(stage, taskId);
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", cancel);
    }
  };
  const callJson = (stage, taskId, method, url, headers, body) => bounded(
    stage, taskId,
    (requestSignal, timeout) => requestJson(request, method, url, headers, body, timeout, context(stage, taskId), requestSignal),
    requestTimeout,
  );
  const form = (fields) => new URLSearchParams(fields);
  const submission = await callJson(
    "submit", null,
    "POST",
    WEB_SCRAPER_BUILDER_URL,
    { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    form({
      spider_name: SPIDER_DEFINITIONS[spiderId].spiderName,
      spider_id: spiderId,
      spider_parameters: JSON.stringify([normalized]),
      spider_errors: String(includeErrors),
      file_name: fileName,
      api_source: "sdk",
      source_platform: "langchain-js",
    }),
  );
  const submissionData = checkEnvelope(submission, 200, context("submit"), "submission_failed");
  const taskId = submissionData.task_id;
  if (typeof taskId !== "string" || !/^[\w-]{1,200}$/u.test(taskId) || taskId.includes(apiKey)) {
    throw new ThorDataWebScraperError("submission_unknown", { stage: "submit", spiderId });
  }
  const fetchDownload = async () => {
    const address = await callJson(
      "download_url", taskId, "POST",
      `${WEB_SCRAPER_TASK_API_BASE_URL}/tasks-download`,
      { sign: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      form({ tasks_id: taskId, type: "json", api_source: "sdk", source_platform: "langchain-js" }),
    );
    const addressData = checkEnvelope(address, 200, context("download_url", taskId), "protocol_error");
    if (addressData.tasks_ids !== taskId) throw new ThorDataWebScraperError("protocol_error", context("download_url", taskId));
    const downloadUrl = validateDownloadUrl(addressData.download, taskId, spiderId, apiKey);
    const downloadKey = new URL(downloadUrl).searchParams.get("api_key");
    if (downloadKey) secrets.push(downloadKey);
    return callJson("download", taskId, "GET", downloadUrl, { Accept: "application/json" }, new URLSearchParams());
  };
  let lastStatus = null;
  while (true) {
    const poll = await callJson(
      "poll", taskId,
      "POST",
      `${WEB_SCRAPER_TASK_API_BASE_URL}/tasks-status`,
      { sign: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      form({
        tasks_ids: taskId,
        api_source: "sdk",
        source_platform: "langchain-js",
      }),
    );
    if (!poll || typeof poll !== "object" || coerceCode(poll.code) !== 200 || !Array.isArray(poll.data)) {
      throw new ThorDataWebScraperError(businessErrorCode(coerceCode(poll && poll.code), "protocol_error"), { ...context("poll", taskId), reason: reason(poll) });
    }
    const matches = poll.data.filter((row) => row && typeof row === "object" && row.task_id === taskId);
    if (matches.length !== 1 || !["Running", "Ready", "Failed"].includes(matches[0].status)) {
      throw new ThorDataWebScraperError("protocol_error", context("poll", taskId));
    }
    lastStatus = matches[0];
    if (lastStatus.status === "Failed") {
      let detail = reason(lastStatus);
      let serviceCode = lastStatus.error_code;
      if (includeErrors) {
        try {
          const downloaded = await fetchDownload();
          const diagnostic = typeof downloaded === "string" ? parseJsonDocuments(downloaded) : downloaded;
          const rows = Array.isArray(diagnostic) ? diagnostic : [diagnostic];
          const first = rows.find((row) => row && typeof row === "object"
            && (row.error !== false && row.error !== 0 && meaningful(row.error) || failureCode(row.error_code)));
          if (first) {
            detail = first.error || detail;
            serviceCode = first.error_code ?? serviceCode;
          }
          remaining("parse", taskId);
        } catch {
          // Preserve the original task failure; do not resubmit or extend the wait budget.
          detail = reason(lastStatus);
          serviceCode = lastStatus.error_code;
        }
      }
      throw new ThorDataWebScraperError("scrape_failed", { ...context("poll", taskId), reason: detail, serviceCode });
    }
    if (lastStatus.status === "Ready") break;
    await bounded("poll", taskId, (sleepSignal) => sleep(Math.min(POLL_INTERVAL_MS, remaining("poll", taskId)), sleepSignal));
  }
  const downloaded = await fetchDownload();
  let result;
  try {
    result = parseDownloadResult(
      downloaded,
      taskId,
      spiderId,
      new Set(Object.keys(normalized)),
      secrets,
      { submission, status: lastStatus, download: { tasks_ids: taskId } },
    );
  } finally {
    remaining("parse", taskId);
  }
  return result;
}

module.exports = {
  DEFAULT_MAX_WAIT_SECONDS,
  POLL_INTERVAL_MS,
  SPIDER_DEFINITIONS,
  SUPPORTED_WEB_SCRAPERS,
  WEB_SCRAPER_BUILDER_URL,
  WEB_SCRAPER_DOWNLOAD_URL,
  WEB_SCRAPER_TASK_API_BASE_URL,
  ThorDataWebScraperError,
  runWebScraper,
  validateWebScraperParams,
};
