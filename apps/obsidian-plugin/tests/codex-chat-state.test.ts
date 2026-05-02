import { describe, expect, it } from "vitest";
import { applyChatEvent, createEmptyChatState } from "../src/codex-chat-state";

describe("codex chat state", () => {
  it("keeps chat messages ephemeral and active-note scoped", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, { type: "user_message", content: "Suggest tags" });
    state = applyChatEvent(state, { type: "assistant_message", content: "Suggested tag: vhdl/timing" });

    expect(state.activePath).toBe("Notes/VHDL.md");
    expect(state.messages).toHaveLength(2);
    expect(state.persistToVault).toBe(false);
  });

  it("clears messages when active note changes", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, { type: "user_message", content: "Hello" });
    state = applyChatEvent(state, { type: "active_note_changed", activePath: "Notes/C++.md" });

    expect(state.activePath).toBe("Notes/C++.md");
    expect(state.messages).toEqual([]);
  });

  it("preserves messages and error when active note path is unchanged", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, { type: "user_message", content: "Hello" });
    state = applyChatEvent(state, { type: "error", message: "Codex is unavailable" });

    const unchangedState = applyChatEvent(state, { type: "active_note_changed", activePath: "Notes/VHDL.md" });

    expect(unchangedState).toBe(state);
    expect(unchangedState.activePath).toBe("Notes/VHDL.md");
    expect(unchangedState.messages).toHaveLength(1);
    expect(unchangedState.error).toBe("Codex is unavailable");
  });

  it("uses provided timestamps for user and assistant messages", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, {
      type: "user_message",
      content: "Suggest tags",
      createdAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyChatEvent(state, {
      type: "assistant_message",
      content: "Suggested tag: vhdl/timing",
      createdAt: "2026-05-02T12:00:01.000Z"
    });

    expect(state.messages.map((message) => message.createdAt)).toEqual([
      "2026-05-02T12:00:00.000Z",
      "2026-05-02T12:00:01.000Z"
    ]);
  });
});
