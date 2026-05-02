import type { AcpCodexChatTransport, CodexChatAdapterResponse } from "./codex-chat-adapter";
import type { CodexChatToolRequest } from "./codex-chat-state";
import type { CodexAcpSessionUpdate } from "./codex-acp-session-update-normalizer";
import { normalizeCodexAcpSessionUpdate } from "./codex-acp-session-update-normalizer";
import type { CodexPromptPacket } from "./codex-prompt-packet";
import { isProposalCodexTool, isReadOnlyCodexTool } from "./codex-tool-dispatcher";
import type { CodexSessionState, CodexSessionToolCall } from "./codex-session-state";
import { applyCodexSessionUpdate, createCodexSessionState } from "./codex-session-state";

const NEUTRAL_EMPTY_ASSISTANT_CONTENT = "Codex did not return visible assistant text.";

export type CodexAcpSessionHandle = {
  sessionId: string;
};

export type CodexAcpSendPromptInput = {
  sessionId: string;
  prompt: string;
};

export type CodexAcpTurnResult = {
  status: string;
  stopReason?: string;
};

export type CodexAcpSessionUpdateListener = (update: CodexAcpSessionUpdate) => void;

export type CodexAcpSessionUnsubscribe = () => void;

export interface CodexAcpSessionClient {
  ensureSession(): Promise<CodexAcpSessionHandle>;
  subscribeToSessionUpdates(
    sessionId: string,
    listener: CodexAcpSessionUpdateListener
  ): CodexAcpSessionUnsubscribe;
  sendPrompt(input: CodexAcpSendPromptInput): Promise<CodexAcpTurnResult>;
}

export type CodexAcpSessionControllerOptions = {
  includeProposalTools?: boolean;
};

export class CodexAcpSessionController implements AcpCodexChatTransport {
  constructor(
    private readonly client: CodexAcpSessionClient,
    private readonly options: CodexAcpSessionControllerOptions = {}
  ) {}

  async send(packet: CodexPromptPacket): Promise<CodexChatAdapterResponse> {
    const session = await this.client.ensureSession();
    let state = createCodexSessionState(session.sessionId);
    const unsubscribe = this.client.subscribeToSessionUpdates(session.sessionId, (update) => {
      state = applyCodexSessionUpdate(state, normalizeCodexAcpSessionUpdate(update));
    });

    try {
      await this.client.sendPrompt({
        sessionId: session.sessionId,
        prompt: packet.agentContent
      });

      return buildResponse(state, this.options);
    } finally {
      unsubscribe();
    }
  }
}

function buildResponse(
  state: CodexSessionState,
  options: CodexAcpSessionControllerOptions
): CodexChatAdapterResponse {
  return {
    content: visibleAssistantContent(state),
    toolRequests: state.messages
      .flatMap((message) => message.toolCalls)
      .flatMap((toolCall) => {
        if (!requiresVaultseerExecution(toolCall, options)) {
          return [];
        }

        return [chatToolRequestFromSessionToolCall(toolCall, state.sessionId)];
      })
  };
}

function chatToolRequestFromSessionToolCall(
  toolCall: CodexSessionToolCall & { toolName: string },
  sessionId: string | null
): CodexChatToolRequest {
  const request: CodexChatToolRequest = {
    tool: toolCall.toolName,
    input: toolCall.input
  };
  assignOptional(request, "toolCallId", toolCall.toolCallId);
  assignOptional(request, "sessionId", sessionId ?? undefined);
  assignOptional(request, "status", toolCall.status);
  assignOptional(request, "kind", toolCall.kind);
  assignOptional(request, "requestClass", toolCall.kind);
  return request;
}

function visibleAssistantContent(state: CodexSessionState): string {
  const content = state.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.trim())
    .filter((messageContent) => messageContent.length > 0)
    .join("\n\n");

  if (content.length > 0) {
    return content;
  }

  if (state.metadata.processError !== undefined) {
    return `Codex process error: ${safeStringifyProcessError(state.metadata.processError)}`;
  }

  return NEUTRAL_EMPTY_ASSISTANT_CONTENT;
}

function hasToolName(toolName: string | undefined): toolName is string {
  return toolName !== undefined && toolName.trim().length > 0;
}

function requiresVaultseerExecution(
  toolCall: CodexSessionToolCall,
  options: CodexAcpSessionControllerOptions
): toolCall is CodexSessionToolCall & { toolName: string } {
  if (!toolCall.isAllowed || !hasToolName(toolCall.toolName) || !isPendingToolStatus(toolCall.status)) {
    return false;
  }

  return (
    isReadOnlyCodexTool(toolCall.toolName) ||
    (options.includeProposalTools === true && isProposalCodexTool(toolCall.toolName))
  );
}

function isPendingToolStatus(status: string | undefined): boolean {
  return status === "pending" || status === "requested";
}

function safeStringifyProcessError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string") {
    return error.trim().length > 0 ? error : "Unknown Codex process error.";
  }

  if (isRecord(error)) {
    const message = error["message"];
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  try {
    const serialized = JSON.stringify(error);
    return serialized === undefined ? String(error) : serialized;
  } catch {
    return String(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
