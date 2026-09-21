// Quick check that a fresh server process, backed by the same SQLite file,
// can still see cases opened by an earlier process (i.e. real persistence,
// not just in-memory survival within one running server).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
  const client = new Client({ name: "civic-concierge-persistence-check", version: "0.2.0" });
  await client.connect(transport);

  const result = await client.callTool({ name: "list_my_cases", arguments: { applicantName: "Maria Sandoval" } });
  console.log("list_my_cases after server restart:", (result.content as any)[0].text);

  await client.close();
}

main().catch((err) => {
  console.error("Persistence check failed:", err);
  process.exit(1);
});
