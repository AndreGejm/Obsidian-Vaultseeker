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

export type VaultseerSlashCommandResult = {
  handled: boolean;
  state: CodexChatState;
};

export function applyVaultseerSlashCommandMessage(
  state: CodexChatState,
  message: string,
  commands: VaultseerStudioCommand[],
  createdAt: string
): VaultseerSlashCommandResult {
  const slashText = parseSlashText(message);
  if (slashText === null) {
    return { handled: false, state };
  }

  const stateWithUserMessage = applyChatEvent(state, {
    type: "user_message",
    content: message,
    createdAt
  });

  if (isCommandHelpSlash(slashText)) {
    return {
      handled: true,
      state: applyChatEvent(stateWithUserMessage, {
        type: "assistant_message",
        content: buildVaultseerCommandListMessage(commands),
        createdAt
      })
    };
  }

  const command = findSlashCommand(commands, slashText);
  if (command === null) {
    return {
      handled: true,
      state: applyChatEvent(stateWithUserMessage, {
        type: "assistant_message",
        content: `Vaultseer does not know '/${slashText}'. Use the Commands button to pick an available action.`,
        createdAt
      })
    };
  }

  return {
    handled: true,
    state: queueVaultseerStudioCommandRequest(stateWithUserMessage, command, createdAt)
  };
}

export function buildVaultseerCommandListMessage(commands: VaultseerStudioCommand[]): string {
  return [
    "Vaultseer commands available in chat:",
    ...commands.map((command) => `- /${command.id} - ${command.name}`),
    "",
    "You can also use the Commands button to queue these actions."
  ].join("\n");
}

function parseSlashText(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const slashText = trimmed.slice(1).trim();
  return slashText.length > 0 ? slashText : "";
}

function isCommandHelpSlash(slashText: string): boolean {
  const normalized = normalizeCommandText(slashText);
  return normalized === "commands" || normalized === "help";
}

function findSlashCommand(commands: VaultseerStudioCommand[], slashText: string): VaultseerStudioCommand | null {
  const normalized = normalizeCommandText(slashText);
  return (
    commands.find((command) => {
      return normalizeCommandText(command.id) === normalized || normalizeCommandText(command.name) === normalized;
    }) ?? null
  );
}

function normalizeCommandText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
