const test = require("node:test");
const assert = require("node:assert/strict");

const {
  Client,
  SUPPORTED_WEB_SCRAPERS,
  ThorDataInvalidRequestError,
  ThorDataWebScraperError,
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

test("supported Web Scrapers match the confirmed allowlist", () => {
  assert.deepEqual(SUPPORTED_WEB_SCRAPERS, [
    "linkedin_company_information_by-url",
    "linkedin_job_listings_information_by-job-url",
    "youtube_video-post_by-keyword",
    "facebook_profile_by-profiles-url",
    "youtube_video-post_by-explore",
    "twitter_profile_by-profileurl",
    "amazon_product_by-category-url",
  ]);
});

test("scrapeResponse completes the builder, poll, download-url, and download lifecycle", async () => {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/builder")) {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("spider_id"), "linkedin_company_information_by-url");
      assert.deepEqual(JSON.parse(body.get("spider_parameters")), [
        { url: "https://www.linkedin.com/company/example" },
      ]);
      assert.equal(body.get("spider_errors"), "true");
      assert.equal(body.get("file_name"), "test-file");
      assert.equal(body.get("api_source"), "sdk");
      assert.equal(body.get("source_platform"), "langchain-js");
      assert.equal(init.headers.Authorization, "Bearer secret-token");
      assert.equal(init.headers["api-source"], undefined);
      assert.equal(init.headers.source_platform, undefined);
      return mockResponse({ code: 200, data: { task_id: "TASK-1" } });
    }
    if (url.endsWith("/tasks-status")) {
      assert.equal(init.headers.sign, "secret-token");
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("tasks_ids"), "TASK-1");
      assert.equal(body.get("api_source"), "sdk");
      assert.equal(body.get("source_platform"), "langchain-js");
      assert.equal(init.headers["api-source"], undefined);
      assert.equal(init.headers.source_platform, undefined);
      return mockResponse({ code: 200, data: [{ task_id: "TASK-1", status: "Ready" }] });
    }
    if (url.endsWith("/tasks-download")) {
      assert.equal(init.headers.sign, "secret-token");
      assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
        tasks_id: "TASK-1",
        type: "json",
        api_source: "sdk",
        source_platform: "langchain-js",
      });
      assert.equal(init.headers["api-source"], undefined);
      assert.equal(init.headers.source_platform, undefined);
      return mockResponse({
        code: 200,
        data: {
          tasks_ids: "TASK-1",
          download: "https://scraperapi.thordata.com/download?task_id=TASK-1&type=json&api_key=server-side-key",
        },
      });
    }
    assert.equal(new URL(url).pathname, "/download");
    return mockResponse([{ name: "Example", success: true }]);
  };
  try {
    const response = await new Client({ apiKey: "secret-token" }).scrapeResponse(
      "linkedin_company_information_by-url",
      { url: "https://www.linkedin.com/company/example" },
      { maxWaitSeconds: 300, includeErrors: true, fileName: "test-file" },
    );
    assert.deepEqual(response.result, [{ name: "Example", success: true }]);
    assert.equal(response.taskId, "TASK-1");
    assert.equal(response.spiderId, "linkedin_company_information_by-url");
    assert.equal(response.status, "completed");
    assert.equal(response.recordCount, 1);
    assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
      "/builder",
      "/api/web-scraper-api/tasks-status",
      "/api/web-scraper-api/tasks-download",
      "/download",
    ]);
  } finally {
    global.fetch = oldFetch;
  }
});

test("scrape normalizes all_tabs false and returns partial records", async () => {
  const oldFetch = global.fetch;
  let downloadCount = 0;
  global.fetch = async (url, init) => {
    if (url.endsWith("/builder")) {
      const body = new URLSearchParams(init.body);
      assert.deepEqual(JSON.parse(body.get("spider_parameters")), [{
        url: "https://www.youtube.com/feed/explore",
        all_tabs: "flase",
      }]);
      return mockResponse({ code: 200, data: { task_id: "TASK-2" } });
    }
    if (url.endsWith("/tasks-status")) {
      return mockResponse({ code: 200, data: [{ task_id: "TASK-2", status: "Ready" }] });
    }
    if (url.endsWith("/tasks-download")) {
      return mockResponse({
        code: 200,
        data: {
          tasks_ids: "TASK-2",
          download: "https://scraperapi.thordata.com/download?task_id=TASK-2&type=json&api_key=server-side-key",
        },
      });
    }
    downloadCount += 1;
    return mockResponse([{ name: "Example", success: true }, { success: false, error: "blocked" }]);
  };
  try {
    const result = await new Client({ apiKey: "secret-token" }).scrape(
      "youtube_video-post_by-explore",
      { url: "https://www.youtube.com/feed/explore", all_tabs: false },
    );
    assert.equal(downloadCount, 1);
    assert.deepEqual(result, [{ name: "Example", success: true }, { success: false, error: "blocked" }]);
  } finally {
    global.fetch = oldFetch;
  }
});

test("scrape preserves long result strings and newlines", async () => {
  const original = `line one\nline two\n${"x".repeat(400)}`;
  const oldFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.endsWith("/builder")) return mockResponse({ code: 200, data: { task_id: "TASK-LONG" } });
    if (url.endsWith("/tasks-status")) return mockResponse({ code: 200, data: [{ task_id: "TASK-LONG", status: "Ready" }] });
    if (url.endsWith("/tasks-download")) return mockResponse({
      code: 200,
      data: {
        tasks_ids: "TASK-LONG",
        download: "https://scraperapi.thordata.com/download?task_id=TASK-LONG&type=json&api_key=server-side-key",
      },
    });
    return mockResponse([{ text: original, success: true }]);
  };
  try {
    const response = await new Client({ apiKey: "secret-token" }).scrapeResponse(
      "linkedin_company_information_by-url",
      { url: "https://www.linkedin.com/company/example" },
    );
    assert.equal(response.result[0].text, original);
  } finally {
    global.fetch = oldFetch;
  }
});

test("scrape flattens concatenated JSON array download chunks", async () => {
  const oldFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.endsWith("/builder")) return mockResponse({ code: 200, data: { task_id: "TASK-CHUNKS" } });
    if (url.endsWith("/tasks-status")) return mockResponse({ code: 200, data: [{ task_id: "TASK-CHUNKS", status: "Ready" }] });
    if (url.endsWith("/tasks-download")) return mockResponse({
      code: 200,
      data: {
        tasks_ids: "TASK-CHUNKS",
        download: "https://scraperapi.thordata.com/download?task_id=TASK-CHUNKS&type=json&api_key=server-side-key",
      },
    });
    return mockResponse('[{"name":"First","success":true}]\n[{"name":"Second","success":true}]');
  };
  try {
    const response = await new Client({ apiKey: "secret-token" }).scrapeResponse(
      "linkedin_company_information_by-url",
      { url: "https://www.linkedin.com/company/example" },
    );
    assert.deepEqual(response.result.map((row) => row.name), ["First", "Second"]);
  } finally {
    global.fetch = oldFetch;
  }
});

test("scrape rejects all failed records and untrusted download URLs", async () => {
  const oldFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.endsWith("/builder")) return mockResponse({ code: 200, data: { task_id: "TASK-3" } });
    if (url.endsWith("/tasks-status")) return mockResponse({ code: 200, data: [{ task_id: "TASK-3", status: "Ready" }] });
    if (url.endsWith("/tasks-download")) return mockResponse({
      code: 200,
      data: {
        tasks_ids: "TASK-3",
        download: "https://evil.example/download?task_id=TASK-3&type=json&api_key=secret-token",
      },
    });
    throw new Error("the untrusted URL must not be fetched");
  };
  try {
    await assert.rejects(
      () => new Client({ apiKey: "secret-token" }).scrape(
        "linkedin_company_information_by-url",
        { url: "https://www.linkedin.com/company/example" },
      ),
      (error) => error instanceof ThorDataWebScraperError && error.errorCode === "download_url_invalid",
    );
  } finally {
    global.fetch = oldFetch;
  }
});

test("scrape rejects invalid parameters before fetch", async () => {
  const oldFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    return mockResponse({});
  };
  try {
    await assert.rejects(
      () => new Client({ apiKey: "secret-token" }).scrape(
        "linkedin_company_information_by-url",
        { url: "https://user:pass@example.com", extra: "rejected" },
      ),
      ThorDataInvalidRequestError,
    );
    assert.equal(called, false);
  } finally {
    global.fetch = oldFetch;
  }
});

test("scrape timeout retains the task ID and never resubmits", async () => {
  const oldFetch = global.fetch;
  let submissions = 0;
  global.fetch = async (url) => {
    if (url.endsWith("/builder")) {
      submissions += 1;
      return mockResponse({ code: 200, data: { task_id: "TASK-4" } });
    }
    return mockResponse({ code: 200, data: [{ task_id: "TASK-4", status: "Running" }] });
  };
  try {
    await assert.rejects(
      () => new Client({ apiKey: "secret-token" }).scrape(
        "linkedin_company_information_by-url",
        { url: "https://www.linkedin.com/company/example" },
        { maxWaitSeconds: 1 },
      ),
      (error) => error instanceof ThorDataWebScraperError
        && error.errorCode === "wait_timeout"
        && error.taskId === "TASK-4",
    );
    assert.equal(submissions, 1);
  } finally {
    global.fetch = oldFetch;
  }
});
