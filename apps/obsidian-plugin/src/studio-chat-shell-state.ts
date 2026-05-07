import type { CodexRuntimeStatus } from "@vaultseer/core";
import { DEFAULT_VAULTSEER_AGENT_PROFILE } from "./vaultseer-agent-profile";

export type StudioChatShellState = {
  title: string;
  emptyStateText: string;
  composerPlaceholder: string;
  composerHint: string;
  activeNoteMention: string | null;
  activeNoteTitle: string;
  runtimeLabel: string;
  profileLabel: string;
  modelLabel: string;
  modeLabel: string;
  reasoningLabel: string;
  resetLabel: string;
  resetTitle: string;
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
  shouldRestoreFocus: boolean;
};

export type StudioChatContextBarAction = {
  id: "review-proposals" | "rebuild-index" | "draft-rewrite";
  label: string;
  title: string;
};

export type StudioChatContextBarState = {
  title: string;
  detail: string;
  tone: "ready" | "attention" | "muted";
  action: StudioChatContextBarAction | null;
};

export type BuildStudioChatShellStateInput = {
  activeNoteLabel: string;
  activeNotePath: string | null;
  codexRuntimeStatus: CodexRuntimeStatus;
  codexModel: string;
  codexReasoningEffort: string;
  chatSending: boolean;
};

export function buildStudioChatShellState(input: BuildStudioChatShellStateInput): StudioChatShellState {
  return {
    title: "Vaultseer",
    emptyStateText: "Ask Vaultseer to review, search, tag, or create notes.",
    composerPlaceholder: "Ask Vaultseer - @ for notes, / for actions",
    composerHint: "Enter to send - Shift+Enter for a new line",
    activeNoteMention: input.activeNotePath === null ? null : `@${input.activeNoteLabel}`,
    activeNoteTitle: input.activeNotePath ?? "Open a note",
    runtimeLabel: runtimeLabel(input.codexRuntimeStatus),
    profileLabel: DEFAULT_VAULTSEER_AGENT_PROFILE.shortTitle,
    modelLabel: input.codexModel,
    modeLabel: "Commands",
    reasoningLabel: titleCase(input.codexReasoningEffort),
    resetLabel: input.chatSending ? "Stop" : "New chat",
    resetTitle: input.chatSending
      ? "Cancel this Vaultseer turn and reset the provider session"
      : "Clear this chat and start fresh",
    quickPrompts: buildQuickPrompts(input.activeNotePath)
  };
}

export function buildStudioChatComposerState(input: {
  chatSending: boolean;
  draft: string;
  focusRequested?: boolean;
}): StudioChatComposerState {
  return {
    inputValue: input.draft,
    inputDisabled: false,
    sendDisabled: input.chatSending,
    sendLabel: input.chatSending ? "..." : ">",
    shouldRestoreFocus: input.focusRequested === true && !input.chatSending
  };
}

export function buildStudioChatContextBarState(input: {
  activeNoteLabel: string;
  activeNotePath: string | null;
  activeNoteIndexed: boolean;
  activeProposalCount: number;
}): StudioChatContextBarState {
  if (input.activeNotePath === null) {
    return {
      title: "No active note",
      detail: "Open a note to let Vaultseer help with it.",
      tone: "muted",
      action: null
    };
  }

  const proposalLabel = `${input.activeProposalCount} change${input.activeProposalCount === 1 ? "" : "s"}`;

  return {
    title: input.activeNoteLabel,
    detail: [input.activeNotePath, input.activeNoteIndexed ? "Indexed" : "Not indexed", proposalLabel].join(" - "),
    tone: input.activeNoteIndexed ? "ready" : "attention",
    action: buildContextBarAction({
      activeNoteIndexed: input.activeNoteIndexed,
      activeProposalCount: input.activeProposalCount
    })
  };
}

function buildContextBarAction(input: {
  activeNoteIndexed: boolean;
  activeProposalCount: number;
}): StudioChatContextBarAction | null {
  if (input.activeProposalCount > 0) {
    return {
      id: "review-proposals",
      label: `Review ${input.activeProposalCount} change${input.activeProposalCount === 1 ? "" : "s"}`,
      title: "Show proposed changes for this note"
    };
  }

  if (!input.activeNoteIndexed) {
    return {
      id: "rebuild-index",
      label: "Rebuild index",
      title: "Refresh Vaultseer's read-only note index"
    };
  }

  return {
    id: "draft-rewrite",
    label: "Draft rewrite",
    title: "Ask Vaultseer to stage a clearer version of this note"
  };
}

function buildQuickPrompts(activeNotePath: string | null): StudioChatQuickPrompt[] {
  if (activeNotePath === null) {
    return [];
  }

  return [
    {
      id: "draft-note",
      label: "Draft note",
      prompt: "write a useful first draft for this note from the title and path, then stage it for review",
      title: "Create a reviewable first draft for the active note"
    },
    {
      id: "rewrite-note",
      label: "Rewrite note",
      prompt: "review this note and make it clearer, better structured, and easier to read",
      title: "Stage a clearer rewrite for the active note"
    },
    {
      id: "suggest-tags-links",
      label: "Suggest tags/links",
      prompt: "suggest tags and links for this note",
      title: "Find useful tags and links for the active note"
    },
    {
      id: "find-related",
      label: "Find related",
      prompt: "find related notes for this note",
      title: "Search for connected notes and nearby ideas"
    },
    {
      id: "fact-check",
      label: "Fact check",
      prompt: "fact check this note using sources first",
      title: "Check the active note against source workspaces and available evidence"
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
