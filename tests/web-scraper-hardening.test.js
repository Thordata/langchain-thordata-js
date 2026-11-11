const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { performance } = require("node:perf_hooks");
const sdk = require("../src");
const { validateWebScraperParams } = require("../src/web_scraper");

const spider = "linkedin_company_information_by-url";
const params = { url: "https://www.linkedin.com/company/example" };
const taskId = "TASK-HARDEN";
const apiKey = "caller+key/value";
const derivedKey = "derived+key/value";
const download = `https://scraperapi.thordata.com/download?task_id=${taskId}&type=json&api_key=${encodeURIComponent(derivedKey)}`;
const response = (body) => new Response(JSON.stringify(body));
function lifecycle(url, { status = "Ready", rows = [{ name: "Example" }] } = {}) {
  if (url.endsWith("/builder")) return response({ code: 200, data: { task_id: taskId } });
  if (url.endsWith("/tasks-status")) return response({ code: 200, data: [{ task_id: taskId, status, error: "original failure" }] });
  if (url.endsWith("/tasks-download")) return response({ code: 200, data: { tasks_ids: taskId, download } });
  return response(rows);
}

test("public scraper defaults and error inheritance match declarations", () => {
  assert.equal(sdk.DEFAULT_MAX_WAIT_SECONDS, 300);
  const error = new sdk.ThorDataWebScraperError("scrape_failed", { reason: "blocked", serviceCode: "BLOCKED" });
  assert.ok(error instanceof sdk.ThorDataError);
  assert.equal(error.reason, "blocked");
  assert.equal(error.serviceCode, "BLOCKED");
});

test("positive integer inputs reject coercible objects and unsafe values", () => {
  for (const value of [true, [3], { toString: () => "3" }, Infinity, NaN, 3.5, 0, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateWebScraperParams("amazon_product_by-category-url", { url: "https://amazon.com/s", page_turning: value }));
    assert.throws(() => validateWebScraperParams("youtube_video-post_by-keyword", { keyword: "test", num_of_posts: value }));
  }
  for (const value of [3.0, "003"]) {
    assert.equal(validateWebScraperParams("amazon_product_by-category-url", { url: "https://amazon.com/s", page_turning: value }).page_turning, 3);
    assert.equal(validateWebScraperParams("youtube_video-post_by-keyword", { keyword: "test", num_of_posts: value }).num_of_posts, "3");
  }
});

test("Amazon page_turning is optional and document sort aliases map to schema values", () => {
  assert.deepEqual(validateWebScraperParams("amazon_product_by-category-url", {
    url: "https://www.amazon.com/s?i=luggage-intl-ship",
  }), {
    url: "https://www.amazon.com/s?i=luggage-intl-ship",
    sort_by: "Best Sellers",
  });
  for (const [supplied, expected] of [
    ["Average Rating", "Avg. Customer Review"],
    ["Featured Recommendations", "Featured"],
  ]) {
    assert.equal(validateWebScraperParams("amazon_product_by-category-url", {
      url: "https://www.amazon.com/s?i=luggage-intl-ship",
      sort_by: supplied,
    }).sort_by, expected);
  }
});

test("client and tool require integer wait limits from 1 to 300", async (t) => {
  t.mock.method(global, "fetch", () => { throw new Error("must validate before fetch"); });
  const client = new sdk.Client({ apiKey });
  const schema = sdk.createThorDataWebScraperTool({ client }).schema;
  for (const value of [0.001, 1.5, 0, 301, "3", true, Infinity, NaN]) {
    await assert.rejects(client.scrape(spider, params, { maxWaitSeconds: value }), sdk.ThorDataInvalidRequestError);
    assert.equal(schema.safeParse({ spider_id: spider, params, max_wait_seconds: value }).success, false);
  }
});

test("scraper requests disable redirects and strip caller credentials and source headers case-insensitively", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", async (url, init) => { calls.push({ url, init }); return lifecycle(url); });
  await new sdk.Client({ apiKey, headers: { aUtHoRiZaTiOn: "injected", SIGN: "injected", "X-API-Key": "injected", Cookie: "session=secret", "PrOxY-AuThOrIzAtIoN": "injected", "X-Private-Credential": "injected", "API-SOURCE": "wrong", SOURCE_PLATFORM: "wrong" } }).scrape(spider, params);
  for (const { init } of calls) {
    assert.equal(init.redirect, "error");
    const headers = new Headers(init.headers);
    assert.equal(headers.has("api-source"), false);
    assert.equal(headers.has("source_platform"), false);
    assert.equal(headers.has("cookie"), false);
    assert.equal(headers.has("x-api-key"), false);
    if (init.method === "GET") {
      assert.equal(headers.has("authorization"), false);
      assert.equal(headers.has("sign"), false);
      assert.equal(headers.has("proxy-authorization"), false);
      assert.equal(headers.has("x-private-credential"), false);
    }
  }
});

test("malformed nested JSON results raise a sanitized typed error", async (t) => {
  t.mock.method(global, "fetch", (url) => lifecycle(url, { rows: `invalid ${derivedKey}` }));
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params), (error) => error instanceof sdk.ThorDataWebScraperError && error.errorCode === "invalid_result" && !error.message.includes(derivedKey));
});

test("prototype property names cannot bypass the seven-spider allowlist", () => {
  for (const value of ["constructor", "toString", "__proto__"]) {
    assert.throws(() => validateWebScraperParams(value, {}), (error) => error instanceof sdk.ThorDataWebScraperError && error.errorCode === "invalid_parameters");
  }
});

test("failed-task diagnostics cannot exceed the original deadline", { timeout: 3000 }, async (t) => {
  let requests = 0;
  await withServer(t, async (req, res) => {
    requests += 1;
    if (req.url === "/download") { res.writeHead(200); res.write("["); }
    else res.end(await lifecycle(req.url, { status: "Failed" }).text());
  });
  const start = performance.now();
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { maxWaitSeconds: 1 }), (error) => error.errorCode === "scrape_failed" && error.taskId === taskId && error.reason === "original failure");
  assert.ok(performance.now() - start < 1700);
  assert.equal(requests, 4);
});

test("HTTP redirects are never followed", async (t) => {
  let redirects = 0;
  await withServer(t, (req, res) => {
    if (req.url === "/redirected") redirects += 1;
    res.writeHead(302, { Location: "/redirected" });
    res.end();
  });
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params), (error) => error.errorCode === "submission_unknown");
  assert.equal(redirects, 0);
});

test("deadline is checked after synchronous JSON parsing", async (t) => {
  let now = 0;
  const originalParse = JSON.parse;
  t.mock.method(JSON, "parse", (text, ...rest) => {
    const result = originalParse(text, ...rest);
    if (text === '[{"name":"Example"}]') now = 1001;
    return result;
  });
  t.mock.method(global, "fetch", (url) => lifecycle(url));
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { maxWaitSeconds: 1, now: () => now }), (error) => error.errorCode === "wait_timeout" && error.taskId === taskId);
});

test("results preserve ordinary fields and signed URLs while redacting both known credentials", async (t) => {
  const row = { name: "Example", password: "public-field", secret: "ordinary", token: "ordinary", api_key: "ordinary", signed: "https://cdn.example/video?token=public&sign=public", text: "token=ordinary", nested: { key: apiKey, encoded: encodeURIComponent(apiKey), derived: derivedKey, encodedDerived: encodeURIComponent(derivedKey) } };
  t.mock.method(global, "fetch", (url) => lifecycle(url, { rows: [row] }));
  const result = await new sdk.Client({ apiKey }).scrapeResponse(spider, params);
  assert.equal(result.errorRecordCount, 0);
  assert.deepEqual(result.result[0], { ...row, nested: { key: "[redacted]", encoded: "[redacted]", derived: "[redacted]", encodedDerived: "[redacted]" } });
});

test("business result strings preserve short API-key substrings", async (t) => {
  const shortKey = "short";
  const row = {
    description: `A public value containing ${shortKey}`,
    exact: shortKey,
    bearer: `Bearer ${shortKey}`,
    apiKeySyntax: `api_key=${shortKey}`,
    tokenSyntax: `token=${shortKey}`,
    signedUrl: `https://cdn.example/video?token=${shortKey}`,
  };
  t.mock.method(global, "fetch", (url) => lifecycle(url, { rows: [row] }));
  const result = await new sdk.Client({ apiKey: shortKey }).scrapeResponse(spider, params);
  assert.equal(result.result[0].description, row.description);
  assert.equal(result.result[0].exact, "[redacted]");
  assert.equal(result.result[0].bearer, "Bearer [redacted]");
  assert.equal(result.result[0].apiKeySyntax, "api_key=[redacted]");
  assert.equal(result.result[0].tokenSyntax, row.tokenSyntax);
  assert.equal(result.result[0].signedUrl, row.signedUrl);
});

test("Failed tasks retrieve diagnostics once and retain the service code without exposing secrets", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", (url) => { calls.push(url); return lifecycle(url, { status: "Failed", rows: [{ error: `blocked ${derivedKey}`, error_code: "BLOCKED" }] }); });
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params), (error) => {
    assert.equal(error.errorCode, "scrape_failed");
    assert.equal(error.taskId, taskId);
    assert.equal(error.serviceCode, "BLOCKED");
    assert.match(error.reason, /blocked/);
    assert.equal(JSON.stringify(error).includes(derivedKey), false);
    return true;
  });
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((url) => url.endsWith("/builder")).length, 1);
});

test("Failed diagnostics are skipped when disabled and fall back when retrieval fails", async (t) => {
  const calls = [];
  t.mock.method(global, "fetch", (url) => {
    calls.push(url);
    if (url.endsWith("/tasks-download")) throw new Error(`network ${apiKey}`);
    return lifecycle(url, { status: "Failed" });
  });
  for (const includeErrors of [false, true]) {
    calls.length = 0;
    await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { includeErrors }), (error) => error.errorCode === "scrape_failed" && error.reason === "original failure" && error.serviceCode === null);
    assert.equal(calls.length, includeErrors ? 3 : 2);
  }
});

test("all failed downloaded records expose a sanitized service code", async (t) => {
  t.mock.method(global, "fetch", (url) => lifecycle(url, { rows: [{ error: `bad ${derivedKey}`, error_code: 1234 }] }));
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params), (error) => error.errorCode === "scrape_failed" && error.serviceCode === 1234 && !error.reason.includes(derivedKey));
});

test("failed diagnostics skip empty error markers and accept encoded JSON records", async (t) => {
  const rows = [{ error: false, error_code: 0 }, { error: "diagnostic failure", error_code: "BLOCKED" }];
  let currentBody;
  t.mock.method(global, "fetch", (url) => lifecycle(url, { status: "Failed", rows: currentBody }));
  for (const body of [rows, JSON.stringify(rows)]) {
    currentBody = body;
    await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params), (error) => error.errorCode === "scrape_failed" && error.reason === "diagnostic failure" && error.serviceCode === "BLOCKED");
  }
});

test("deadline is checked after final parsing and result preparation", async (t) => {
  let now = 0;
  t.mock.method(global, "fetch", async (url) => {
    if (new URL(url).pathname === "/download") return { ok: true, text: async () => { now = 1001; return '[{"name":"late"}]'; } };
    return lifecycle(url);
  });
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { maxWaitSeconds: 1, now: () => now }), (error) => error.errorCode === "wait_timeout" && error.taskId === taskId);
});

test("cancellation interrupts polling sleep promptly without resubmitting", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(global, "fetch", (url) => {
    calls += 1;
    if (url.endsWith("/tasks-status")) setTimeout(() => controller.abort(new Error(`cancel ${apiKey}`)), 30);
    return lifecycle(url, { status: "Running" });
  });
  const start = performance.now();
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { signal: controller.signal, maxWaitSeconds: 1 }), (error) => error.errorCode === "request_failed" && error.taskId === taskId && !JSON.stringify(error).includes(apiKey));
  assert.ok(performance.now() - start < 700);
  assert.equal(calls, 2);
});

async function withServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const realFetch = global.fetch;
  t.mock.method(global, "fetch", (url, init) => realFetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return server;
}

for (const stream of [false, true]) {
  test(`total deadline aborts a ${stream ? "streamed" : "hanging"} HTTP result body and retains task ID`, { timeout: 4000 }, async (t) => {
    await withServer(t, async (req, res) => {
      if (req.url === "/download") {
        res.writeHead(200, { "content-type": "application/json" });
        res.write("[");
        if (stream) {
          const timer = setInterval(() => res.write(" "), 30);
          res.on("close", () => clearInterval(timer));
        }
        return;
      }
      res.end(await lifecycle(req.url).text());
    });
    const start = performance.now();
    await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { maxWaitSeconds: 1 }), (error) => error.errorCode === "wait_timeout" && error.taskId === taskId);
    assert.ok(performance.now() - start < 1700);
  });
}

test("per-request timeout includes the submission body and never retries", { timeout: 3000 }, async (t) => {
  let requests = 0;
  await withServer(t, (_req, res) => { requests += 1; res.writeHead(200); res.write('{"code":200'); });
  const start = performance.now();
  await assert.rejects(new sdk.Client({ apiKey, timeout: 80 }).scrape(spider, params, { maxWaitSeconds: 1 }), (error) => error.errorCode === "submission_unknown");
  assert.ok(performance.now() - start < 700);
  assert.equal(requests, 1);
});


test("caller cancellation remains active during the HTTP result body", { timeout: 3000 }, async (t) => {
  const controller = new AbortController();
  await withServer(t, async (req, res) => {
    if (req.url === "/download") {
      res.writeHead(200); res.write("[");
      setTimeout(() => controller.abort(new Error(`private ${derivedKey}`)), 30);
    } else res.end(await lifecycle(req.url).text());
  });
  const start = performance.now();
  await assert.rejects(new sdk.Client({ apiKey }).scrape(spider, params, { maxWaitSeconds: 1, signal: controller.signal }), (error) => error.errorCode === "request_failed" && error.taskId === taskId && !JSON.stringify(error).includes(derivedKey));
  assert.ok(performance.now() - start < 700);
});
