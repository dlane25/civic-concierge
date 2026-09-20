# Civic Concierge

A self-hosted MCP server for the **Alexa+ track** of the Build, Ship, Shape:
Amazon Developer Hackathon. Civic Concierge is an agentic city-services
concierge: instead of answering one-off questions, it runs a multi-step,
stateful municipal workflow (opening a food truck permit case, tracking a
checklist of fees and inspections, and resuming it across sessions) for a
fictional city, **Rio Cardenal, TX**.

No real city, department, or resident data is used anywhere in this project.

## Status

Milestone 1 (foundation) is complete: a working MCP server on Streamable
HTTP, implementing protocol version `2025-11-25` (the hackathon's minimum
accepted spec version), with three tools and an in-memory case store that
persists across a session. Later milestones add more city services, richer
multi-step orchestration (fees, inspection scheduling, payments), a web
simulator, and AWS integration.

## Requirements

- Node.js 22+
- npm

## Setup

```bash
npm install
npm run build
npm start
```

The server listens on `http://localhost:3000/mcp` (Streamable HTTP,
`POST`/`GET`/`DELETE`). Set `PORT` to change the port.

A health check is available at `http://localhost:3000/health`.

## Tools

| Tool | Description |
| --- | --- |
| `city_info` | Returns basic info about Rio Cardenal, TX (departments, office hours). |
| `start_food_truck_permit` | Opens a new food truck permit case and returns a case ID with a step checklist. |
| `get_case_status` | Looks up an existing case by ID and returns its current status and checklist. |

## Trying it out

Point any MCP client (Claude Desktop, Cursor, Kiro, or the included test
client) at `http://localhost:3000/mcp` using the Streamable HTTP transport.

To run the included smoke test against a running server:

```bash
npm run build
node dist/server.js &
npx tsx src/test-client.ts
```

This exercises the full flow: initialize (confirming the negotiated
`protocolVersion` is `2025-11-25`), `tools/list`, and three `tools/call`
round trips (open a case, then look it up).

## Project layout

```
src/
  server.ts       Express app + Streamable HTTP transport, session management
  tools.ts        MCP tool definitions
  data.ts         Synthetic city data and in-memory case store
  test-client.ts  End-to-end smoke test using the MCP SDK client
```

## License

MIT — see [LICENSE](./LICENSE).
