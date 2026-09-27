const test = require("node:test");
const assert = require("node:assert/strict");

const {
  Client,
  SUPPORTED_ENGINES,
  ThorDataAPIError,
  ThorDataAuthenticationError,
  ThorDataConfigurationError,
  ThorDataInvalidRequestError,
  ThorDataNotCollectedError,
  searchHtml,
} = require("../src");

function mockResponse(body, { ok = true, status = 200 } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    async text() {
      return text;
    },
  };
}

test("search posts form data to /request and unwraps result", async () => {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return mockResponse({
      code: 200,
      data: { task_id: "task-1", result: { organic: [{ title: "ThorData" }] } },
    });
  };
  try {
    const client = new Client({ apiKey: "secret-token" });
    const result = await client.search({ engine: "google_search", q: "car", gl: "us" });
    assert.deepEqual(result, { organic: [{ title: "ThorData" }] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://scraperapi.thordata.com/request");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer secret-token");
    assert.equal(calls[0].init.headers["X-ThorData-Platform"], "langchain");
    assert.equal(calls[0].init.headers["X-ThorData-Source"], "javascript-sdk");
    assert.equal(calls[0].init.headers.platform, "langchain");
    assert.equal(calls[0].init.headers["api-source"], "javascript-sdk");
    assert.equal(calls[0].init.headers["User-Agent"], "langchain-thordata-javascript/0.2.0");
    assert.equal(calls[0].init.body.get("engine"), "google");
    assert.equal(calls[0].init.body.get("json"), "1");
    assert.equal(calls[0].init.body.get("isjson"), "1");
    assert.equal(calls[0].init.body.get("integration_platform"), "langchain");
    assert.equal(calls[0].init.body.get("integration_source"), "javascript-sdk");
  } finally {
    global.fetch = oldFetch;
  }
});

test("baseUrl is supported as a compatibility option", () => {
  const client = new Client({ apiKey: "secret-token", baseUrl: "https://example.test/" });
  assert.equal(client.apiUrl, "https://example.test/request");
  assert.equal(client.baseUrl, "https://example.test/");
});

test("specialized engines preserve API parameters and ignore unknown fields", async () => {
  const oldFetch = global.fetch;
  global.fetch = async (_url, init) => {
    assert.equal(init.body.get("engine"), "google_flights");
    assert.equal(init.body.get("departure_id"), "SFO");
    assert.equal(init.body.get("arrival_id"), "JFK");
    assert.equal(init.body.get("children_ages"), "[4,7]");
    assert.equal(init.body.has("unsupported"), false);
    assert.equal(init.body.has("q"), false);
    return mockResponse({ code: 200, data: { result: { flights: [] } } });
  };
  try {
    const result = await new Client({ apiToken: "secret-token" }).search({
      engine: "google_flights",
      departure_id: "SFO",
      arrival_id: "JFK",
      children_ages: [4, 7],
      unsupported: "ignored",
    });
    assert.deepEqual(result, { flights: [] });
  } finally {
    global.fetch = oldFetch;
  }
});

test("Yandex query is sent as text instead of q", async () => {
  const oldFetch = global.fetch;
  global.fetch = async (_url, init) => {
    assert.equal(init.body.get("engine"), "yandex");
    assert.equal(init.body.get("text"), "LangChain Yandex");
    assert.equal(init.body.has("q"), false);
    return mockResponse({ code: 200, data: { result: { organic: [] } } });
  };
  try {
    await new Client({ apiKey: "secret-token" }).search({
      engine: "yandex",
      query: "LangChain Yandex",
    });
  } finally {
    global.fetch = oldFetch;
  }
});

test("searchResponse keeps task metadata without exposing a misleading HTML helper", async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => mockResponse({
    code: 200,
    data: { task_id: "task-2", result: { ok: true } },
  });
  try {
    const client = new Client({ apiKey: "secret-token" });
    assert.equal(client.searchHtml, undefined);
    assert.equal(searchHtml, undefined);
    const response = await client.searchResponse({ engine: "google", q: "car" });
    assert.equal(response.taskId, "task-2");
  } finally {
    global.fetch = oldFetch;
  }
});

test("convenience parameters map consistently", async () => {
  const oldFetch = global.fetch;
  global.fetch = async (_url, init) => {
    assert.equal(init.body.get("q"), "mapped search");
    assert.equal(init.body.get("gl"), "US");
    assert.equal(init.body.get("hl"), "en");
    assert.equal(init.body.has("query"), false);
    assert.equal(init.body.has("country"), false);
    assert.equal(init.body.has("language"), false);
    return mockResponse({ code: 200, data: { result: { organic: [] } } });
  };
  try {
    await new Client({ apiKey: "secret-token" }).search({
      query: "mapped search",
      country: "US",
      language: "en",
    });
  } finally {
    global.fetch = oldFetch;
  }
});

test("rawSearch and request retain integration attribution headers", async () => {
  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (_url, init) => {
    calls.push(init);
    return mockResponse("ok");
  };
  try {
    const client = new Client({ apiKey: "secret-token" });
    await client.rawSearch({ engine: "google", q: "raw" });
    await client.request("POST", "/request", { engine: "google", q: "request" });
  } finally {
    global.fetch = oldFetch;
  }

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.headers["X-ThorData-Platform"], "langchain");
    assert.equal(call.headers["X-ThorData-Source"], "javascript-sdk");
    assert.equal(call.headers.platform, "langchain");
    assert.equal(call.headers["api-source"], "javascript-sdk");
  }
});

test("flat Google response is preserved", async () => {
  const oldFetch = global.fetch;
  const flat = { code: 200, organic: [{ title: "Flat result" }] };
  global.fetch = async () => mockResponse(flat);
  try {
    assert.deepEqual(await new Client({ apiKey: "secret-token" }).search({ q: "flat" }), flat);
  } finally {
    global.fetch = oldFetch;
  }
});

test("JSON string envelopes are normalized to objects", async () => {
  const oldFetch = global.fetch;
  const bodies = [
    { code: 200, data: { result: JSON.stringify({ organic: [] }) } },
    { code: 200, data: JSON.stringify({ organic: [] }) },
  ];
  try {
    for (const body of bodies) {
      global.fetch = async () => mockResponse(body);
      assert.deepEqual(await new Client({ apiKey: "secret-token" }).search({ q: "string envelope" }), {
        organic: [],
      });
    }
  } finally {
    global.fetch = oldFetch;
  }
});

test("business and HTTP errors are typed and redact API keys", async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => mockResponse({ code: "0", data: "bad secret-token" });
  try {
    await assert.rejects(
      () => new Client({ apiKey: "secret-token" }).search({ q: "query" }),
      (error) => error instanceof ThorDataAPIError && error.message === "bad ***",
    );
  } finally {
    global.fetch = oldFetch;
  }

  global.fetch = async () => mockResponse({ code: 401, data: "bad secret-token" });
  try {
    await assert.rejects(
      () => new Client({ apiKey: "secret-token" }).search({ q: "query" }),
      (error) => error instanceof ThorDataAuthenticationError && error.message === "bad ***",
    );
  } finally {
    global.fetch = oldFetch;
  }

  global.fetch = async () => mockResponse({ code: 300, data: "not collected" });
  try {
    await assert.rejects(
      () => new Client({ apiKey: "secret-token" }).search({ q: "query" }),
      (error) => error instanceof ThorDataNotCollectedError && error.code === 300,
    );
  } finally {
    global.fetch = oldFetch;
  }
});

test("configuration and Web Scraper validation happen before fetch", async () => {
  assert.throws(() => new Client(), ThorDataConfigurationError);
  assert.throws(() => new Client({ apiKey: "\u4f60" }), ThorDataConfigurationError);
  const client = new Client({ apiKey: "secret-token" });
  await assert.rejects(() => client.search({ engine: "google_webpage", url: "https://example.com" }), ThorDataInvalidRequestError);
  assert.ok(SUPPORTED_ENGINES.includes("google_ai_mode"));
  assert.ok(SUPPORTED_ENGINES.includes("duckduckgo"));
  assert.equal(SUPPORTED_ENGINES.includes("google_ai_overview"), false);
  assert.equal(SUPPORTED_ENGINES.includes("bing_product"), false);
});
