const { createThorDataSearchTool } = require("../src/langchain");

async function main() {
  const tool = createThorDataSearchTool();
  const result = await tool.invoke({
    query: "latest AI agent research",
    engine: "google_search",
    country: "us",
    language: "en",
  });
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
