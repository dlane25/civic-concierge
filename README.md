# Civic Concierge

A self-hosted MCP server for the **Alexa+ track** of the Build, Ship, Shape:
Amazon Developer Hackathon. Civic Concierge is an agentic city-services
concierge: instead of answering one-off questions, it runs multi-step,
stateful municipal workflows (opening a food truck permit case, offering a
utility payment plan, filing a 311 request) for a fictional city,
**Rio Cardenal, TX**, and can resume any of them across sessions because
every case is persisted to disk.

No real city, department, or resident data is used anywhere in this project.

## Status

- **Milestone 1** (foundation): a working MCP server on Streamable HTTP,
  implementing protocol version `2025-11-25` (the hackathon's minimum
  accepted spec version).
- **Milestone 2** (this update): three city services — Permits & Licensing,
  Utility Billing, and Public Works (311) — each as real multi-step case
  workflows, plus cross-service lookups (`get_case_status`,
  `list_my_cases`). Case state moved from an in-memory `Map` to a SQLite
  file (`node:sqlite`, no extra dependency), so cases now survive a server
  restart, not just a live session.

Later milestones add richer orchestration (payments, inspection scheduling,
proactive follow-up), a web simulator, and documented AWS integration for
the AWS Builder mini challenge.

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
| `start_food_truck_permit` | Permits & Licensing | Opens a food truck permit case with a 5-step checklist (eligibility, fee, inspections, signoff, issued). |
| `check_utility_balance` | Utility Billing | Looks up a synthetic utility account by account number (balance, due date, payment-plan eligibility). |
| `start_utility_payment_plan` | Utility Billing | Opens a payment-plan case for a past-due, eligible account, split into N monthly installments. |
| `file_service_request` | Public Works (311) | Files a service request (pothole, streetlight outage, water leak, etc.), auto-routed to the right department. |
| `get_case_status` | any | Looks up any case by ID and returns its current status and checklist. |
| `list_my_cases` | any | Lists every case a given applicant has open, across all three services, most recent first. |

Two synthetic utility accounts are seeded for testing: `UB-100234` (past due,
payment-plan eligible) and `UB-100987` (current, not eligible).

## Trying it out

Point any MCP client (Claude Desktop, Cursor, Kiro, or the included test
client) at `http://localhost:3000/mcp` using the Streamable HTTP transport.

To run the included smoke test against a running server:

```bash
npm run build
node dist/server.js &
npx tsx src/test-client.ts
```

This exercises every tool: opening a permit case, checking and starting a
utility payment plan, filing a 311 request, listing all cases for one
applicant across services, and an error path (unknown account number).

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
  server.ts            Express app + Streamable HTTP transport, session management
  tools.ts             MCP tool definitions
  data.ts              Synthetic city and utility-account reference data
  db.ts                SQLite-backed case persistence (node:sqlite)
  test-client.ts        End-to-end smoke test covering every tool
  test-persistence.ts   Confirms cases survive a server restart
```

## License

MIT — see [LICENSE](./LICENSE).
