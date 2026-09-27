"use strict";

function createThorDataSearchTool({ client, ...clientOptions } = {}) {
  const { ThorDataClient } = require("./index");
  let DynamicStructuredTool;
  let z;
  try {
    ({ DynamicStructuredTool } = require("@langchain/core/tools"));
    z = require("zod");
  } catch (error) {
    throw new Error(
      "LangChain.js support requires @langchain/core and zod. Install them with `npm install @langchain/core zod`.",
      { cause: error },
    );
  }

  const resolvedClient = client || new ThorDataClient(clientOptions);
  const schema = z.object({
    query: z.string().min(1).optional().describe("Search query, sent as text for Yandex and q otherwise."),
    engine: z.string().default("google_search").describe("ThorData SERP engine."),
    country: z.string().optional().describe("Two-letter country code, sent as gl."),
    language: z.string().optional().describe("Language code, sent as hl."),
    location: z.string().optional(),
    num: z.number().int().positive().optional(),
    page: z.number().int().positive().optional(),
    safe: z.enum(["active", "off"]).optional(),
    time_range: z.string().optional().describe("Google tbs time filter."),
    params: z.record(z.any()).default({}).describe("Additional /request form parameters."),
  });

  return new DynamicStructuredTool({
    name: "thordata_search",
    description:
      "Search current Google, Bing, Yandex, or DuckDuckGo results with ThorData. " +
      "Use params for specialized engines such as flights, hotels, scholar, patents, and AI results.",
    schema,
    func: async (input) => {
      const result = await resolvedClient.search({
        ...input.params,
        query: input.query,
        engine: input.engine,
        country: input.country,
        language: input.language,
        location: input.location,
        num: input.num,
        page: input.page,
        safe: input.safe,
        tbs: input.time_range,
      });
      return JSON.stringify(result);
    },
  });
}

module.exports = {
  createThorDataSearchTool,
  ThorDataSearchTool: createThorDataSearchTool,
};
