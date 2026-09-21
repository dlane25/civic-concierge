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

- **Milestone 4** (this update): a web chat simulator (a stand-in for the
  Alexa+ voice experience) and an AWS Bedrock agent for the **AWS Builder
  mini challenge**. The chat UI is served by the same Node process as the
  MCP server, but the agent behind it is a genuine external MCP client —
  it connects to `/mcp` over Streamable HTTP exactly like an Alexa+
  integration would, and drives the Bedrock Converse API's tool-use loop
  against the real tool list. See "Web simulator & AWS Bedrock" below.

Later milestones add hardening, tests, and the final demo/submission.

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

## Web simulator & AWS Bedrock

Alexa+ isn't something this environment can stand up directly, so
Milestone 4 adds a small web chat UI at `http://localhost:3000/` that
plays the same role: a conversational front end that talks to Civic
Concierge only through MCP tool calls, the same way an Alexa+ skill
would. Every reply in the chat panel is backed by a visible "MCP tool
calls this turn" log, so it's obvious which tool ran and what it
returned.

Behind the chat UI is one of two interchangeable agents (`src/agent.ts`
defines the shared interface):

- **`BedrockAgent`** (`src/bedrockAgent.ts`) — the real submission path for
  the AWS Builder mini challenge. It calls the AWS Bedrock **Converse API**
  with tool use enabled, feeding it the live tool list fetched from the MCP
  server, and loops (calling MCP tools, feeding results back) until the
  model produces a final reply. This is the code that satisfies "actually
  call your track's required technology in code."
- **`MockAgent`** (`src/mockAgent.ts`) — an offline stand-in, used only
  because this development sandbox has no AWS credentials to test against.
  It picks intents with regex instead of an LLM, but calls the exact same
  `McpToolRunner` (same MCP server, same transport, same tools) that
  `BedrockAgent` does, so running in mock mode still proves the web UI, the
  MCP wiring, and the tool-call plumbing end to end. **It is not a
  submission artifact** — it exists purely so the rest of the stack could
  be tested without AWS access.

### Which agent runs

`getAgent()` in `src/server.ts` picks automatically:

- If `BEDROCK_MODEL_ID` is set (and `AGENT_MODE` isn't `mock`), it uses
  `BedrockAgent`.
- Otherwise it falls back to `MockAgent` and logs why.
- Setting `AGENT_MODE=bedrock` without `BEDROCK_MODEL_ID` fails fast with a
  clear error instead of silently falling back.

The active mode is also shown in the chat UI's header banner and via
`GET /api/mode`.

### Running with real Bedrock

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0   # any Converse-API tool-use-capable model your account has access to
export BEDROCK_REGION=us-east-1   # optional, defaults to us-east-1 or AWS_REGION
npm run build
npm start
```

Then open `http://localhost:3000/` and chat. This has been built and
error-path tested (see FRICTION_LOG.md), but the Bedrock Converse API
call itself could not be live-tested end-to-end in this development
sandbox, which has no AWS credentials — it should be verified against a
real AWS account before demo/submission.

### Running with the offline mock (no AWS needed)

Just `npm start` with no `BEDROCK_MODEL_ID` set — this is the default.
Useful for developing the UI or the MCP tools themselves without needing
AWS credentials on hand.

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
  agent.ts                 Shared Agent interface (BedrockAgent and MockAgent both implement it)
  mcpToolRunner.ts         Thin MCP client wrapper: lists tools, calls tools over Streamable HTTP
  bedrockAgent.ts          Real agent: AWS Bedrock Converse API tool-use loop against the MCP server
  mockAgent.ts             Offline stand-in agent for local testing without AWS credentials
public/
  index.html, style.css, app.js   Web chat simulator UI
```

## License

MIT — see [LICENSE](./LICENSE).
