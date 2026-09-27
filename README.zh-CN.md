# JavaScript/TypeScript 版 LangChain Thordata

[English README](./README.md) | 简体中文

将 [Thordata](https://www.thordata.com/products/serp-api)
SERP 接入 JavaScript、Node.js 和 LangChain.js 应用，用于实时搜索。

此 SDK 通过轻量的 JavaScript/TypeScript 客户端和可选的 LangChain.js 工具提供
Thordata 搜索能力，并面向 Thordata 的普通 `/request` 端点。

## 安装

```bash
npm install langchain-thordata
```

客户端使用内置的 `fetch`，因此需要 Node.js 18 或更高版本。请在
`THORDATA_API_KEY` 或 `THORDATA_API_TOKEN` 中设置普通的 Thordata SERP API
密钥。

## 基础搜索

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

`Client` 还公开 `searchJson`、`rawSearch` 和 `searchResponse`。请求是带有
`Authorization: Bearer <key>` 的 `POST` 表单
提交。SDK 会将布尔值规范化为 `"1"` 或 `"0"`。默认请求超时为 30 秒；部分引擎
（例如 `google_ai_mode`）耗时可能接近该上限，如有需要可传入更大的 `timeout`
（毫秒）：`new Client({ timeout: 60000 })`。

当前 `/request` 端点不保证返回 HTML，因此不再公开容易误导的 `searchHtml()`。
便捷字段 `query`、`country` 和 `language` 会映射到 `q`、`gl` 和 `hl`，显式
API 原生字段仍可直接使用。对于 Yandex，`query` 或 `q` 会作为 `text` 发送。

## 专用引擎

接受 Thordata `/request` 可读取的所有引擎和表单参数。专用引擎请使用 API
原生参数名：

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

为保持兼容性，`google_search` 会作为 `google` 发送，`google_places` 会作为
`google_local` 发送。请注意，Yandex 使用其原生的 `text` 字段作为搜索词，
而不是 `q`。Web Scraper 引擎不会被公开。根据集成约束，未知参数会被忽略。

业务码 `300` 会抛出 `ThorDataNotCollectedError`。所有 API 异常仍保留数值
`code` 供程序判断。

客户端会在 LangChain 工具序列化之前统一解析 JSON 字符串形式的响应 envelope，
因此调用方只需要解析工具输出一次。

## LangChain.js

安装可选的适配器依赖：

```bash
npm install @langchain/core zod
```

然后为 LangChain.js agent 创建工具：

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

`params` 输入承载引擎专用字段，例如 `departure_id`、`product_id`、
`author_id` 或 `patent_id`。

## 本地验证

```bash
npm test
npm run check
```

测试使用模拟的 `fetch`，不会消耗 Thordata 点数。实时测试需要普通的
`/request` SERP API 密钥。维护者使用的实时 task ID 质检脚本说明见
[CONTRIBUTING.md](./CONTRIBUTING.md)。

## 了解更多

- [Thordata SERP API](https://www.thordata.com/products/serp-api)
- [Thordata SERP API 文档](https://doc.thordata.com/doc/scraping/serp-api)
