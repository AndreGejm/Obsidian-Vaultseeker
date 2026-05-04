import type { ActiveNoteContextPacket } from "@vaultseer/core";
import type { CodexChatToolRequest } from "./codex-chat-state";
import { buildCodexPromptPacket, type CodexPromptPacket } from "./codex-prompt-packet";
import type { VaultseerAgentContentPart, VaultseerAgentToolEvent } from "./vaultseer-agent-runtime";

export type CodexChatAdapterRequest = {
  message: string;
  context: ActiveNoteContextPacket;
  attachments?: VaultseerAgentContentPart[];
};

export type CodexChatAdapterResponse = {
  content: string;
  toolRequests: CodexChatToolRequest[];
  toolEvents?: VaultseerAgentToolEvent[];
};

export interface CodexChatAdapter {
  readonly capabilities?: {
    nativeToolLoop?: boolean;
  };
  send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse>;
}

export interface AcpCodexChatTransport {
  send(request: CodexPromptPacket): Promise<CodexChatAdapterResponse>;
}

export class AcpCodexChatAdapter implements CodexChatAdapter {
  constructor(private readonly transport: AcpCodexChatTransport) {}

  async send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse> {
    if (request.context.status !== "ready") {
      return {
        content: request.context.message,
        toolRequests: []
      };
    }

    try {
      return await this.transport.send(buildCodexPromptPacket(request));
    } catch (error) {
      return {
        content: `Codex chat could not respond: ${getErrorMessage(error)}. Check the native Codex connection, then retry.`,
        toolRequests: []
      };
    }
  }
}

export class NotConfiguredCodexChatAdapter implements CodexChatAdapter {
  async send(): Promise<CodexChatAdapterResponse> {
    return {
      content: "Native Codex chat is not connected yet. Start Codex from Vaultseer settings, then retry.",
      toolRequests: []
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return "unknown error";
}
