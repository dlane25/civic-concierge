/**
 * The chat agent interface shared by the real Bedrock-backed agent
 * (bedrockAgent.ts) and the offline mock agent (mockAgent.ts) used for
 * local testing when no AWS credentials are configured. Both drive the
 * same MCP server through McpToolRunner, so a tool call made in mock mode
 * exercises exactly the same MCP code path a real Bedrock tool call would.
 */

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: string;
  isError: boolean;
}

export interface AgentTurnResult {
  reply: string;
  toolCalls: ToolCallRecord[];
}

export interface Agent {
  /** The mode label shown in the UI, e.g. "bedrock" or "mock (offline)". */
  readonly mode: string;
  chat(sessionId: string, userText: string): Promise<AgentTurnResult>;
}
