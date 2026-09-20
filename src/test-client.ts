import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
  const client = new Client({ name: "civic-concierge-test-client", version: "0.1.0" });

  await client.connect(transport);
  console.log("Negotiated protocol version:", client.getServerVersion());

  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map((t) => t.name));

  const infoResult = await client.callTool({ name: "city_info", arguments: {} });
  console.log("city_info result:", infoResult.content);

  const openResult = await client.callTool({
    name: "start_food_truck_permit",
    arguments: { applicantName: "Taco Volador LLC" },
  });
  console.log("start_food_truck_permit result:", openResult.content);

  const parsed = JSON.parse((openResult.content as any)[0].text);
  const caseId = parsed.case.caseId;

  const statusResult = await client.callTool({ name: "get_case_status", arguments: { caseId } });
  console.log("get_case_status result:", statusResult.content);

  await client.close();
}

main().catch((err) => {
  console.error("Test client failed:", err);
  process.exit(1);
});
