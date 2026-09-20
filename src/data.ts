/**
 * Synthetic data for a fictional municipality: "Rio Cardenal, TX".
 * No real city, department, or resident is represented. Every record below
 * is invented for demo purposes.
 */

export interface CaseRecord {
  caseId: string;
  type: "food_truck_permit" | "utility_billing" | "service_request";
  status: string;
  createdAt: string;
  updatedAt: string;
  applicant: string;
  fields: Record<string, unknown>;
  steps: CaseStep[];
}

export interface CaseStep {
  step: string;
  status: "pending" | "in_progress" | "complete";
  note?: string;
}

// In-memory store. Good enough for a hackathon demo; a real deployment
// would back this with a database.
export const cases = new Map<string, CaseRecord>();

export const CITY_NAME = "Rio Cardenal, TX";

export const CITY_INFO = {
  name: CITY_NAME,
  population: 48210,
  departments: [
    "Permits & Licensing",
    "Utility Billing",
    "Public Works (311)",
    "Fire Marshal",
    "Health Department",
  ],
  officeHours: "Mon-Fri 8:00 AM - 5:00 PM CT",
  fictional: true,
};

export function nextCaseId(prefix: string): string {
  const n = Math.floor(Math.random() * 900000 + 100000);
  return `${prefix}-${n}`;
}
