import { describe, expect, it } from "vitest";
import {
  buildStudioChatComposerState,
  buildStudioChatContextBarState,
  buildStudioChatShellState
} from "../src/studio-chat-shell-state";

describe("buildStudioChatShellState", () => {
  it("builds a note-first Codex chat shell around the active note", () => {
    const state = buildStudioChatShellState({
      activeNoteLabel: "CLAUDE",
      activeNotePath: "CLAUDE.md",
      codexRuntimeStatus: "running",
      codexModel: "gpt-5.4",
      codexReasoningEffort: "medium",
      chatSending: false
    });

    expect(state.title).toBe("Vaultseer");
    expect(state.emptyStateText).toBe("Ask Vaultseer to review, search, tag, or create notes.");
    expect(state.composerPlaceholder).toBe("Ask Vaultseer - @ for notes, / for actions");
    expect(state).toMatchObject({
      composerHint: "Enter to send - Shift+Enter for a new line",
      resetLabel: "New chat",
      resetTitle: "Clear this chat and start fresh"
    });
    expect(state.activeNoteMention).toBe("@CLAUDE");
    expect(state.activeNoteTitle).toBe("CLAUDE.md");
    expect(state.runtimeLabel).toBe("Connected");
    expect(state.profileLabel).toBe("Technical writer");
    expect(state.modelLabel).toBe("gpt-5.4");
    expect(state.reasoningLabel).toBe("Medium");
    expect(state.modeLabel).toBe("Commands");
    expect(state.quickPrompts).toEqual([
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
    ]);
  });

  it("uses a gentle disabled composer label when no note is active", () => {
    const state = buildStudioChatShellState({
      activeNoteLabel: "No active note",
      activeNotePath: null,
      codexRuntimeStatus: "failed",
      codexModel: "gpt-5.5",
      codexReasoningEffort: "xhigh",
      chatSending: false
    });

    expect(state.activeNoteMention).toBeNull();
    expect(state.activeNoteTitle).toBe("Open a note");
    expect(state.runtimeLabel).toBe("Needs attention");
    expect(state.quickPrompts).toEqual([]);
  });

  it("turns the reset control into a stop action while Vaultseer is thinking", () => {
    const state = buildStudioChatShellState({
      activeNoteLabel: "Ohm's law",
      activeNotePath: "Electronics/Ohm's law.md",
      codexRuntimeStatus: "running",
      codexModel: "gpt-5.5",
      codexReasoningEffort: "high",
      chatSending: true
    });

    expect(state.resetLabel).toBe("Stop");
    expect(state.resetTitle).toBe("Cancel this Vaultseer turn and reset the provider session");
  });

  it("keeps the composer selectable while a Codex turn is running", () => {
    expect(
      buildStudioChatComposerState({
        chatSending: true,
        draft: "next note idea",
        focusRequested: true
      })
    ).toEqual({
      inputValue: "next note idea",
      inputDisabled: false,
      sendDisabled: true,
      sendLabel: "...",
      shouldRestoreFocus: false
    });
  });

  it("restores composer focus after a finished chat action asks for it", () => {
    expect(
      buildStudioChatComposerState({
        chatSending: false,
        draft: "",
        focusRequested: true
      })
    ).toEqual({
      inputValue: "",
      inputDisabled: false,
      sendDisabled: false,
      sendLabel: ">",
      shouldRestoreFocus: true
    });
  });
});

describe("buildStudioChatContextBarState", () => {
  it("summarizes the active note state in one compact chat line", () => {
    expect(
      buildStudioChatContextBarState({
        activeNoteLabel: "Resistor Types",
        activeNotePath: "Electronics/Resistor Types.md",
        activeNoteIndexed: true,
        activeProposalCount: 1
      })
    ).toEqual({
      title: "Resistor Types",
      detail: "Electronics/Resistor Types.md - Indexed - 1 change",
      tone: "ready",
      action: {
        id: "review-proposals",
        label: "Review 1 change",
        title: "Show proposed changes for this note"
      }
    });
  });

  it("offers a rebuild action when the active note is not indexed yet", () => {
    expect(
      buildStudioChatContextBarState({
        activeNoteLabel: "New note",
        activeNotePath: "Inbox/New note.md",
        activeNoteIndexed: false,
        activeProposalCount: 0
      })
    ).toEqual({
      title: "New note",
      detail: "Inbox/New note.md - Not indexed - 0 changes",
      tone: "attention",
      action: {
        id: "rebuild-index",
        label: "Rebuild index",
        title: "Refresh Vaultseer's read-only note index"
      }
    });
  });

  it("offers a draft rewrite action when the active note is indexed and has no proposals", () => {
    expect(
      buildStudioChatContextBarState({
        activeNoteLabel: "Ohm's law",
        activeNotePath: "Electronics/Ohm's law.md",
        activeNoteIndexed: true,
        activeProposalCount: 0
      })
    ).toEqual({
      title: "Ohm's law",
      detail: "Electronics/Ohm's law.md - Indexed - 0 changes",
      tone: "ready",
      action: {
        id: "draft-rewrite",
        label: "Draft rewrite",
        title: "Ask Vaultseer to stage a clearer version of this note"
      }
    });
  });

  it("shows a clear no-note state for the chat context line", () => {
    expect(
      buildStudioChatContextBarState({
        activeNoteLabel: "No active note",
        activeNotePath: null,
        activeNoteIndexed: false,
        activeProposalCount: 0
      })
    ).toEqual({
      title: "No active note",
      detail: "Open a note to let Vaultseer help with it.",
      tone: "muted",
      action: null
    });
  });
});
