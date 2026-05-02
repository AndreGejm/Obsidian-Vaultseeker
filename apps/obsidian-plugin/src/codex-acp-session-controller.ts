import type { AcpCodexChatTransport, CodexChatAdapterResponse } from "./codex-chat-adapter";
import type { CodexAcpSessionUpdate } from "./codex-acp-session-update-normalizer";
import { normalizeCodexAcpSessionUpdate } from "./codex-acp-session-update-normalizer";
import type { CodexPromptPacket } from "./codex-prompt-packet";
import type { CodexSessionState } from "./codex-session-state";
import { applyCodexSessionUpdate, createCodexSessionState } from "./codex-session-state";

const NEUTRAL_EMPTY_ASSISTANT_CONTENT = "Codex did not return visible assistant text.";

export type CodexAcpSessionHandle = {
  sessionId: string;
};

export type CodexAcpSendPromptInput = {
  sessionId: string;
  prompt: string;
};

export type CodexAcpSessionUpdateListener = (update: CodexAcpSessionUpdate) => void;

export type CodexAcpSessionUnsubscribe = () => void;

export interface CodexAcpSessionClient {
  ensureSession(): Promise<CodexAcpSessionHandle>;
  subscribeToSessionUpdates(
    sessionId: string,
    listener: CodexAcpSessionUpdateListener
  ): CodexAcpSessionUnsubscribe;
  sendPrompt(input: CodexAcpSendPromptInput): Promise<void>;
}

export class CodexAcpSessionController implements AcpCodexChatTransport {
  constructor(private readonly client: CodexAcpSessionClient) {}

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

      return buildResponse(state);
    } finally {
      unsubscribe();
    }
  }
}

function buildResponse(state: CodexSessionState): CodexChatAdapterResponse {
  return {
    content: visibleAssistantContent(state),
    toolRequests: state.messages
      .flatMap((message) => message.toolCalls)
      .flatMap((toolCall) => {
        if (!toolCall.isAllowed || !hasToolName(toolCall.toolName)) {
          return [];
        }

        return [
          {
            tool: toolCall.toolName,
            input: toolCall.input
          }
        ];
      })
  };
}

function visibleAssistantContent(state: CodexSessionState): string {
  const content = state.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.trim())
    .filter((messageContent) => messageContent.length > 0)
    .join("\n\n");

  return content.length > 0 ? content : NEUTRAL_EMPTY_ASSISTANT_CONTENT;
}

function hasToolName(toolName: string | undefined): toolName is string {
  return toolName !== undefined && toolName.trim().length > 0;
}
