import type { ActiveNoteContextPacket } from "@vaultseer/core";

export type CodexChatAdapterRequest = {
  message: string;
  context: ActiveNoteContextPacket;
};

export type CodexChatAdapterResponse = {
  content: string;
  toolRequests: Array<{ tool: string; input: unknown }>;
};

export interface CodexChatAdapter {
  send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse>;
}

export interface AcpCodexChatTransport {
  send(request: CodexChatAdapterRequest): Promise<CodexChatAdapterResponse>;
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
      return await this.transport.send({
        message: request.message,
        context: request.context
      });
    } catch (error) {
      return {
        content: `Codex chat could not respond. ${getErrorMessage(error)}`,
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
  return error instanceof Error ? error.message : "The chat transport failed.";
}
