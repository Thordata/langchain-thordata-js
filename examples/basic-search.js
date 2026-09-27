const { Client } = require("../src");

async function main() {
  const client = new Client({ apiToken: process.env.THORDATA_API_TOKEN });
  const result = await client.search({
    engine: "google",
    q: "latest AI agent research",
    gl: "us",
    hl: "en",
    num: 5,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
