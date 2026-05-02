import type { CodexRuntimeStatus } from "@vaultseer/core";

export type StudioChatShellState = {
  title: string;
  emptyStateText: string;
  composerPlaceholder: string;
  activeNoteMention: string | null;
  activeNoteTitle: string;
  runtimeLabel: string;
  modelLabel: string;
  modeLabel: string;
  reasoningLabel: string;
};

export type BuildStudioChatShellStateInput = {
  activeNoteLabel: string;
  activeNotePath: string | null;
  codexRuntimeStatus: CodexRuntimeStatus;
};

export function buildStudioChatShellState(input: BuildStudioChatShellStateInput): StudioChatShellState {
  return {
    title: "Codex",
    emptyStateText: "Start a conversation with Codex...",
    composerPlaceholder: "Message Codex - @ to mention notes, / for commands",
    activeNoteMention: input.activeNotePath === null ? null : `@${input.activeNoteLabel}`,
    activeNoteTitle: input.activeNotePath ?? "Open a note",
    runtimeLabel: runtimeLabel(input.codexRuntimeStatus),
    modelLabel: "gpt-5.5",
    modeLabel: "Default",
    reasoningLabel: "Xhigh"
  };
}

function runtimeLabel(status: CodexRuntimeStatus): string {
  if (status === "running") return "Connected";
  if (status === "starting") return "Starting";
  if (status === "stopping") return "Stopping";
  if (status === "disabled") return "Disabled";
  if (status === "failed") return "Needs attention";
  return "Stopped";
}
