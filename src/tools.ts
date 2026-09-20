import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CITY_INFO, UTILITY_ACCOUNTS, SERVICE_REQUEST_CATEGORIES, type ServiceRequestCategory } from "./data.js";
import { saveCase, getCase, listCasesByApplicant, nextCaseId, type CaseRecord, type CaseStep } from "./db.js";

const categoryNames = Object.keys(SERVICE_REQUEST_CATEGORIES) as ServiceRequestCategory[];

function now(): string {
  return new Date().toISOString();
}

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Registers all Civic Concierge tools on the given McpServer instance.
 *
 * Milestone 2 covers three city services, each opening a stateful,
 * multi-step case persisted to SQLite so it survives across sessions:
 *   - Permits & Licensing: start_food_truck_permit
 *   - Utility Billing: check_utility_balance, start_utility_payment_plan
 *   - Public Works (311): file_service_request
 *
 * Plus two cross-cutting tools:
 *   - get_case_status: look up any case by ID, regardless of type
 *   - list_my_cases: list every case opened by a given applicant name,
 *     across all three services (the "orchestrates across services"
 *     behavior the Alexa+ judging criteria calls out as creative).
 */
export function registerTools(server: McpServer) {
  // --- Read-only sanity tool -------------------------------------------
  server.registerTool(
    "city_info",
    {
      title: "Get City Info",
      description:
        "Returns basic information about the city (Rio Cardenal, TX, a fictional municipality used for this demo): departments, office hours, and population.",
      inputSchema: {},
    },
    async () => textResult(CITY_INFO)
  );

  // --- Permits & Licensing ----------------------------------------------
  server.registerTool(
    "start_food_truck_permit",
    {
      title: "Start Food Truck Permit Application",
      description:
        "Opens a new food truck permit case for an applicant and returns a case ID. The case persists across sessions so the workflow can be resumed later.",
      inputSchema: {
        applicantName: z.string().describe("Name of the person or business applying"),
      },
    },
    async ({ applicantName }: { applicantName: string }) => {
      const caseId = nextCaseId("FTP");
      const timestamp = now();
      const record: CaseRecord = {
        caseId,
        type: "food_truck_permit",
        status: "opened",
        createdAt: timestamp,
        updatedAt: timestamp,
        applicant: applicantName,
        fields: {},
        steps: [
          { step: "eligibility_check", status: "pending" },
          { step: "fee_payment", status: "pending" },
          { step: "health_inspection", status: "pending" },
          { step: "fire_marshal_signoff", status: "pending" },
          { step: "permit_issued", status: "pending" },
        ],
      };
      saveCase(record);
      return textResult({ message: `Opened food truck permit case for ${applicantName}.`, case: record });
    }
  );

  // --- Utility Billing ----------------------------------------------------
  server.registerTool(
    "check_utility_balance",
    {
      title: "Check Utility Balance",
      description:
        "Looks up a utility billing account by account number and returns the current balance, due date, and whether it's eligible for a payment plan. Use this before offering a payment plan.",
      inputSchema: {
        accountNumber: z.string().describe('The utility account number, e.g. "UB-100234"'),
      },
    },
    async ({ accountNumber }: { accountNumber: string }) => {
      const account = UTILITY_ACCOUNTS[accountNumber];
      if (!account) {
        return textResult(`No utility account found with number ${accountNumber}.`, true);
      }
      return textResult(account);
    }
  );

  server.registerTool(
    "start_utility_payment_plan",
    {
      title: "Start a Utility Payment Plan",
      description:
        "Opens a payment plan case for a past-due utility account. Call check_utility_balance first to confirm the account is pastDue and paymentPlanEligible before calling this.",
      inputSchema: {
        accountNumber: z.string().describe("The utility account number the payment plan is for"),
        installments: z
          .number()
          .int()
          .min(2)
          .max(12)
          .describe("Number of monthly installments the resident wants to split the balance into"),
      },
    },
    async ({ accountNumber, installments }: { accountNumber: string; installments: number }) => {
      const account = UTILITY_ACCOUNTS[accountNumber];
      if (!account) {
        return textResult(`No utility account found with number ${accountNumber}.`, true);
      }
      if (!account.paymentPlanEligible) {
        return textResult(`Account ${accountNumber} is not eligible for a payment plan.`, true);
      }
      const caseId = nextCaseId("UB");
      const timestamp = now();
      const installmentAmount = Math.round((account.currentBalance / installments) * 100) / 100;
      const steps: CaseStep[] = [
        { step: "plan_created", status: "complete", note: `${installments} installments of $${installmentAmount}` },
        { step: "first_payment_due", status: "pending", note: account.dueDate },
        { step: "plan_completed", status: "pending" },
      ];
      const record: CaseRecord = {
        caseId,
        type: "utility_billing",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        applicant: account.holderName,
        fields: { accountNumber, installments, installmentAmount, totalBalance: account.currentBalance },
        steps,
      };
      saveCase(record);
      return textResult({
        message: `Started a ${installments}-installment payment plan for ${account.holderName} ($${installmentAmount}/month).`,
        case: record,
      });
    }
  );

  // --- Public Works (311) --------------------------------------------------
  server.registerTool(
    "file_service_request",
    {
      title: "File a 311 Service Request",
      description:
        `Files a new public works service request (e.g. pothole, streetlight outage) and routes it to the right department. Valid categories: ${categoryNames.join(", ")}.`,
      inputSchema: {
        requesterName: z.string().describe("Name of the person filing the request"),
        category: z.enum(categoryNames as [ServiceRequestCategory, ...ServiceRequestCategory[]]),
        location: z.string().describe("Street address or intersection where the issue is located"),
        description: z.string().describe("Brief description of the issue"),
      },
    },
    async ({
      requesterName,
      category,
      location,
      description,
    }: {
      requesterName: string;
      category: ServiceRequestCategory;
      location: string;
      description: string;
    }) => {
      const routing = SERVICE_REQUEST_CATEGORIES[category];
      const caseId = nextCaseId("SR");
      const timestamp = now();
      const record: CaseRecord = {
        caseId,
        type: "service_request",
        status: "filed",
        createdAt: timestamp,
        updatedAt: timestamp,
        applicant: requesterName,
        fields: { category, location, description, department: routing.department, priority: routing.defaultPriority },
        steps: [
          { step: "intake", status: "complete" },
          { step: "triage", status: "pending" },
          { step: "dispatched", status: "pending" },
          { step: "resolved", status: "pending" },
        ],
      };
      saveCase(record);
      return textResult({
        message: `Filed ${category} request, routed to ${routing.department} (priority: ${routing.defaultPriority}).`,
        case: record,
      });
    }
  );

  // --- Cross-cutting lookups ------------------------------------------------
  server.registerTool(
    "get_case_status",
    {
      title: "Get Case Status",
      description: "Looks up any existing case by its case ID (permit, utility, or service request) and returns its current status and step checklist.",
      inputSchema: {
        caseId: z.string().describe("The case ID returned when the case was opened, e.g. FTP-123456, UB-123456, or SR-123456"),
      },
    },
    async ({ caseId }: { caseId: string }) => {
      const record = getCase(caseId);
      if (!record) {
        return textResult(`No case found with ID ${caseId}.`, true);
      }
      return textResult(record);
    }
  );

  server.registerTool(
    "list_my_cases",
    {
      title: "List My Cases",
      description:
        "Lists every case (permits, utility billing, service requests) opened by a given applicant name, across all city services, most recently updated first. Useful for resuming a conversation about 'my stuff with the city'.",
      inputSchema: {
        applicantName: z.string().describe("The name used when the case(s) were opened"),
      },
    },
    async ({ applicantName }: { applicantName: string }) => {
      const records = listCasesByApplicant(applicantName);
      if (records.length === 0) {
        return textResult(`No cases found for ${applicantName}.`);
      }
      return textResult(records);
    }
  );
}
