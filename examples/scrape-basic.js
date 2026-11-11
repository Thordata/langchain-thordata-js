"use strict";

const { Client, ThorDataWebScraperError } = require("../src");

async function main() {
  const url = process.argv[2];
  if (!url || url === "--help") {
    console.log("Usage: node examples/scrape-basic.js <LinkedIn company URL>");
    return;
  }
  const client = new Client();
  try {
    const response = await client.scrapeResponse(
      "linkedin_company_information_by-url",
      { url },
      { maxWaitSeconds: 300, includeErrors: true },
    );
    console.log(JSON.stringify({
      taskId: response.taskId,
      status: response.status,
      recordCount: response.recordCount,
      errorRecordCount: response.errorRecordCount,
      result: response.result,
    }, null, 2));
  } catch (error) {
    if (!(error instanceof ThorDataWebScraperError)) throw error;
    console.error(JSON.stringify({
      errorCode: error.errorCode,
      serviceCode: error.serviceCode,
      taskId: error.taskId,
      stage: error.stage,
      message: error.message,
    }));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
