import { describe, expect, it } from "vitest";
import { buildStudioChatShellState } from "../src/studio-chat-shell-state";

describe("buildStudioChatShellState", () => {
  it("builds a note-first Codex chat shell around the active note", () => {
    const state = buildStudioChatShellState({
      activeNoteLabel: "CLAUDE",
      activeNotePath: "CLAUDE.md",
      codexRuntimeStatus: "running",
      codexModel: "gpt-5.4",
      codexReasoningEffort: "medium"
    });

    expect(state.title).toBe("Codex");
    expect(state.emptyStateText).toBe("Start a conversation with Codex...");
    expect(state.composerPlaceholder).toBe("Message Codex - @ to mention notes, / for commands");
    expect(state.activeNoteMention).toBe("@CLAUDE");
    expect(state.activeNoteTitle).toBe("CLAUDE.md");
    expect(state.runtimeLabel).toBe("Connected");
    expect(state.modelLabel).toBe("gpt-5.4");
    expect(state.reasoningLabel).toBe("Medium");
    expect(state.modeLabel).toBe("Commands");
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
  });
});
