const test = require("node:test");
const assert = require("node:assert/strict");

const {
  Client,
  createThorDataSearchTool,
  createThorDataWebScraperTool,
} = require("../src");

test("LangChain tool maps Yandex query to text", async () => {
  const oldFetch = global.fetch;
  global.fetch = async (_url, init) => {
    assert.equal(init.body.get("engine"), "yandex");
    assert.equal(init.body.get("text"), "LangChain Yandex");
    assert.equal(init.body.has("q"), false);
    return new Response(JSON.stringify({ code: 200, data: { result: { organic: [] } } }));
  };
  try {
    const client = new Client({ apiKey: "secret-token" });
    const tool = createThorDataSearchTool({ client });

    assert.equal(
      await tool.invoke({ query: "LangChain Yandex", engine: "yandex" }),
      '{"organic":[]}',
    );
  } finally {
    global.fetch = oldFetch;
  }
});

test("LangChain tool serializes normalized JSON string results once", async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    code: 200,
    data: { result: JSON.stringify({ organic: [] }) },
  }));
  try {
    const tool = createThorDataSearchTool({ client: new Client({ apiKey: "secret-token" }) });
    assert.equal(await tool.invoke({ query: "string result" }), '{"organic":[]}');
  } finally {
    global.fetch = oldFetch;
  }
});

test("Web Scraper LangChain tool exposes only scraper inputs and returns records", async () => {
  const client = new Client({ apiKey: "secret-token" });
  const received = {};
  client.scrape = async (spiderId, params, options) => {
    received.spiderId = spiderId;
    received.params = params;
    received.options = options;
    return [{ name: "Example", success: true }];
  };
  const tool = createThorDataWebScraperTool({ client });

  assert.deepEqual(Object.keys(tool.schema.shape), [
    "spider_id",
    "params",
    "max_wait_seconds",
    "include_errors",
    "file_name",
  ]);
  assert.equal(await tool.invoke({
    spider_id: "youtube_video-post_by-explore",
    params: { url: "https://www.youtube.com/feed/explore", all_tabs: false },
    max_wait_seconds: 120,
    include_errors: false,
    file_name: "example-file",
  }), '[{"name":"Example","success":true}]');
  assert.deepEqual(received, {
    spiderId: "youtube_video-post_by-explore",
    params: { url: "https://www.youtube.com/feed/explore", all_tabs: false },
    options: { maxWaitSeconds: 120, includeErrors: false, fileName: "example-file" },
  });
  assert.equal(JSON.stringify(tool.schema).includes("apiKey"), false);
});
