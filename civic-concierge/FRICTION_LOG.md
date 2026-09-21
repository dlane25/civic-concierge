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

---

### 2026-09-20 — `node:sqlite` as a zero-dependency persistence layer

**Task:** Move case storage from an in-memory `Map` to something that
survives a server restart, without adding a database dependency that would
complicate setup instructions for judges.

**Steps taken:** Tried Node's built-in `node:sqlite` module (`DatabaseSync`)
directly, on Node 22.22.2, with no CLI flag.

**Expected vs. actual:** Expected it to require `--experimental-sqlite` or
similar, since Node's own docs still describe it as experimental. It worked
immediately with no flag, and `@types/node` already ships types for it — no
`@types/better-sqlite3` or similar needed. Only a cosmetic
`ExperimentalWarning` prints to stderr on first use.

**Severity:** N/A (positive finding, saved a dependency).

**Workaround:** N/A.

**Suggestion:** Worth flagging on Amazon's side too, if it's relevant to any
of their own sample apps: `node:sqlite` is a genuinely lower-friction choice
for hackathon-scale persistence than pulling in a third-party driver, but
it's easy to assume (from the "experimental" label) that it needs
extra setup.

---

### 2026-09-20 — Verifying SQLite persistence actually persisted

**Task:** Confirm cases really survive a server restart, not just
survive within one long-running process (a `Map` would pass that second,
weaker test too).

**Steps taken:** Ran the smoke test to open cases, force-killed the server
process, started a brand-new process against the same `.db` file, and ran a
second script that only reads (`list_my_cases`) — no write path involved —
to rule out the read hitting leftover process state.

**Expected vs. actual:** Matched expectations: the fresh process returned
the same cases. Noted here because it's a check worth doing explicitly
rather than assuming an ORM/driver "just persists" — an easy way to ship a
demo that quietly only works because the dev server never restarted.

**Severity:** N/A (verification step, not an issue).

**Workaround:** N/A.

**Suggestion:** None — process worked as expected.

---

### 2026-09-20 — Designing an orchestrator that stops instead of guessing

**Task:** Build `run_permit_workflow` so it advances a multi-step case as
far as possible in one call, without silently fabricating required input
(a location, an inspection date, an inspection result) it doesn't actually
have.

**Steps taken:** Structured the orchestrator to check each step's
precondition in order and return early with a `blockedOn` field and a
specific `message` the moment a step needs information not present in the
call's arguments, rather than defaulting fields like `proposedLocation` to
a placeholder. Verified this explicitly with a test scenario that calls
`run_permit_workflow` three times, each time supplying only the next
missing field, confirming the response's `blockedOn`/`message` accurately
named what was needed each time.

**Expected vs. actual:** No SDK or framework issue here — this was a
design decision worth documenting for judges, since it's the difference
between "creative, autonomous multi-step orchestration" (per the judging
rubric's Alexa+ examples) and a chain of tool calls that happens to work
once with cherry-picked inputs. An MCP client (or a human) calling this
tool gets a structured reason to act on, not just a failure.

**Severity:** N/A (design note).

**Workaround:** N/A.

**Suggestion:** If Amazon's own Alexa+ Agent Skill examples show this
"partial-progress-plus-clear-blocker" return shape as a recommended
pattern (rather than each participant reinventing it), that would help
teams avoid the more tempting shortcut of having the orchestrator invent
default values to force completion.

---

### 2026-09-20 — Catching domain errors cleanly across six new tools

**Task:** Avoid six near-duplicate try/catch blocks in `tools.ts` for the
new permit-workflow step tools, each of which can throw a domain error
(e.g. calling `issue_permit` before signoff).

**Steps taken:** Defined a single `PermitWorkflowError` class in
`permitWorkflow.ts` and one `runStep()` helper in `tools.ts` that calls a
step function, catches only `PermitWorkflowError`, and turns it into an
MCP `isError: true` result — letting any *unexpected* exception still
propagate and fail loudly instead of being masked as a normal tool error.

**Expected vs. actual:** Worked as intended; verified in the failed-
inspection test scenario that a rejected `request_fire_marshal_signoff`
call comes back as a clean, readable error message rather than a raw stack
trace or an uncaught server crash.

**Severity:** N/A (design note, positive outcome).

**Workaround:** N/A.

**Suggestion:** None.

---

### 2026-09-20 — AWS SDK v3 discriminated-union types don't structurally narrow from plain objects

**Task:** Build a Bedrock `ToolConfiguration` (the `tools` array for the
Converse API) from the MCP server's own tool list, so the Bedrock agent's
available tools always match the real MCP tools exactly.

**Steps taken:** Mapped each MCP tool summary (`{name, description,
inputSchema}`) into an object shaped like `{toolSpec: {name, description,
inputSchema: {json: <JSON Schema>}}}` and assigned it to a variable typed
as `Tool[]` (from `@aws-sdk/client-bedrock-runtime`).

**Expected vs. actual:** Expected a structurally-correct object literal to
satisfy the type. Instead got `Property '$unknown' is missing in type
'{...}' but required in type '$UnknownMember'` — the SDK models `Tool` and
`ToolInputSchema` as discriminated unions (with a `$unknown` member for
forward compatibility) that TypeScript cannot narrow into from a plain
object literal, even when every field matches one of the union's members
exactly.

**Severity:** Minor (compile-time only, no runtime effect; cost about 10
minutes to diagnose since the error message doesn't mention "discriminated
union" or suggest the cast).

**Workaround:** Built the array as a plain, loosely-typed object first,
then did one explicit `as unknown as Tool[]` cast at the point of use,
with an inline comment explaining why the cast is needed and that the
underlying shape is still validated by hand against the SDK's documented
JSON structure.

**Suggestion:** Either export a plain (non-union) input type for
constructing these objects, or document the `as unknown as T` pattern in
the SDK's own tool-use examples — this is a common enough pattern
(building tool configs from an external tool list) that every MCP-to-
Bedrock integration will likely hit it.

---

### 2026-09-20 — Bedrock Converse API not live-testable in this sandbox

**Task:** Verify `BedrockAgent`'s tool-use loop end to end against a real
Bedrock model.

**Steps taken:** Built the full Converse API tool-use loop (send message,
detect `stopReason === "tool_use"`, call the MCP tool, append a
`toolResult` content block, repeat) and exercised the surrounding code
paths that don't require live AWS access: the `AGENT_MODE=bedrock` fast-
fail when `BEDROCK_MODEL_ID` is unset, and the auto-fallback to the offline
`MockAgent` when no Bedrock config is present at all.

**Expected vs. actual:** This development sandbox has no AWS credentials
and no path to acquire any, so the actual `ConverseCommand` call against a
live Bedrock endpoint could not be exercised here. `MockAgent` uses the
identical `McpToolRunner`/MCP-transport code path as `BedrockAgent`, which
gives reasonable confidence in everything except the Bedrock request/
response shape itself.

**Severity:** Moderate — this is the one piece of the AWS Builder mini
challenge integration that still needs verification against a real AWS
account before the demo/submission.

**Workaround:** None; documented as a known gap. `README.md` calls this
out explicitly under "Running with real Bedrock."

**Suggestion:** Before recording the demo video, run `BedrockAgent`
against a real AWS account with Bedrock model access enabled and confirm
at least one full tool-use round trip (e.g. "start a food truck permit for
Taco Volador").
