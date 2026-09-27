const test = require("node:test");
const assert = require("node:assert/strict");

const { Client, createThorDataSearchTool } = require("../src");

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
