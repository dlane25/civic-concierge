/**
 * An offline stand-in for BedrockAgent, used only because this development
 * environment has no AWS credentials to test the real Bedrock integration
 * against. It is NOT a hackathon submission path and is never claimed as
 * one -- see README "AWS setup" for why it exists and how to switch to
 * the real Bedrock agent once you have credentials.
 *
 * It uses simple pattern matching instead of an LLM to decide which tool
 * to call, but calls the exact same McpToolRunner (same MCP server, same
 * Streamable HTTP transport, same tools) that BedrockAgent does -- so
 * running the web chat in mock mode still genuinely proves the MCP
 * wiring, the web UI, and the tool-call plumbing all work end to end.
 */
import { McpToolRunner } from "./mcpToolRunner.js";
import type { Agent, AgentTurnResult, ToolCallRecord } from "./agent.js";

interface Session {
  applicantName?: string;
  lastCaseId?: string;
}

export class MockAgent implements Agent {
  readonly mode = "mock (offline -- no AWS credentials configured, see README)";
  private toolRunner: McpToolRunner;
  private sessions = new Map<string, Session>();

  constructor(mcpUrl: string) {
    this.toolRunner = new McpToolRunner(mcpUrl);
  }

  async chat(sessionId: string, userText: string): Promise<AgentTurnResult> {
    const session = this.sessions.get(sessionId) ?? {};
    this.sessions.set(sessionId, session);
    const toolCalls: ToolCallRecord[] = [];
    const text = userText.trim();
    const lower = text.toLowerCase();

    const runTool = async (name: string, args: Record<string, unknown>) => {
      const { text: result, isError } = await this.toolRunner.callTool(name, args);
      toolCalls.push({ name, args, result, isError });
      return { result, isError };
    };

    const caseIdMatch = text.match(/\b(FTP|UB|SR)-\d{6}\b/i);
    if (caseIdMatch) session.lastCaseId = caseIdMatch[0].toUpperCase();
    const nameMatch = text.match(/(?:my name is|i'?m|i am|for) ([A-Z][\w' ]{1,40}?)(?=[.,!]|\s+(?:and|who|that|i)\b|$)/i);
    if (nameMatch) session.applicantName = nameMatch[1].trim();

    // --- Intent: start a food truck permit ---
    if (/food truck|permit/i.test(text) && /start|open|apply|new/i.test(text)) {
      const applicant = session.applicantName ?? "Anonymous Applicant";
      const { result } = await runTool("start_food_truck_permit", { applicantName: applicant });
      const parsed = JSON.parse(result);
      session.lastCaseId = parsed.case.caseId;
      return { reply: `Opened a food truck permit case for ${applicant}: ${parsed.case.caseId}. What location are you proposing to operate at?`, toolCalls };
    }

    // --- Intent: advance the permit workflow (run_permit_workflow) ---
    if (session.lastCaseId?.startsWith("FTP") && (/location|inspect|eligib|fee|pay|pass|fail|sign ?off|issue|run|continue|next/i.test(lower))) {
      const args: Record<string, unknown> = { caseId: session.lastCaseId };
      const locationMatch = text.match(/(?:at|location(?: is)?)\s+(.+)/i);
      if (locationMatch) args.proposedLocation = locationMatch[1].trim();
      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) args.preferredInspectionDate = dateMatch[0];
      if (/\bpassed\b/i.test(lower)) args.inspectionPassed = true;
      if (/\bfailed\b/i.test(lower)) args.inspectionPassed = false;
      const { result } = await runTool("run_permit_workflow", args);
      const parsed = JSON.parse(result);
      return { reply: parsed.message ?? result, toolCalls };
    }

    // --- Intent: utility balance / payment plan ---
    const accountMatch = text.match(/\bUB-\d{6}\b/i);
    if (accountMatch && /balance|owe|bill/i.test(lower)) {
      const { result, isError } = await runTool("check_utility_balance", { accountNumber: accountMatch[0].toUpperCase() });
      if (isError) return { reply: result, toolCalls };
      const account = JSON.parse(result);
      return {
        reply: `${account.holderName}'s balance is $${account.currentBalance}, due ${account.dueDate}.${account.pastDue ? " This account is past due." : ""}${account.paymentPlanEligible ? " It's eligible for a payment plan if you'd like one." : ""}`,
        toolCalls,
      };
    }
    if (accountMatch && /payment plan|installment/i.test(lower)) {
      const installmentsMatch = text.match(/(\d+)\s*(?:installments|months|payments)/i);
      const installments = installmentsMatch ? Number(installmentsMatch[1]) : 3;
      const { result } = await runTool("start_utility_payment_plan", { accountNumber: accountMatch[0].toUpperCase(), installments });
      const parsed = JSON.parse(result);
      return { reply: parsed.message ?? result, toolCalls };
    }

    // --- Intent: file a 311 request ---
    const categories = ["pothole", "streetlight_outage", "illegal_dumping", "water_leak", "animal_control"];
    const category = categories.find((c) => lower.includes(c.replace("_", " ")) || lower.includes(c));
    if (category) {
      const applicant = session.applicantName ?? "Anonymous Resident";
      const locationMatch = text.match(/(?:at|near|on)\s+([\w0-9 .]+?)(?=[.,!]|$)/i);
      const { result } = await runTool("file_service_request", {
        requesterName: applicant,
        category,
        location: locationMatch ? locationMatch[1].trim() : "unspecified location",
        description: text,
      });
      const parsed = JSON.parse(result);
      return { reply: parsed.message ?? result, toolCalls };
    }

    // --- Intent: list my cases ---
    if (/my cases|my stuff|what.*(open|going on)/i.test(lower) && session.applicantName) {
      const { result } = await runTool("list_my_cases", { applicantName: session.applicantName });
      return { reply: result, toolCalls };
    }

    // --- Fallback: city info ---
    if (/city|department|hours/i.test(lower)) {
      const { result } = await runTool("city_info", {});
      const parsed = JSON.parse(result);
      return { reply: `${parsed.name} has ${parsed.departments.length} departments and is open ${parsed.officeHours}.`, toolCalls };
    }

    return {
      reply:
        "I didn't recognize that (this is the offline mock agent, which only understands a few fixed patterns -- see README). Try: \"start a food truck permit for Taco Volador\", \"check my utility balance for UB-100234\", or \"file a pothole report at 412 Bluebonnet Ln\".",
      toolCalls,
    };
  }
}
