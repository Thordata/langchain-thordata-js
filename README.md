# LangChain Thordata for JavaScript/TypeScript

Connect [Thordata](https://www.thordata.com/?ls=github01&lk=github01)
SERP to JavaScript, Node.js, and LangChain.js applications for real-time
search.

This SDK exposes Thordata SERP and selected Web Scraper capabilities through a
small JavaScript/TypeScript client and optional LangChain.js tools.

## Install

```bash
npm install langchain-thordata
```

Node.js 18 or newer is required because the client uses the built-in `fetch`.
Set a normal ThorData SERP API key in `THORDATA_API_KEY` or
`THORDATA_API_TOKEN`.

## Basic search

```js
const { Client } = require("langchain-thordata");

async function main() {
  const client = new Client();
  const result = await client.search({
    engine: "google",
    q: "latest AI agent research",
    gl: "us",
    hl: "en",
    num: 5,
  });
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

`Client` also exposes `searchJson`, `rawSearch`, and `searchResponse`. Requests
are `POST` form submissions with
`Authorization: Bearer <key>`. The SDK normalizes boolean values to `"1"` or
`"0"`. The default request timeout is 30 seconds; some engines (for example
`google_ai_mode`) can run close to that limit, so pass a larger `timeout`
(ms) when needed: `new Client({ timeout: 60000 })`.

The current `/request` endpoint does not guarantee HTML, so the misleading
`searchHtml()` helper is not exposed. The convenience fields `query`,
`country`, and `language` map to `q`, `gl`, and `hl`; explicit API-native
fields remain available. For Yandex, `query` or `q` is sent as `text`.

## Specialized engines

All engines and form parameters read by ThorData `/request` are accepted. Use
the API-native parameter names for specialized engines:

```js
const { Client } = require("langchain-thordata");

async function main() {
  const client = new Client();
  const flights = await client.search({
    engine: "google_flights",
    departure_id: "SFO",
    arrival_id: "JFK",
    outbound_date: "2026-10-01",
    return_date: "2026-10-08",
  });
  console.log(flights);
}

main().catch(console.error);
```

For compatibility, `google_search` is sent as `google`, and `google_places` is
sent as `google_local`. Note that Yandex uses its native `text` field for the
query instead of `q`. Web Scrapers are exposed through the separate methods
below, rather than as SERP engines. Unknown SERP parameters are ignored
according to the integration constraints.

Business code `300` raises `ThorDataNotCollectedError`. All API errors retain
their numeric `code` for programmatic handling.

JSON-string response envelopes are normalized by the client before the
LangChain tool serializes its result, so callers parse the tool output once.

## Web Scraper

The client supports exactly these seven Web Scraper IDs:

- `linkedin_company_information_by-url` with `url`
- `linkedin_job_listings_information_by-job-url` with `job_url`
- `youtube_video-post_by-keyword` with `keyword` and optional `num_of_posts`
- `facebook_profile_by-profiles-url` with `url`
- `youtube_video-post_by-explore` with `url` and optional boolean `all_tabs`
- `twitter_profile_by-profileurl` with `url`
- `amazon_product_by-category-url` with `url`, optional positive `page_turning`, and optional `sort_by`

`scrape` waits for the final records. `scrapeResponse` also returns `taskId`,
`spiderId`, status, and record counts:

```js
const { Client } = require("langchain-thordata");

const client = new Client();
const response = await client.scrapeResponse(
  "linkedin_company_information_by-url",
  { url: "https://www.linkedin.com/company/microsoft" },
  { maxWaitSeconds: 300, includeErrors: true, fileName: "{{TasksID}}" },
);
console.log(response.result, response.taskId, response.status);
```

The SDK submits one task, polls every five seconds, and waits at most 300
seconds per call. `maxWaitSeconds` is an integer from 1 to 300 (default 300).
The total budget includes requests, response bodies, polling delays, and result
parsing. Expired calls cannot return success. A timeout after submission keeps
the task ID; it does not cancel the remote task or submit another one.
`signal` can cancel the local wait and active request. The client's `timeout`
(milliseconds) also caps each HTTP request. If that cap expires before the
server confirms a task ID, the SDK reports `submission_unknown` and does not
retry because the remote submission outcome cannot be known safely.
`all_tabs: false` is converted to the service's current `flase` wire value.
Partial records are returned with `status: "partial"`; an all-failed result
raises `ThorDataWebScraperError`. The Web Scraper uses the same API key aliases
as SERP and fixed Thordata endpoints.
Web Scraper POST requests also send the string form fields `api_source=sdk`
and `source_platform=langchain-js`; these values are not sent as headers.

With `includeErrors: true`, a failed task triggers one best-effort retrieval
of error records within the remaining budget. `ThorDataWebScraperError` retains
`errorCode: "scrape_failed"`, `taskId`, and a sanitized message; `serviceCode`
contains the server's error code when available. If diagnostics are unavailable,
the original failure is preserved. Redirects are not followed.

`num_of_posts` and `page_turning` accept positive integer values (including
`3.0`) or digit strings up to `Number.MAX_SAFE_INTEGER`. Booleans, fractional
and non-finite values are rejected. Amazon sends `page_turning` only when it is
provided; otherwise the service uses its default. `sort_by` accepts the schema
values and the documentation aliases `Average Rating` and `Featured Recommendations`,
which are converted before sending. Other scrapers outside these seven
IDs require the raw Web Scraper API.

`scrapeResponse()` reports `completed`, `partial`, or `empty`, and always
includes `errorRecordCount` (zero when there are no error records). `empty`
means the parsed records contain no meaningful result content; it is not proof
of an upstream parsing failure. `scrape()` and the LangChain tool continue to
return only the records. Use `scrapeResponse()` when status matters.

Result redaction replaces known request and download credentials, including
URL-encoded spellings. It preserves other fields, whitespace, long text, and
public signed image URLs. After setting the API key, run the standalone example:

```bash
node examples/scrape-basic.js "https://www.linkedin.com/company/microsoft"
```

## LangChain.js

Install the optional adapter dependencies:

```bash
npm install @langchain/core zod
```

Then create a tool for a LangChain.js agent:

```js
const { createThorDataSearchTool } = require("langchain-thordata");

async function main() {
  const searchTool = createThorDataSearchTool();
  const result = await searchTool.invoke({
    query: "latest AI agent research",
    engine: "google_search",
    country: "us",
    language: "en",
  });
  console.log(result);
}

main().catch(console.error);
```

The `params` input carries engine-specific fields such as `departure_id`,
`product_id`, `author_id`, or `patent_id`.

Create the independent Web Scraper tool when an agent needs structured records:

```js
const { createThorDataWebScraperTool } = require("langchain-thordata");

const scraperTool = createThorDataWebScraperTool();
const result = await scraperTool.invoke({
  spider_id: "youtube_video-post_by-keyword",
  params: { keyword: "machine learning", num_of_posts: 10 },
});
console.log(result);
```

## Local verification

```bash
npm test
npm run check
```

Tests use a mocked `fetch` and do not consume ThorData credits. A live test
requires a normal `/request` SERP API key. Maintainers can run the live
task ID QA script described in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Learn more

- [Thordata SERP API](https://www.thordata.com/?ls=github01&lk=github01)
- [Thordata SERP API documentation](https://doc.thordata.com/doc/scraping/serp-api)
