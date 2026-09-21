import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function firstText(result: any): string {
  return result.content[0].text;
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
  const client = new Client({ name: "civic-concierge-test-client", version: "0.2.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(
    "Tools:",
    tools.tools.map((t) => t.name)
  );

  // --- Permits & Licensing ---
  const permit = await client.callTool({
    name: "start_food_truck_permit",
    arguments: { applicantName: "Taco Volador LLC" },
  });
  console.log("\nstart_food_truck_permit:", firstText(permit));

  // --- Utility Billing ---
  const balance = await client.callTool({ name: "check_utility_balance", arguments: { accountNumber: "UB-100234" } });
  console.log("\ncheck_utility_balance:", firstText(balance));

  const plan = await client.callTool({
    name: "start_utility_payment_plan",
    arguments: { accountNumber: "UB-100234", installments: 4 },
  });
  console.log("\nstart_utility_payment_plan:", firstText(plan));

  // --- Public Works (311) ---
  const request = await client.callTool({
    name: "file_service_request",
    arguments: {
      requesterName: "Maria Sandoval",
      category: "pothole",
      location: "412 Bluebonnet Ln",
      description: "Deep pothole blocking the right lane",
    },
  });
  console.log("\nfile_service_request:", firstText(request));

  // --- Cross-cutting: list every case Maria Sandoval has open ---
  const mine = await client.callTool({ name: "list_my_cases", arguments: { applicantName: "Maria Sandoval" } });
  console.log("\nlist_my_cases (Maria Sandoval):", firstText(mine));

  // --- Error path: unknown utility account ---
  const badAccount = await client.callTool({ name: "check_utility_balance", arguments: { accountNumber: "UB-999999" } });
  console.log("\ncheck_utility_balance (bad account, expect isError):", badAccount.isError, firstText(badAccount));

  await client.close();
}

main().catch((err) => {
  console.error("Test client failed:", err);
  process.exit(1);
});
