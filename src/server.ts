import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { registerTools } from "./tools.js";

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

app.listen(PORT, () => {
  console.log(`Civic Concierge MCP server listening on http://localhost:${PORT}/mcp`);
});
