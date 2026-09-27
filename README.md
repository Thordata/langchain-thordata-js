# LangChain Thordata for JavaScript/TypeScript

Connect [Thordata](https://www.thordata.com/products/serp-api)
SERP to JavaScript, Node.js, and LangChain.js applications for real-time
search.

This SDK exposes Thordata search capabilities through a small
JavaScript/TypeScript client and an optional LangChain.js tool for Thordata's
ordinary `/request` endpoint.

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
query instead of `q`. Web Scraper engines are intentionally not exposed.
Unknown parameters are ignored according to the integration constraints.

Business code `300` raises `ThorDataNotCollectedError`. All API errors retain
their numeric `code` for programmatic handling.

JSON-string response envelopes are normalized by the client before the
LangChain tool serializes its result, so callers parse the tool output once.

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

## Local verification

```bash
npm test
npm run check
```

Tests use a mocked `fetch` and do not consume ThorData credits. A live test
requires a normal `/request` SERP API key. Maintainers can run the live
task ID QA script described in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Learn more

- [Thordata SERP API](https://www.thordata.com/products/serp-api)
- [Thordata SERP API documentation](https://doc.thordata.com/doc/scraping/serp-api)
