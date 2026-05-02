import { describe, expect, it } from "vitest";
import { applyChatEvent, createEmptyChatState, formatCodexToolRequestInputPreview } from "../src/codex-chat-state";

describe("codex chat state", () => {
  it("keeps chat messages ephemeral and active-note scoped", () => {
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

    expect(state.activePath).toBe("Notes/VHDL.md");
    expect(state.messages).toHaveLength(2);
    expect(state.persistToVault).toBe(false);
  });

  it("clears messages when active note changes", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, {
      type: "user_message",
      content: "Hello",
      createdAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyChatEvent(state, { type: "active_note_changed", activePath: "Notes/C++.md" });

    expect(state.activePath).toBe("Notes/C++.md");
    expect(state.messages).toEqual([]);
  });

  it("preserves messages and error when active note path is unchanged", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, {
      type: "user_message",
      content: "Hello",
      createdAt: "2026-05-02T12:00:00.000Z"
    });
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

  it("does not synthesize timestamps for malformed message events", () => {
    const state = applyChatEvent(
      createEmptyChatState("Notes/VHDL.md"),
      { type: "user_message", content: "Missing timestamp" } as never
    );

    expect(state.messages[0]?.createdAt).toBeUndefined();
  });

  it("records assistant tool requests as pending review items with deterministic ids", () => {
    const state = applyChatEvent(createEmptyChatState("Notes/VHDL.md"), {
      type: "assistant_message",
      content: "I can inspect the current note.",
      createdAt: "2026-05-02T12:00:01.000Z",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "search_notes", input: { query: "timing", limit: 3 } }
      ]
    });

    expect(state.pendingToolRequests).toEqual([
      {
        id: "codex-tool-request-1-1",
        tool: "inspect_current_note",
        input: null,
        createdAt: "2026-05-02T12:00:01.000Z",
        status: "pending_review"
      },
      {
        id: "codex-tool-request-1-2",
        tool: "search_notes",
        input: { query: "timing", limit: 3 },
        createdAt: "2026-05-02T12:00:01.000Z",
        status: "pending_review"
      }
    ]);
  });

  it("clears pending tool requests when active note changes", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, {
      type: "assistant_message",
      content: "I can inspect the current note.",
      createdAt: "2026-05-02T12:00:01.000Z",
      toolRequests: [{ tool: "inspect_current_note", input: null }]
    });
    state = applyChatEvent(state, { type: "active_note_changed", activePath: "Notes/C++.md" });

    expect(state.activePath).toBe("Notes/C++.md");
    expect(state.pendingToolRequests).toEqual([]);
  });

  it("dismisses one pending tool request without affecting the others", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, {
      type: "assistant_message",
      content: "I can inspect and search.",
      createdAt: "2026-05-02T12:00:01.000Z",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "search_notes", input: { query: "timing" } }
      ]
    });

    state = applyChatEvent(state, {
      type: "dismiss_tool_request",
      id: "codex-tool-request-1-1"
    });

    expect(state.pendingToolRequests).toEqual([
      {
        id: "codex-tool-request-1-2",
        tool: "search_notes",
        input: { query: "timing" },
        createdAt: "2026-05-02T12:00:01.000Z",
        status: "pending_review"
      }
    ]);
  });

  it("does not create pending requests for empty tool request responses", () => {
    const state = applyChatEvent(createEmptyChatState("Notes/VHDL.md"), {
      type: "assistant_message",
      content: "No action needed.",
      createdAt: "2026-05-02T12:00:01.000Z",
      toolRequests: []
    });

    expect(state.pendingToolRequests).toEqual([]);
  });

  it("does not synthesize timestamps for malformed assistant events with tool requests", () => {
    const state = applyChatEvent(
      createEmptyChatState("Notes/VHDL.md"),
      {
        type: "assistant_message",
        content: "Missing timestamp",
        toolRequests: [{ tool: "inspect_current_note", input: null }]
      } as never
    );

    expect(state.messages[0]?.createdAt).toBeUndefined();
    expect(state.pendingToolRequests[0]?.createdAt).toBeUndefined();
  });

  it("formats pending tool request input previews without hiding explicit null input", () => {
    expect(formatCodexToolRequestInputPreview(null)).toBe("null");
    expect(formatCodexToolRequestInputPreview(undefined)).toBe("No input");
    expect(formatCodexToolRequestInputPreview({ query: "timing", limit: 3 })).toBe(
      '{"query":"timing","limit":3}'
    );
    expect(formatCodexToolRequestInputPreview("x".repeat(120))).toBe(`${"x".repeat(77)}...`);
  });
});
