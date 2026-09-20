/**
 * Milestone 3: the actual multi-step orchestration behind the food truck
 * permit case. Each step has its own tool (so a caller can drive the
 * workflow one deliberate step at a time), plus a single orchestrator,
 * runPermitWorkflow, that advances a case through every step it can
 * complete automatically and stops cleanly at whichever step genuinely
 * needs more input (a proposed date, an inspection result) rather than
 * guessing.
 */
import { PERMIT_FEE_USD, NO_VENDING_ZONES, nextAvailableInspectionSlots } from "./data.js";
import { saveCase, getCase, type CaseRecord, type CaseStep } from "./db.js";

export class PermitWorkflowError extends Error {}

function findStep(record: CaseRecord, name: string): CaseStep {
  const step = record.steps.find((s) => s.step === name);
  if (!step) throw new PermitWorkflowError(`Case ${record.caseId} has no "${name}" step (not a food truck permit case?).`);
  return step;
}

function requireFoodTruckCase(caseId: string): CaseRecord {
  const record = getCase(caseId);
  if (!record) throw new PermitWorkflowError(`No case found with ID ${caseId}.`);
  if (record.type !== "food_truck_permit") {
    throw new PermitWorkflowError(`Case ${caseId} is a ${record.type} case, not a food truck permit.`);
  }
  return record;
}

function touch(record: CaseRecord) {
  record.updatedAt = new Date().toISOString();
  saveCase(record);
}

// --- Individual step actions, each independently callable as a tool -------

export function checkEligibility(caseId: string, proposedLocation: string): CaseRecord {
  const record = requireFoodTruckCase(caseId);
  const step = findStep(record, "eligibility_check");
  if (step.status === "complete") throw new PermitWorkflowError(`Eligibility was already confirmed for case ${caseId}.`);

  record.fields.proposedLocation = proposedLocation;
  const blocked = NO_VENDING_ZONES.find((zone) => proposedLocation.toLowerCase().includes(zone.toLowerCase()));
  if (blocked) {
    step.status = "pending";
    step.note = `Blocked: ${proposedLocation} falls within the "${blocked}" no-vending zone.`;
    record.status = "denied";
  } else {
    step.status = "complete";
    step.note = `Eligible at ${proposedLocation}.`;
  }
  touch(record);
  return record;
}

export function payPermitFee(caseId: string, paymentMethod: string): CaseRecord {
  const record = requireFoodTruckCase(caseId);
  const eligibility = findStep(record, "eligibility_check");
  if (eligibility.status !== "complete") {
    throw new PermitWorkflowError(`Case ${caseId} must pass eligibility_check before the fee can be paid.`);
  }
  const step = findStep(record, "fee_payment");
  if (step.status === "complete") throw new PermitWorkflowError(`Fee already paid for case ${caseId}.`);

  step.status = "complete";
  step.note = `$${PERMIT_FEE_USD} paid via ${paymentMethod}.`;
  record.fields.feePaid = PERMIT_FEE_USD;
  record.fields.paymentMethod = paymentMethod;
  record.status = "fee_paid";
  touch(record);
  return record;
}

export function scheduleHealthInspection(caseId: string, preferredDate: string): CaseRecord {
  const record = requireFoodTruckCase(caseId);
  const fee = findStep(record, "fee_payment");
  if (fee.status !== "complete") {
    throw new PermitWorkflowError(`Case ${caseId} must have the fee paid before scheduling an inspection.`);
  }
  const available = nextAvailableInspectionSlots(5);
  if (!available.includes(preferredDate)) {
    throw new PermitWorkflowError(
      `${preferredDate} isn't an available inspection slot. Available: ${available.join(", ")}.`
    );
  }
  const step = findStep(record, "health_inspection");
  step.status = "in_progress";
  step.note = `Inspection scheduled for ${preferredDate}.`;
  record.fields.inspectionDate = preferredDate;
  record.status = "inspection_scheduled";
  touch(record);
  return record;
}

export function recordInspectionResult(caseId: string, passed: boolean, notes?: string): CaseRecord {
  const record = requireFoodTruckCase(caseId);
  const step = findStep(record, "health_inspection");
  if (step.status !== "in_progress") {
    throw new PermitWorkflowError(`Case ${caseId} has no inspection currently scheduled to record a result for.`);
  }
  if (passed) {
    step.status = "complete";
    step.note = `Passed inspection on ${record.fields.inspectionDate}.${notes ? ` Notes: ${notes}` : ""}`;
    record.status = "inspection_passed";
  } else {
    step.status = "pending";
    step.note = `Failed inspection on ${record.fields.inspectionDate}.${notes ? ` Notes: ${notes}` : ""} Reschedule required.`;
    record.status = "inspection_failed";
  }
  touch(record);
  return record;
}

export function requestFireMarshalSignoff(caseId: string): CaseRecord {
  const record = requireFoodTruckCase(caseId);
  const inspection = findStep(record, "health_inspection");
  if (inspection.status !== "complete") {
    throw new PermitWorkflowError(`Case ${caseId} needs a passed health inspection before fire marshal signoff.`);
  }
  const step = findStep(record, "fire_marshal_signoff");
  if (step.status === "complete") throw new PermitWorkflowError(`Fire marshal already signed off on case ${caseId}.`);

  step.status = "complete";
  step.note = "Approved.";
  record.status = "fire_marshal_approved";
  touch(record);
  return record;
}

export function issuePermit(caseId: string): CaseRecord {
  const record = requireFoodTruckCase(caseId);
  const signoff = findStep(record, "fire_marshal_signoff");
  if (signoff.status !== "complete") {
    throw new PermitWorkflowError(`Case ${caseId} needs fire marshal signoff before the permit can be issued.`);
  }
  const step = findStep(record, "permit_issued");
  if (step.status === "complete") throw new PermitWorkflowError(`Permit already issued for case ${caseId}.`);

  const permitNumber = `PERMIT-${Math.floor(Math.random() * 900000 + 100000)}`;
  step.status = "complete";
  step.note = `Issued as ${permitNumber}.`;
  record.fields.permitNumber = permitNumber;
  record.status = "issued";
  touch(record);
  return record;
}

// --- Orchestrator ------------------------------------------------------------

export interface WorkflowRunResult {
  case: CaseRecord;
  advanced: string[];
  blockedOn: string | null;
  message: string;
}

export interface WorkflowRunOptions {
  proposedLocation?: string;
  paymentMethod?: string;
  preferredInspectionDate?: string;
  inspectionPassed?: boolean;
  inspectionNotes?: string;
}

/**
 * Advances a food truck permit case through as many steps as it can with
 * the information given, stopping at the first step that genuinely needs
 * more input rather than guessing at it. This is the tool that turns five
 * separate step-tools into one agentic, multi-step workflow call.
 */
export function runPermitWorkflow(caseId: string, options: WorkflowRunOptions = {}): WorkflowRunResult {
  let record = requireFoodTruckCase(caseId);
  const advanced: string[] = [];

  const eligibility = findStep(record, "eligibility_check");
  if (eligibility.status !== "complete" && record.status !== "denied") {
    if (!options.proposedLocation) {
      return { case: record, advanced, blockedOn: "eligibility_check", message: "Need proposedLocation to run the eligibility check." };
    }
    record = checkEligibility(caseId, options.proposedLocation);
    if (record.status === "denied") {
      return { case: record, advanced, blockedOn: "eligibility_check", message: findStep(record, "eligibility_check").note ?? "Denied." };
    }
    advanced.push("eligibility_check");
  }

  const fee = findStep(record, "fee_payment");
  if (fee.status !== "complete") {
    const paymentMethod = options.paymentMethod ?? "card_on_file";
    record = payPermitFee(caseId, paymentMethod);
    advanced.push("fee_payment");
  }

  const inspection = findStep(record, "health_inspection");
  if (inspection.status === "pending") {
    if (!options.preferredInspectionDate) {
      return {
        case: record,
        advanced,
        blockedOn: "health_inspection",
        message: `Need preferredInspectionDate. Available slots: ${nextAvailableInspectionSlots(5).join(", ")}.`,
      };
    }
    record = scheduleHealthInspection(caseId, options.preferredInspectionDate);
    advanced.push("health_inspection (scheduled)");
  }
  if (findStep(record, "health_inspection").status === "in_progress") {
    if (options.inspectionPassed === undefined) {
      return {
        case: record,
        advanced,
        blockedOn: "health_inspection",
        message: `Inspection is scheduled for ${record.fields.inspectionDate}; waiting on the result (pass inspectionPassed once it's known).`,
      };
    }
    record = recordInspectionResult(caseId, options.inspectionPassed, options.inspectionNotes);
    if (!options.inspectionPassed) {
      return {
        case: record,
        advanced,
        blockedOn: "health_inspection",
        message: "Inspection failed. Call schedule_health_inspection again to reschedule.",
      };
    }
    advanced.push("health_inspection (passed)");
  }

  const signoff = findStep(record, "fire_marshal_signoff");
  if (signoff.status !== "complete") {
    record = requestFireMarshalSignoff(caseId);
    advanced.push("fire_marshal_signoff");
  }

  const issued = findStep(record, "permit_issued");
  if (issued.status !== "complete") {
    record = issuePermit(caseId);
    advanced.push("permit_issued");
  }

  return {
    case: record,
    advanced,
    blockedOn: null,
    message: `Permit issued: ${record.fields.permitNumber}.`,
  };
}
