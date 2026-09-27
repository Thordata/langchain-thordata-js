const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("../src");
const { run } = require("../scripts/qa/live-task-id");

async function runMocked(bodies, options = {}) {
  const oldFetch = global.fetch;
  const calls = [];
  const output = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    assert.ok(calls.length <= bodies.length, "Unexpected extra API request");
    return new Response(JSON.stringify(bodies[calls.length - 1]), { status: 200 });
  };
  try {
    const reports = await run({
      client: new Client({ apiKey: "mock-secret-key", apiUrl: "https://scraperapi.thordata.com/request" }),
      log: (text) => output.push(text),
      ...options,
    });
    return { reports, calls, output };
  } finally {
    global.fetch = oldFetch;
  }
}

test("live script sends two mocked searches and distinguishes metadata from task IDs", async () => {
  const { reports, calls } = await runMocked([
    { code: 200, organic: [], search_metadata: { id: "search-1" } },
    { code: 200, data: { task_id: "task-2", result: { answer: "mock answer" } } },
  ]);
  assert.equal(calls.length, 2);
  for (const [index, engine] of ["google", "google_ai_mode"].entries()) {
    assert.equal(calls[index].url, "https://scraperapi.thordata.com/request");
    assert.equal(calls[index].init.method, "POST");
    assert.equal(calls[index].init.body.get("engine"), engine);
    assert.equal(calls[index].init.body.get("q"), "pizza");
    assert.equal(calls[index].init.body.get("json"), "1");
    assert.equal(calls[index].init.body.get("isjson"), "1");
    assert.equal(reports[index].requestStatus, "PASS");
  }
  assert.equal(reports[0].taskIdStatus, "INFO");
  assert.equal(reports[0].sdkTaskId, null);
  assert.equal(reports[0].searchMetadataId, "search-1");
  assert.equal(reports[1].taskIdStatus, "PASS");
  assert.equal(reports[1].sdkTaskId, "task-2");
});

test("live script detects an explicit task ID missed by the SDK and redacts raw output", async () => {
  const { reports, output } = await runMocked([
    { code: 200, task_id: "task-1", organic: [], echo: "mock-secret-key" },
    { code: 200, data: { task_id: "task-2", result: {} } },
  ], { showRaw: true });
  assert.equal(reports[0].taskIdStatus, "FAIL");
  assert.equal(reports[0].topLevelTaskId, "task-1");
  assert.equal(reports[0].sdkTaskId, null);
  assert.equal(reports[1].taskIdStatus, "PASS");
  assert.ok(output.some((text) => text.includes('"echo": "***"')));
  assert.ok(output.every((text) => !text.includes("mock-secret-key")));
});

test("live script reports business errors separately and does not retry", async () => {
  const { reports, calls, output } = await runMocked([
    { code: 401, data: "Authentication failed: mock-secret-key" },
    { code: 300, data: "error, not search" },
  ]);
  assert.equal(calls.length, 2);
  for (const report of reports) {
    assert.equal(report.requestStatus, "FAIL");
    assert.equal(report.taskIdStatus, "SKIP");
    assert.equal(report.httpStatus, 200);
  }
  assert.equal(reports[0].businessCode, 401);
  assert.equal(reports[0].errorType, "ThorDataAuthenticationError");
  assert.equal(reports[1].businessCode, 300);
  assert.equal(reports[1].errorType, "ThorDataNotCollectedError");
  assert.ok(output.every((text) => !text.includes("mock-secret-key")));
});

test("live script does not report a non-object response as a successful JSON search", async () => {
  const { reports, calls } = await runMocked([
    "Unexpected upstream response",
    { code: 200, data: { task_id: "task-2", result: {} } },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(reports[0].requestStatus, "FAIL");
  assert.equal(reports[0].taskIdStatus, "SKIP");
  assert.match(reports[0].message, /Expected a JSON object/);
  assert.equal(reports[1].taskIdStatus, "PASS");
});
