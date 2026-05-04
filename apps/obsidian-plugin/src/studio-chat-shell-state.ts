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
  quickPrompts: StudioChatQuickPrompt[];
};

export type StudioChatQuickPrompt = {
  id: string;
  label: string;
  prompt: string;
  title: string;
};

export type StudioChatComposerState = {
  inputValue: string;
  inputDisabled: boolean;
  sendDisabled: boolean;
  sendLabel: string;
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
    reasoningLabel: titleCase(input.codexReasoningEffort),
    quickPrompts: buildQuickPrompts(input.activeNotePath)
  };
}

export function buildStudioChatComposerState(input: {
  chatSending: boolean;
  draft: string;
}): StudioChatComposerState {
  return {
    inputValue: input.draft,
    inputDisabled: false,
    sendDisabled: input.chatSending,
    sendLabel: input.chatSending ? "..." : ">"
  };
}

function buildQuickPrompts(activeNotePath: string | null): StudioChatQuickPrompt[] {
  if (activeNotePath === null) {
    return [];
  }

  return [
    {
      id: "draft-suggestions",
      label: "Draft suggestions",
      prompt: "draft suggestions for this note",
      title: "Draft tag, link, and cleanup suggestions for the active note"
    }
  ];
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
