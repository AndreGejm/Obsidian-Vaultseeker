import { describe, expect, it } from "vitest";
import { buildStudioChatComposerState, buildStudioChatShellState } from "../src/studio-chat-shell-state";

describe("buildStudioChatShellState", () => {
  it("builds a note-first Codex chat shell around the active note", () => {
    const state = buildStudioChatShellState({
      activeNoteLabel: "CLAUDE",
      activeNotePath: "CLAUDE.md",
      codexRuntimeStatus: "running",
      codexModel: "gpt-5.4",
      codexReasoningEffort: "medium"
    });

    expect(state.title).toBe("Vaultseer");
    expect(state.emptyStateText).toBe("Ask Vaultseer to review, search, tag, or create notes.");
    expect(state.composerPlaceholder).toBe("Ask Vaultseer - @ for notes, / for actions");
    expect(state.activeNoteMention).toBe("@CLAUDE");
    expect(state.activeNoteTitle).toBe("CLAUDE.md");
    expect(state.runtimeLabel).toBe("Connected");
    expect(state.profileLabel).toBe("Technical writer");
    expect(state.modelLabel).toBe("gpt-5.4");
    expect(state.reasoningLabel).toBe("Medium");
    expect(state.modeLabel).toBe("Commands");
    expect(state.quickPrompts).toEqual([
      {
        id: "draft-suggestions",
        label: "Draft suggestions",
        prompt: "draft suggestions for this note",
        title: "Draft tag, link, and cleanup suggestions for the active note"
      },
      {
        id: "review-rewrite",
        label: "Review & rewrite",
        prompt: "review this note and make it clearer, better structured, and easier to read",
        title: "Ask Vaultseer to inspect the active note and stage a rewrite proposal"
      },
      {
        id: "find-related",
        label: "Find related",
        prompt: "find related notes for this note",
        title: "Search for connected notes and nearby ideas"
      },
      {
        id: "source-check",
        label: "Check sources",
        prompt: "search sources for claims related to this note",
        title: "Search extracted literature and source workspaces for supporting context"
      }
    ]);
  });

  it("uses a gentle disabled composer label when no note is active", () => {
    const state = buildStudioChatShellState({
      activeNoteLabel: "No active note",
      activeNotePath: null,
      codexRuntimeStatus: "failed",
      codexModel: "gpt-5.5",
      codexReasoningEffort: "xhigh"
    });

    expect(state.activeNoteMention).toBeNull();
    expect(state.activeNoteTitle).toBe("Open a note");
    expect(state.runtimeLabel).toBe("Needs attention");
    expect(state.quickPrompts).toEqual([]);
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
