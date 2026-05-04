import type {
  VaultseerAgentContentPart,
  VaultseerAgentMessage,
  VaultseerAgentProvider,
  VaultseerAgentProviderRequest,
  VaultseerAgentProviderResponse,
  VaultseerAgentToolCall
} from "./vaultseer-agent-runtime";
import type { CodexReasoningEffort, CodexModelId } from "./settings-model";

export type OpenAiResponsesFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<OpenAiResponsesFetchResponse>;

export type OpenAiResponsesFetchResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text: () => Promise<string>;
};

export type OpenAiResponsesAgentProviderOptions = {
  apiKey: string;
  model: CodexModelId;
  reasoningEffort: CodexReasoningEffort;
  baseUrl?: string;
  fetch?: OpenAiResponsesFetch;
};

export class OpenAiResponsesAgentProvider implements VaultseerAgentProvider {
  private readonly apiKey: string;
  private readonly model: CodexModelId;
  private readonly reasoningEffort: CodexReasoningEffort;
  private readonly baseUrl: string;
  private readonly fetch: OpenAiResponsesFetch;
  private readonly outputBatchByToolCallId = new Map<string, unknown[]>();

  constructor(options: OpenAiResponsesAgentProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model;
    this.reasoningEffort = options.reasoningEffort;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetch = options.fetch ?? globalFetch;
  }

  async respond(request: VaultseerAgentProviderRequest): Promise<VaultseerAgentProviderResponse> {
    if (this.apiKey.length === 0) {
      throw new Error("OpenAI API key is required for the Vaultseer OpenAI provider.");
    }

    const response = await this.fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: this.toResponsesInputItems(request.messages),
        reasoning: {
          effort: this.reasoningEffort
        },
        tools: request.tools
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI Responses API request failed with status ${response.status}${body ? `: ${body}` : ""}`);
    }

    const body = response.json ? await response.json() : JSON.parse(await response.text());
    const parsed = parseResponsesBody(body);
    this.rememberToolCallOutputBatch(parsed.outputItems, parsed.response.toolCalls ?? []);
    return parsed.response;
  }

  private toResponsesInputItems(messages: VaultseerAgentMessage[]): Record<string, unknown>[] {
    const inputItems: Record<string, unknown>[] = [];
    const emittedOutputBatches = new Set<unknown[]>();

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (!message) {
        continue;
      }
      if (message.role === "assistant" && this.nextToolMessageHasStoredOutput(messages, index)) {
        continue;
      }

      if (message.role === "tool") {
        const outputBatch = this.outputBatchByToolCallId.get(message.toolCallId ?? "");
        if (outputBatch && !emittedOutputBatches.has(outputBatch)) {
          inputItems.push(...(outputBatch as Record<string, unknown>[]));
          emittedOutputBatches.add(outputBatch);
        }
      }

      inputItems.push(toResponsesInputItem(message));
    }

    return inputItems;
  }

  private nextToolMessageHasStoredOutput(messages: VaultseerAgentMessage[], index: number): boolean {
    const nextMessage = messages[index + 1];
    return nextMessage?.role === "tool" && this.outputBatchByToolCallId.has(nextMessage.toolCallId ?? "");
  }

  private rememberToolCallOutputBatch(outputItems: unknown[], toolCalls: VaultseerAgentToolCall[]): void {
    if (toolCalls.length === 0 || outputItems.length === 0) {
      return;
    }

    for (const toolCall of toolCalls) {
      this.outputBatchByToolCallId.set(toolCall.id, outputItems);
    }
  }
}

function toResponsesInputItem(message: VaultseerAgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      type: "function_call_output",
      call_id: message.toolCallId,
      output: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
    };
  }

  return {
    role: message.role,
    content: serializeResponsesContent(message.content)
  };
}

function serializeResponsesContent(content: string | VaultseerAgentContentPart[]): string | Record<string, unknown>[] {
  if (typeof content === "string") {
    return content;
  }

  return content.map((part) => {
    if (part.type === "text") {
      return {
        type: "input_text",
        text: part.text
      };
    }

    const serialized: Record<string, unknown> = {
      type: "input_image",
      image_url: part.imageUrl
    };
    if (part.detail) {
      serialized.detail = part.detail;
    }
    return serialized;
  });
}

function parseResponsesBody(body: unknown): {
  response: VaultseerAgentProviderResponse;
  outputItems: unknown[];
} {
  if (!isRecord(body) || !Array.isArray(body.output)) {
    throw new Error("OpenAI Responses API returned an unexpected response shape.");
  }

  const messageParts: string[] = [];
  const toolCalls: VaultseerAgentToolCall[] = [];
  for (const item of body.output) {
    if (!isRecord(item)) continue;

    if (item.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (isRecord(content) && typeof content.text === "string") {
          messageParts.push(content.text);
        }
      }
    }

    if (item.type === "function_call") {
      const id = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : "";
      const name = typeof item.name === "string" ? item.name : "";
      if (!id || !name) continue;
      toolCalls.push({
        id,
        name,
        input: parseFunctionArguments(item.arguments)
      });
    }
  }

  const response: VaultseerAgentProviderResponse = {
    message: messageParts.join("\n").trim()
  };
  if (toolCalls.length > 0) {
    response.toolCalls = toolCalls;
  }
  return { response, outputItems: body.output };
}

function parseFunctionArguments(value: unknown): unknown {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeBaseUrl(value: string | undefined): string {
  const baseUrl = value?.trim() || "https://api.openai.com/v1";
  return baseUrl.replace(/\/+$/g, "");
}

function globalFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  return fetch(...args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
