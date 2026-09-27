# Changelog

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
