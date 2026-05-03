import { applyChatEvent, type CodexChatState } from "./codex-chat-state";
import type { VaultseerStudioCommand } from "./studio-command-catalog";

export function queueVaultseerStudioCommandRequest(
  state: CodexChatState,
  command: VaultseerStudioCommand,
  createdAt: string
): CodexChatState {
  return applyChatEvent(state, {
    type: "assistant_message",
    content: `Vaultseer queued '${command.name}'. Review it here, then press Run when you want it executed.`,
    createdAt,
    toolRequests: [
      {
        tool: "run_vaultseer_command",
        input: { commandId: command.id },
        requestClass: "command",
        kind: "command"
      }
    ]
  });
}
