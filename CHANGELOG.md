# Changelog

## Unreleased

- Make Amazon `page_turning` optional and map documentation sort labels to the
  schema values before submitting requests.

## 0.3.0 - 2026-11-10

- Enforce the total Web Scraper deadline through body reads and parsing, support
  cancellation during polling, and prohibit automatic redirects.
- Preserve ordinary signed URLs and result fields while masking known request
  and download credentials.
- Retrieve failure diagnostics within the remaining budget and expose
  `serviceCode` without retrying submissions.
- Align runtime exports, error inheritance, and TypeScript declarations;
  always return `errorRecordCount`.
- Align integer validation across both SDKs and add a standalone scraper example.
- Keep short credential values from changing ordinary business text while still
  masking exact credential fields and explicit credential syntax.
- Document submission-time timeout semantics and no automatic retry behavior.

- Add fixed-scope Web Scraper support for seven Thordata spider IDs.
- Add `scrape`/`scrapeResponse` and an independent LangChain Web Scraper tool.
- Add five-second polling, a 300-second maximum wait, partial-result handling,
  trusted download URL validation, and API-key redaction.
- Send Web Scraper attribution as POST form fields for the JavaScript integration.
- Preserve long result strings and newlines, and flatten concatenated download
  chunks returned by the Web Scraper download endpoint.

## 0.2.0

- Send LangChain integration metadata in both compatibility and attribution headers.
- Map Yandex searches to the required `text` parameter.
- Remove unsupported `google_ai_overview` and `bing_product` engines.
- Remove the misleading `searchHtml()` API because `/request` does not guarantee HTML output.
- Add `ThorDataNotCollectedError` for business code `300`.
- Add flat-response and LangChain tool regression coverage.
- Normalize JSON-string response envelopes before LangChain serialization.

## 0.1.0

- Add the ThorData SERP client and optional LangChain.js search tool.
