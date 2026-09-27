const { Client } = require("../src");

async function main() {
  const client = new Client({ apiKey: process.env.THORDATA_API_KEY });
  const result = await client.search({ engine: "google", q: "ThorData", json: 1 });
  console.log("result:", result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
