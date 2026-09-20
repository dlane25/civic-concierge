/**
 * Synthetic reference data for a fictional municipality: "Rio Cardenal, TX".
 * No real city, department, or resident is represented. Every record below
 * is invented for demo purposes.
 */

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

/** Synthetic utility accounts, keyed by a made-up account number. */
export interface UtilityAccount {
  accountNumber: string;
  holderName: string;
  serviceAddress: string;
  currentBalance: number;
  dueDate: string;
  pastDue: boolean;
  paymentPlanEligible: boolean;
}

export const UTILITY_ACCOUNTS: Record<string, UtilityAccount> = {
  "UB-100234": {
    accountNumber: "UB-100234",
    holderName: "Maria Sandoval",
    serviceAddress: "412 Bluebonnet Ln, Rio Cardenal, TX",
    currentBalance: 187.42,
    dueDate: "2026-10-05",
    pastDue: true,
    paymentPlanEligible: true,
  },
  "UB-100987": {
    accountNumber: "UB-100987",
    holderName: "Taco Volador LLC",
    serviceAddress: "88 Commerce Way, Rio Cardenal, TX",
    currentBalance: 42.1,
    dueDate: "2026-10-12",
    pastDue: false,
    paymentPlanEligible: false,
  },
};

/** Valid 311 service request categories and their routing. */
export const SERVICE_REQUEST_CATEGORIES = {
  pothole: { department: "Public Works (311)", defaultPriority: "medium" },
  streetlight_outage: { department: "Public Works (311)", defaultPriority: "medium" },
  illegal_dumping: { department: "Public Works (311)", defaultPriority: "low" },
  water_leak: { department: "Utility Billing", defaultPriority: "high" },
  animal_control: { department: "Public Works (311)", defaultPriority: "medium" },
} as const;

export type ServiceRequestCategory = keyof typeof SERVICE_REQUEST_CATEGORIES;
