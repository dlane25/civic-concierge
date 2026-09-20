# Friction Log — Civic Concierge

Entries follow: task attempted, steps taken, expected vs. actual, severity,
workaround, suggestion. Kept running throughout the build for the hackathon's
optional friction-log judging bonus (up to 10%).

---

### 2026-09-20 — Confirming which MCP SDK version supports spec 2025-11-25

**Task:** The hackathon requires MCP spec version 2025-11-25 or later. Needed
to confirm the official TypeScript SDK actually supports it before building
against it.

**Steps taken:** `npm view @modelcontextprotocol/sdk version` (got 1.30.0),
then grepped the installed package's compiled `types.js` for protocol
version constants.

**Expected vs. actual:** Expected to find this documented clearly on the
npm page or in a CHANGELOG. Instead had to grep compiled output
(`LATEST_PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`) to confirm
`2025-11-25` was actually the latest supported version.

**Severity:** Minor (didn't block progress, cost about 5 minutes).

**Workaround:** Grepped `node_modules/@modelcontextprotocol/sdk/dist/esm/types.js`
directly for `SUPPORTED_PROTOCOL_VERSIONS`.

**Suggestion:** A version-compatibility table in the SDK README (spec
version -> SDK version) would save every hackathon participant this same
lookup.

---

### 2026-09-20 — StreamableHTTPServerTransport session lifecycle

**Task:** Wire up session-scoped `McpServer` + `StreamableHTTPServerTransport`
pairs behind an Express `/mcp` route.

**Steps taken:** Read `streamableHttp.d.ts` and `webStandardStreamableHttp.d.ts`
directly (rather than relying on memory of the API), since the SDK has
changed shape across versions (e.g., the Node transport is now described as
a "thin wrapper" over a web-standard implementation).

**Expected vs. actual:** Matched expectations once read from source; no
mismatch. Flagging this as a positive: the `.d.ts` files were clear enough
to implement against directly without needing example repos.

**Severity:** N/A (no issue) — noted for completeness since Amazon asks for
what worked well, not just problems.

**Workaround:** N/A.

**Suggestion:** None needed here — the type definitions were sufficient
documentation on their own.
