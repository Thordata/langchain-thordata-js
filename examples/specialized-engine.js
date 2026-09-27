const { Client } = require("../src");

async function main() {
  const client = new Client();
  const result = await client.search({
    engine: "google_flights",
    departure_id: "SFO",
    arrival_id: "JFK",
    outbound_date: "2026-10-01",
    return_date: "2026-10-08",
  });
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
