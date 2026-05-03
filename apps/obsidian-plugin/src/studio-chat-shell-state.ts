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
  codexModel: string;
  codexReasoningEffort: string;
};

export function buildStudioChatShellState(input: BuildStudioChatShellStateInput): StudioChatShellState {
  return {
    title: "Vaultseer",
    emptyStateText: "Ask Vaultseer to review, search, tag, or create notes.",
    composerPlaceholder: "Ask Vaultseer - @ for notes, / for actions",
    activeNoteMention: input.activeNotePath === null ? null : `@${input.activeNoteLabel}`,
    activeNoteTitle: input.activeNotePath ?? "Open a note",
    runtimeLabel: runtimeLabel(input.codexRuntimeStatus),
    modelLabel: input.codexModel,
    modeLabel: "Commands",
    reasoningLabel: titleCase(input.codexReasoningEffort)
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

function titleCase(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
