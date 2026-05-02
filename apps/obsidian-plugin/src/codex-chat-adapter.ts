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

export class NotConfiguredCodexChatAdapter implements CodexChatAdapter {
  async send(): Promise<CodexChatAdapterResponse> {
    return {
      content: "Native Codex chat is not connected yet. Start Codex from Vaultseer settings, then retry.",
      toolRequests: []
    };
  }
}
