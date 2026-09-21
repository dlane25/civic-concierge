/**
 * Persistence layer for Civic Concierge, backed by Node's built-in
 * node:sqlite (stable, no extra dependency). Cases now survive a server
 * restart, not just a single MCP session — needed for a workflow like a
 * food truck permit that a resident might resume days later.
 *
 * node:sqlite is still flagged "experimental" by Node itself (the warning
 * is cosmetic; the API has been usable without a CLI flag since Node 22.5).
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.CIVIC_DB_PATH ?? path.join(__dirname, "..", "civic-concierge.db");

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    caseId TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    applicant TEXT NOT NULL,
    fieldsJson TEXT NOT NULL,
    stepsJson TEXT NOT NULL
  )
`);

export interface CaseStep {
  step: string;
  status: "pending" | "in_progress" | "complete";
  note?: string;
}

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

type CaseRow = {
  caseId: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  applicant: string;
  fieldsJson: string;
  stepsJson: string;
};

function rowToRecord(row: CaseRow): CaseRecord {
  return {
    caseId: row.caseId,
    type: row.type as CaseRecord["type"],
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    applicant: row.applicant,
    fields: JSON.parse(row.fieldsJson),
    steps: JSON.parse(row.stepsJson),
  };
}

export function saveCase(record: CaseRecord): void {
  db.prepare(
    `INSERT INTO cases (caseId, type, status, createdAt, updatedAt, applicant, fieldsJson, stepsJson)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(caseId) DO UPDATE SET
       status = excluded.status,
       updatedAt = excluded.updatedAt,
       fieldsJson = excluded.fieldsJson,
       stepsJson = excluded.stepsJson`
  ).run(
    record.caseId,
    record.type,
    record.status,
    record.createdAt,
    record.updatedAt,
    record.applicant,
    JSON.stringify(record.fields),
    JSON.stringify(record.steps)
  );
}

export function getCase(caseId: string): CaseRecord | undefined {
  const row = db.prepare(`SELECT * FROM cases WHERE caseId = ?`).get(caseId) as
    | CaseRow
    | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function listCasesByApplicant(applicant: string): CaseRecord[] {
  const rows = db
    .prepare(`SELECT * FROM cases WHERE applicant = ? ORDER BY updatedAt DESC`)
    .all(applicant) as unknown as CaseRow[];
  return rows.map(rowToRecord);
}

export function nextCaseId(prefix: string): string {
  const n = Math.floor(Math.random() * 900000 + 100000);
  return `${prefix}-${n}`;
}
