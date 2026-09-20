# Civic Concierge

A self-hosted MCP server for the **Alexa+ track** of the Build, Ship, Shape:
Amazon Developer Hackathon. Civic Concierge is an agentic city-services
concierge: instead of answering one-off questions, it runs multi-step,
stateful municipal workflows for a fictional city, **Rio Cardenal, TX**, and
can resume any of them across sessions because every case is persisted to
disk.

The flagship workflow is the food truck permit process: a resident (or an
agent acting for them) opens a case, and a single orchestrator tool drives
it through zoning eligibility, fee payment, health inspection scheduling,
inspection results, fire marshal signoff, and final issuance — stopping
cleanly at whichever step genuinely needs more information, rather than a
single-turn Q&A wrapper around one API call.

No real city, department, or resident data is used anywhere in this project.

## Status

- **Milestone 1** (foundation): a working MCP server on Streamable HTTP,
  implementing protocol version `2025-11-25` (the hackathon's minimum
  accepted spec version).
- **Milestone 2**: three city services — Permits & Licensing, Utility
  Billing, and Public Works (311) — each as real multi-step case
  workflows, plus cross-service lookups (`get_case_status`,
  `list_my_cases`). Case state moved from an in-memory `Map` to a SQLite
  file (`node:sqlite`, no extra dependency), so cases now survive a server
  restart, not just a live session.
- **Milestone 3** (this update): the food truck permit case became a real
  agentic workflow. Six step tools (eligibility, fee, inspection
  scheduling, inspection result, fire marshal signoff, issuance) each
  validate the case is in the right state before acting. `run_permit_workflow`
  orchestrates all of them in one call, advancing as far as it can and
  reporting exactly what's still needed — a proposed location, an
  inspection date, a pass/fail result — rather than guessing or stalling
  silently.

Later milestones add a web simulator and documented AWS integration for the
AWS Builder mini challenge.

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite` module)
- npm

## Setup

```bash
npm install
npm run build
npm start
```

The server listens on `http://localhost:3000/mcp` (Streamable HTTP,
`POST`/`GET`/`DELETE`). Set `PORT` to change the port.

Cases are stored in `civic-concierge.db` (SQLite) at the project root by
default; set `CIVIC_DB_PATH` to point it elsewhere. The file is gitignored —
delete it any time to reset all demo state.

A health check is available at `http://localhost:3000/health`.

## Tools

| Tool | Service | Description |
| --- | --- | --- |
| `city_info` | — | Returns basic info about Rio Cardenal, TX (departments, office hours). |
| `start_food_truck_permit` | Permits & Licensing | Opens a food truck permit case with a 5-step checklist. |
| `check_permit_eligibility` | Permits & Licensing | Checks a proposed vending location against zoning rules; required before the fee can be paid. |
| `pay_permit_fee` | Permits & Licensing | Pays the $275 permit fee once eligibility has passed. |
| `schedule_health_inspection` | Permits & Licensing | Schedules a health inspection once the fee is paid. |
| `record_inspection_result` | Permits & Licensing | Records pass/fail for a scheduled inspection; a fail requires rescheduling. |
| `request_fire_marshal_signoff` | Permits & Licensing | Requests signoff once the inspection has passed. |
| `issue_permit` | Permits & Licensing | Issues the permit and generates a permit number once signed off. |
| `run_permit_workflow` | Permits & Licensing | **The orchestrator.** Drives a permit case through every step above it can complete automatically, and stops at whichever step needs more input. Call it again with the missing field to keep advancing the same case. |
| `check_utility_balance` | Utility Billing | Looks up a synthetic utility account by account number (balance, due date, payment-plan eligibility). |
| `start_utility_payment_plan` | Utility Billing | Opens a payment-plan case for a past-due, eligible account, split into N monthly installments. |
| `file_service_request` | Public Works (311) | Files a service request (pothole, streetlight outage, water leak, etc.), auto-routed to the right department. |
| `get_case_status` | any | Looks up any case by ID and returns its current status and checklist. |
| `list_my_cases` | any | Lists every case a given applicant has open, across all three services, most recent first. |

Two synthetic utility accounts are seeded for testing: `UB-100234` (past due,
payment-plan eligible) and `UB-100987` (current, not eligible). Two zoning
areas are seeded as no-vending zones for testing a denied permit: "Downtown
Historic District" and "Cardenal Elementary School Zone" (a proposed
location is checked as a substring match against these).

## Trying it out

Point any MCP client (Claude Desktop, Cursor, Kiro, or the included test
clients) at `http://localhost:3000/mcp` using the Streamable HTTP transport.

To run the general smoke test (Milestones 1-2: permits, utility billing, 311):

```bash
npm run build
node dist/server.js &
npx tsx src/test-client.ts
```

To run the permit workflow orchestrator test (Milestone 3), covering the
happy path plus both stop conditions (a blocked location, a failed
inspection):

```bash
npx tsx src/test-permit-workflow.ts
```

To confirm cases really persist across a restart (not just within one
running process):

```bash
npx tsx src/test-client.ts   # opens some cases
kill %1                      # stop the server
node dist/server.js &        # start a fresh process, same civic-concierge.db
npx tsx src/test-persistence.ts   # confirms the same cases are still there
```

## Project layout

```
src/
  server.ts               Express app + Streamable HTTP transport, session management
  tools.ts                MCP tool definitions
  data.ts                 Synthetic city, utility-account, zoning, and inspection-slot data
  db.ts                   SQLite-backed case persistence (node:sqlite)
  permitWorkflow.ts        Step logic + orchestrator for the food truck permit workflow
  test-client.ts           Smoke test covering permits, utility billing, and 311
  test-permit-workflow.ts  Orchestrator test: happy path, denial, failed inspection
  test-persistence.ts      Confirms cases survive a server restart
```

## License

MIT — see [LICENSE](./LICENSE).
