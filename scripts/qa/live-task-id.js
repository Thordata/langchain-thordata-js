const { parseArgs } = require("node:util");
const { Client } = require("../../src");

function toId(value) {
  return value == null || value === "" ? null : String(value);
}

async function run({ client = new Client(), showRaw = false, log = console.log } = {}) {
  const reports = [];
  const print = (value) => {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    log(text.split(client.apiKey).join("***"));
  };

  print("Live /request test: two requests, no retries; API credits may be consumed.");
  for (const engine of ["google", "google_ai_mode"]) {
    const params = { engine, q: "pizza", json: 1, isjson: 1 };
    const startedAt = Date.now();
    let report;
    try {
      const response = await client.searchResponse(params);
      if (!response.raw || typeof response.raw !== "object" || Array.isArray(response.raw)) {
        throw new Error("Expected a JSON object for json=1; API returned a different response shape.");
      }
      const dataTaskId = toId(response.raw?.data?.task_id);
      const topLevelTaskId = toId(response.raw?.task_id);
      const sdkTaskId = toId(response.taskId);
      const searchMetadataId = toId(response.result?.search_metadata?.id);
      const expectedTaskId = dataTaskId ?? topLevelTaskId;
      let taskIdStatus;
      let note;
      if (expectedTaskId !== null) {
        taskIdStatus = sdkTaskId === expectedTaskId ? "PASS" : "FAIL";
        note = taskIdStatus === "PASS"
          ? "SDK taskId matches the explicit API task_id."
          : "API returned an explicit task_id, but SDK taskId is missing or different.";
      } else {
        taskIdStatus = "INFO";
        note = searchMetadataId !== null
          ? "Only search_metadata.id is available. Confirm its meaning before treating it as taskId."
          : "No explicit task_id is available; taskId extraction cannot be verified.";
      }
      report = {
        engine,
        params,
        requestStatus: "PASS",
        businessCode: response.raw?.code ?? null,
        taskIdStatus,
        sdkTaskId,
        dataTaskId,
        topLevelTaskId,
        searchMetadataId,
        responseKeys: Object.keys(response.raw ?? {}),
        resultKeys: Object.keys(response.result ?? {}),
        note,
      };
      if (showRaw) {
        print(`${engine}: complete API response (not the supplier's original response)`);
        print(response.raw);
      }
    } catch (error) {
      report = {
        engine,
        params,
        requestStatus: "FAIL",
        taskIdStatus: "SKIP",
        errorType: error.name,
        businessCode: error.code ?? null,
        httpStatus: error.statusCode ?? null,
        message: error.message,
      };
    }
    report.durationMs = Date.now() - startedAt;
    reports.push(report);
    print(report);
  }
  const failed = reports.some((report) => report.requestStatus === "FAIL" || report.taskIdStatus === "FAIL");
  print(`Summary: ${failed ? "FAIL" : "PASS"}; INFO does not prove a taskId defect.`);
  return reports;
}

// Importing this script in unit tests must not start live requests.
if (require.main === module) {
  (async () => {
    const { values } = parseArgs({ options: { raw: { type: "boolean", default: false } } });
    const reports = await run({ showRaw: values.raw });
    if (reports.some((report) => report.requestStatus === "FAIL" || report.taskIdStatus === "FAIL")) {
      process.exitCode = 1;
    }
  })().catch((error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run };
