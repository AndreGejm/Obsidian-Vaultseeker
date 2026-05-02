import { AcpCodexChatAdapter, type CodexChatAdapter } from "./codex-chat-adapter";
import { CodexAcpSessionController, type CodexAcpSessionClient } from "./codex-acp-session-controller";

export function createNativeStudioCodexChatAdapter(client: CodexAcpSessionClient): CodexChatAdapter {
  return new AcpCodexChatAdapter(new CodexAcpSessionController(client, { includeProposalTools: true }));
}
