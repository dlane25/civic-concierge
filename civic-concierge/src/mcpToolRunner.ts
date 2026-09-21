/**
 * A thin MCP client used by the web chat agent to call Civic Concierge's
 * own tools -- over the real Streamable HTTP transport, exactly the way
 * any external MCP client (including an Alexa+ Agent Skill) would. This is
 * what makes the web chat a genuine demonstration of the MCP server, not a
 * shortcut that calls internal functions directly.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpToolSummary {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export class McpToolRunner {
  private client: Client;
  private connected = false;

  constructor(private readonly mcpUrl: string) {
    this.client = new Client({ name: "civic-concierge-web-agent", version: "0.4.0" });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl));
    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools(): Promise<McpToolSummary[]> {
    await this.connect();
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  }

  /** Calls a tool and returns its result as a plain string (MCP tools here always return a single text block). */
  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    await this.connect();
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    return { text, isError: Boolean(result.isError) };
  }
}
