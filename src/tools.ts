import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CITY_INFO, cases, nextCaseId, type CaseRecord } from "./data.js";

/**
 * Registers all Civic Concierge tools on the given McpServer instance.
 * Milestone 1 ships two tools:
 *  - city_info: a read-only sanity-check tool.
 *  - start_food_truck_permit: opens a stateful, multi-step case that later
 *    milestones will extend with fees, inspections, and follow-up.
 */
export function registerTools(server: McpServer) {
  server.registerTool(
    "city_info",
    {
      title: "Get City Info",
      description:
        "Returns basic information about the city (Rio Cardenal, TX, a fictional municipality used for this demo): departments, office hours, and population.",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(CITY_INFO, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "start_food_truck_permit",
    {
      title: "Start Food Truck Permit Application",
      description:
        "Opens a new food truck permit case for an applicant and returns a case ID. The case persists across sessions so the workflow can be resumed later (checklist, fees, inspection scheduling are added in later milestones).",
      inputSchema: {
        applicantName: z.string().describe("Name of the person or business applying"),
      },
    },
    async ({ applicantName }: { applicantName: string }) => {
      const caseId = nextCaseId("FTP");
      const now = new Date().toISOString();
      const record: CaseRecord = {
        caseId,
        type: "food_truck_permit",
        status: "opened",
        createdAt: now,
        updatedAt: now,
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
      cases.set(caseId, record);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Opened food truck permit case for ${applicantName}.`,
                case: record,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_case_status",
    {
      title: "Get Case Status",
      description: "Looks up an existing case by its case ID and returns its current status and step checklist.",
      inputSchema: {
        caseId: z.string().describe("The case ID returned when the case was opened, e.g. FTP-123456"),
      },
    },
    async ({ caseId }: { caseId: string }) => {
      const record = cases.get(caseId);
      if (!record) {
        return {
          content: [{ type: "text", text: `No case found with ID ${caseId}.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
      };
    }
  );
}
