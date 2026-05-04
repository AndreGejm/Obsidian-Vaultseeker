import type { CodexToolResult } from "./codex-tool-dispatcher";
import { toOpenAiFunctionTools, type OpenAiFunctionToolDefinition, type VaultseerAgentToolRegistry } from "./vaultseer-agent-tool-registry";

const DEFAULT_MAX_TOOL_ITERATIONS = 10;

export type VaultseerAgentMessageRole = "system" | "user" | "assistant" | "tool";

export type VaultseerAgentContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      imageUrl: string;
      detail?: "auto" | "low" | "high";
    };

export type VaultseerAgentMessage = {
  role: VaultseerAgentMessageRole;
  content: string | VaultseerAgentContentPart[];
  name?: string;
  toolCallId?: string;
};

export type VaultseerAgentToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type VaultseerAgentProviderRequest = {
  messages: VaultseerAgentMessage[];
  tools: OpenAiFunctionToolDefinition[];
};

export type VaultseerAgentProviderResponse = {
  message: string;
  toolCalls?: VaultseerAgentToolCall[];
};

export type VaultseerAgentProvider = {
  respond(request: VaultseerAgentProviderRequest): Promise<VaultseerAgentProviderResponse>;
};

export type VaultseerAgentToolEvent = {
  callId: string;
  tool: string;
  result: CodexToolResult;
};

export type VaultseerAgentTurnResult = {
  status: "completed" | "tool_iteration_limit";
  assistantMessage: string;
  messages: VaultseerAgentMessage[];
  toolEvents: VaultseerAgentToolEvent[];
};

export type RunVaultseerAgentTurnInput = {
  provider: VaultseerAgentProvider;
  registry: VaultseerAgentToolRegistry;
  userMessage: string;
  userAttachments?: VaultseerAgentContentPart[];
  messages?: VaultseerAgentMessage[];
  maxToolIterations?: number;
  allowProposalTools?: boolean;
};

export async function runVaultseerAgentTurn(input: RunVaultseerAgentTurnInput): Promise<VaultseerAgentTurnResult> {
  const messages: VaultseerAgentMessage[] = [
    ...(input.messages ?? []),
    {
      role: "user",
      content: buildUserMessageContent(input.userMessage, input.userAttachments)
    }
  ];
  const toolEvents: VaultseerAgentToolEvent[] = [];
  const maxToolIterations = normalizeMaxToolIterations(input.maxToolIterations);
  const tools = toOpenAiFunctionTools(input.registry.definitions);

  for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
    const response = await input.provider.respond({
      messages,
      tools
    });
    const toolCalls = response.toolCalls ?? [];

    if (toolCalls.length === 0) {
      messages.push({
        role: "assistant",
        content: response.message
      });
      return {
        status: "completed",
        assistantMessage: response.message,
        messages,
        toolEvents
      };
    }

    if (iteration >= maxToolIterations) {
      const assistantMessage =
        "Vaultseer stopped this turn because the agent reached the tool-call limit before producing a final answer.";
      messages.push({
        role: "assistant",
        content: assistantMessage
      });
      return {
        status: "tool_iteration_limit",
        assistantMessage,
        messages,
        toolEvents
      };
    }

    messages.push({
      role: "assistant",
      content: response.message
    });

    for (const toolCall of toolCalls) {
      const executeOptions: Parameters<VaultseerAgentToolRegistry["execute"]>[2] = {};
      if (input.allowProposalTools !== undefined) {
        executeOptions.allowProposalTools = input.allowProposalTools;
      }
      const result = await input.registry.execute(toolCall.name, toolCall.input, executeOptions);
      toolEvents.push({
        callId: toolCall.id,
        tool: toolCall.name,
        result
      });
      messages.push({
        role: "tool",
        name: toolCall.name,
        toolCallId: toolCall.id,
        content: JSON.stringify(sanitizeToolResultForMessage(result))
      });
      for (const contentPart of extractToolResultContentParts(result)) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Vaultseer attached image content returned by ${toolCall.name}.`
            },
            contentPart
          ]
        });
      }
    }
  }

  const assistantMessage =
    "Vaultseer stopped this turn because the agent reached the tool-call limit before producing a final answer.";
  messages.push({
    role: "assistant",
    content: assistantMessage
  });

  return {
    status: "tool_iteration_limit",
    assistantMessage,
    messages,
    toolEvents
  };
}

function sanitizeToolResultForMessage(result: CodexToolResult): CodexToolResult {
  if (!result.ok || !isRecord(result.output) || !isAgentContentPart(result.output["contentPart"])) {
    return result;
  }

  return {
    ...result,
    output: {
      ...result.output,
      contentPart: sanitizeAgentContentPart(result.output["contentPart"])
    }
  };
}

function extractToolResultContentParts(result: CodexToolResult): VaultseerAgentContentPart[] {
  if (!result.ok || !isRecord(result.output) || !isAgentContentPart(result.output["contentPart"])) {
    return [];
  }

  return [result.output["contentPart"]];
}

function sanitizeAgentContentPart(part: VaultseerAgentContentPart): VaultseerAgentContentPart {
  if (part.type === "text") {
    return part;
  }

  const sanitized: VaultseerAgentContentPart = {
    type: "image_url",
    imageUrl: "[attached as multimodal content]"
  };
  if (part.detail) {
    sanitized.detail = part.detail;
  }
  return sanitized;
}

function isAgentContentPart(value: unknown): value is VaultseerAgentContentPart {
  if (!isRecord(value)) {
    return false;
  }

  if (value["type"] === "text") {
    return typeof value["text"] === "string";
  }

  return (
    value["type"] === "image_url" &&
    typeof value["imageUrl"] === "string" &&
    (value["detail"] === undefined || value["detail"] === "auto" || value["detail"] === "low" || value["detail"] === "high")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildUserMessageContent(
  userMessage: string,
  userAttachments: VaultseerAgentContentPart[] | undefined
): string | VaultseerAgentContentPart[] {
  if (!userAttachments || userAttachments.length === 0) {
    return userMessage;
  }

  return [{ type: "text", text: userMessage }, ...userAttachments];
}

function normalizeMaxToolIterations(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_TOOL_ITERATIONS;
  }

  return Math.max(0, Math.floor(value));
}
