/**
 * The AWS Builder mini-challenge integration: a chat agent backed by
 * Amazon Bedrock's Converse API (tool use / function calling), talking to
 * Civic Concierge's own MCP tools over Streamable HTTP via McpToolRunner.
 *
 * Requires AWS credentials with bedrock:InvokeModel access to the model in
 * BEDROCK_MODEL_ID, and model access enabled for that model in the Bedrock
 * console for BEDROCK_REGION. See README "AWS setup" for exact steps.
 */
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { McpToolRunner } from "./mcpToolRunner.js";
import type { Agent, AgentTurnResult, ToolCallRecord } from "./agent.js";

const SYSTEM_PROMPT = `You are the Civic Concierge assistant for Rio Cardenal, TX (a fictional city -- everything here is a demo, not a real municipality). You help residents with food truck permits, utility billing, and 311 service requests using the tools available to you. Always use a tool to look up or change real state rather than guessing at an answer. When running a food truck permit through its steps, prefer the run_permit_workflow tool over calling individual steps yourself, and clearly relay back to the resident whatever it says is still needed. Keep replies conversational and concise, as if spoken aloud by a voice assistant.`;

export class BedrockAgent implements Agent {
  readonly mode = "bedrock";
  private client: BedrockRuntimeClient;
  private toolRunner: McpToolRunner;
  private toolConfig: { tools: Tool[] } | null = null;
  private histories = new Map<string, Message[]>();

  constructor(
    mcpUrl: string,
    private readonly modelId: string,
    region: string
  ) {
    this.toolRunner = new McpToolRunner(mcpUrl);
    this.client = new BedrockRuntimeClient({ region });
  }

  private async getToolConfig(): Promise<{ tools: Tool[] }> {
    if (this.toolConfig) return this.toolConfig;
    const mcpTools = await this.toolRunner.listTools();
    // The SDK models Tool/ToolInputSchema as discriminated unions with a
    // "$unknown" branch; TS can't narrow a plain object literal into them
    // even when the shape is exactly right (a known rough edge in AWS SDK
    // v3's modeled union types -- see FRICTION_LOG.md). The runtime shape
    // here matches the documented Converse API tool-use format exactly.
    const tools = mcpTools.map((t) => ({
      toolSpec: {
        name: t.name,
        description: t.description ?? t.name,
        inputSchema: { json: t.inputSchema as Record<string, unknown> },
      },
    })) as unknown as Tool[];
    this.toolConfig = { tools };
    return this.toolConfig;
  }

  async chat(sessionId: string, userText: string): Promise<AgentTurnResult> {
    const toolConfig = await this.getToolConfig();
    const history = this.histories.get(sessionId) ?? [];
    history.push({ role: "user", content: [{ text: userText }] });

    const toolCalls: ToolCallRecord[] = [];
    let finalText = "";

    // Bedrock's tool-use loop: call the model, and if it asks for a tool,
    // run it and feed the result back as a new message, repeating until
    // the model returns a normal (non tool-use) turn.
    for (let iterations = 0; iterations < 8; iterations++) {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: SYSTEM_PROMPT }],
          messages: history,
          toolConfig,
          inferenceConfig: { maxTokens: 1024, temperature: 0.2 },
        })
      );

      const message = response.output?.message;
      if (!message) throw new Error("Bedrock Converse returned no message.");
      history.push(message);

      const toolUseBlocks = (message.content ?? []).filter(
        (c): c is ContentBlock.ToolUseMember => "toolUse" in c && c.toolUse !== undefined
      );

      if (response.stopReason !== "tool_use" || toolUseBlocks.length === 0) {
        finalText = (message.content ?? [])
          .map((c) => ("text" in c && c.text ? c.text : ""))
          .join("")
          .trim();
        break;
      }

      const resultContent: ContentBlock[] = [];
      for (const block of toolUseBlocks) {
        const { toolUseId, name, input } = block.toolUse;
        const args = (input ?? {}) as Record<string, unknown>;
        const { text, isError } = await this.toolRunner.callTool(name!, args);
        toolCalls.push({ name: name!, args, result: text, isError });
        resultContent.push({
          toolResult: {
            toolUseId: toolUseId!,
            status: isError ? "error" : "success",
            content: [{ text }],
          },
        });
      }
      history.push({ role: "user", content: resultContent });
    }

    this.histories.set(sessionId, history);
    return { reply: finalText || "(no response)", toolCalls };
  }
}
