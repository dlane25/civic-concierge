// Exercises the Milestone 3 orchestrator: run_permit_workflow, plus the
// individual step tools it wraps, covering the happy path and both stop
// conditions (a blocked location, a failed inspection).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function firstText(result: any): string {
  return result.content[0].text;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  console.log(`\n${name}(${JSON.stringify(args)}) ${result.isError ? "[isError]" : ""}:`, firstText(result));
  return result;
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
  const client = new Client({ name: "civic-concierge-permit-workflow-test", version: "0.3.0" });
  await client.connect(transport);

  console.log("=== Scenario 1: orchestrator drives a case all the way to issuance, one missing input at a time ===");
  const open1 = await call(client, "start_food_truck_permit", { applicantName: "Taco Volador LLC" });
  const caseId1 = JSON.parse(firstText(open1)).case.caseId;

  // No location yet -> should stop at eligibility_check.
  await call(client, "run_permit_workflow", { caseId: caseId1 });
  // Now give a valid location -> should run eligibility + fee, then stop needing an inspection date.
  await call(client, "run_permit_workflow", { caseId: caseId1, proposedLocation: "88 Commerce Way" });
  // Grab a valid slot from the blocked response's message, then supply it -> stops needing inspection result.
  const slotsResult = await client.callTool({ name: "run_permit_workflow", arguments: { caseId: caseId1 } });
  const slotsMsg = firstText(slotsResult);
  console.log("\nrun_permit_workflow (checking blocked-on message):", slotsMsg);
  const firstSlot = JSON.parse(slotsMsg).message.match(/\d{4}-\d{2}-\d{2}/)[0];
  await call(client, "run_permit_workflow", { caseId: caseId1, preferredInspectionDate: firstSlot });
  // Finally supply the passing inspection result -> should complete the whole thing.
  await call(client, "run_permit_workflow", { caseId: caseId1, inspectionPassed: true });

  console.log("\n=== Scenario 2: a blocked location is denied outright ===");
  const open2 = await call(client, "start_food_truck_permit", { applicantName: "Frios Paletas" });
  const caseId2 = JSON.parse(firstText(open2)).case.caseId;
  await call(client, "run_permit_workflow", { caseId: caseId2, proposedLocation: "1 Main St, Downtown Historic District" });

  console.log("\n=== Scenario 3: failed inspection requires rescheduling ===");
  const open3 = await call(client, "start_food_truck_permit", { applicantName: "Curbside Curry" });
  const caseId3 = JSON.parse(firstText(open3)).case.caseId;
  await call(client, "check_permit_eligibility", { caseId: caseId3, proposedLocation: "200 Riverside Dr" });
  await call(client, "pay_permit_fee", { caseId: caseId3, paymentMethod: "check" });
  const slots3 = await call(client, "run_permit_workflow", { caseId: caseId3 });
  const slot3 = JSON.parse(firstText(slots3)).message.match(/\d{4}-\d{2}-\d{2}/)[0];
  await call(client, "schedule_health_inspection", { caseId: caseId3, preferredDate: slot3 });
  await call(client, "record_inspection_result", { caseId: caseId3, passed: false, notes: "Missing fire extinguisher" });
  // Try to sign off anyway -> should be rejected since inspection isn't complete.
  await call(client, "request_fire_marshal_signoff", { caseId: caseId3 });
  // Reschedule and pass this time.
  await call(client, "schedule_health_inspection", { caseId: caseId3, preferredDate: slot3 });
  await call(client, "record_inspection_result", { caseId: caseId3, passed: true });
  await call(client, "request_fire_marshal_signoff", { caseId: caseId3 });
  await call(client, "issue_permit", { caseId: caseId3 });

  await client.close();
}

main().catch((err) => {
  console.error("Permit workflow test failed:", err);
  process.exit(1);
});
