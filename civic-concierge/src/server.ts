import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { registerTools } from "./tools.js";
import type { Agent } from "./agent.js";
import { BedrockAgent } from "./bedrockAgent.js";
import { MockAgent } from "./mockAgent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

function buildServer(): McpServer {
  const server = new McpServer({
    name: "civic-concierge",
    version: "0.1.0",
  });
  registerTools(server);
  return server;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// One transport + server pair per session, keyed by MCP session ID.
const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; server: McpServer }
>();

app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id");
  let entry = sessionId ? sessions.get(sessionId) : undefined;

  if (!entry) {
    // New session (or an initialize request with no session header yet).
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newId) => {
        sessions.set(newId, { transport, server });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    entry = { transport, server };
  }

  await entry.transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id");
  const entry = sessionId ? sessions.get(sessionId) : undefined;
  if (!entry) {
    res.status(400).send("Unknown or missing session");
    return;
  }
  await entry.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id");
  const entry = sessionId ? sessions.get(sessionId) : undefined;
  if (!entry) {
    res.status(400).send("Unknown or missing session");
    return;
  }
  await entry.transport.handleRequest(req, res);
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "civic-concierge", protocol: "2025-11-25" });
});

// --- Web chat agent (AWS Builder mini challenge: Bedrock Converse API) ---
// Lazily created after the HTTP server is listening, since the agent
// connects to this same server's /mcp endpoint as a real MCP client --
// exactly the way an external Alexa+ integration would, over the same
// Streamable HTTP transport, not an in-process shortcut.
let agent: Agent | null = null;

function getAgent(): Agent {
  if (agent) return agent;
  const mcpUrl = `http://localhost:${PORT}/mcp`;
  const explicitMode = process.env.AGENT_MODE;
  const modelId = process.env.BEDROCK_MODEL_ID;
  const useBedrock = explicitMode === "bedrock" || (explicitMode !== "mock" && Boolean(modelId));

  if (useBedrock) {
    if (!modelId) {
      throw new Error("AGENT_MODE=bedrock requires BEDROCK_MODEL_ID to be set. See README AWS setup.");
    }
    const region = process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "us-east-1";
    agent = new BedrockAgent(mcpUrl, modelId, region);
    console.log(`Web chat agent: Bedrock (model=${modelId}, region=${region})`);
  } else {
    agent = new MockAgent(mcpUrl);
    console.log("Web chat agent: offline mock (no BEDROCK_MODEL_ID set -- see README AWS setup to use real Bedrock)");
  }
  return agent;
}

app.get("/api/mode", (_req: Request, res: Response) => {
  res.json({ mode: getAgent().mode });
});

app.post("/api/chat", async (req: Request, res: Response) => {
  const { sessionId, message } = req.body ?? {};
  if (typeof sessionId !== "string" || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Request body must include sessionId and message strings." });
    return;
  }
  try {
    const result = await getAgent().chat(sessionId, message);
    res.json(result);
  } catch (err) {
    console.error("Agent chat error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Agent error." });
  }
});

app.listen(PORT, () => {
  console.log(`Civic Concierge MCP server listening on http://localhost:${PORT}/mcp`);
  console.log(`Web chat simulator available at http://localhost:${PORT}/`);
});
