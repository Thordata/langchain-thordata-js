import {
  Client,
  DEFAULT_MAX_WAIT_SECONDS,
  ThorDataError,
  ThorDataWebScraperError,
  ThorDataWebScraperErrorOptions,
  WebScraperResponse,
} from "../../src";

const options: ThorDataWebScraperErrorOptions = {
  stage: "poll", taskId: "TASK-1", reason: "blocked", serviceCode: 1234,
};
const error: ThorDataError = new ThorDataWebScraperError("scrape_failed", options);
if (error instanceof ThorDataWebScraperError) {
  const serviceCode: string | number | null = error.serviceCode;
  const reason: string | null = error.reason;
  void [serviceCode, reason];
}

async function checkDeclarations() {
  const response: WebScraperResponse<{ name: string }[]> = await new Client({ apiKey: "test" }).scrapeResponse(
    "linkedin_company_information_by-url",
    { url: "https://www.linkedin.com/company/example" },
    { maxWaitSeconds: DEFAULT_MAX_WAIT_SECONDS, signal: new AbortController().signal },
  );
  const errors: number = response.errorRecordCount;
  const name: string = response.result[0].name;
  void [errors, name];
}
void checkDeclarations;
