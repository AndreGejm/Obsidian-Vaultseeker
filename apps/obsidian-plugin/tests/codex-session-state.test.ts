import { describe, expect, it } from "vitest";
import { createCodexSessionState, applyCodexSessionUpdate } from "../src/codex-session-state";

describe("codex session state", () => {
  it("ignores updates for a different non-null session id by returning the same state reference", () => {
    const state = createCodexSessionState("session-a");

    const updated = applyCodexSessionUpdate(state, {
      type: "agent_message_chunk",
      sessionId: "session-b",
      text: "Wrong session",
      updatedAt: "2026-05-02T12:00:00.000Z"
    });

    expect(updated).toBe(state);
    expect(updated.messages).toEqual([]);
  });

  it("streams matching assistant chunks into the current assistant message", () => {
    let state = createCodexSessionState("session-a");

    state = applyCodexSessionUpdate(state, {
      type: "agent_message_chunk",
      sessionId: "session-a",
      text: "Hello",
      updatedAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyCodexSessionUpdate(state, {
      type: "agent_message_chunk",
      sessionId: "session-a",
      text: " there",
      updatedAt: "2026-05-02T12:00:01.000Z"
    });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "assistant",
      content: "Hello there",
      updatedAt: "2026-05-02T12:00:01.000Z"
    });
  });

  it("streams matching user replay chunks into the current user message", () => {
    let state = createCodexSessionState("session-a");

    state = applyCodexSessionUpdate(state, {
      type: "user_message_chunk",
      sessionId: "session-a",
      text: "Replay",
      updatedAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyCodexSessionUpdate(state, {
      type: "user_message_chunk",
      sessionId: "session-a",
      text: " prompt",
      updatedAt: "2026-05-02T12:00:01.000Z"
    });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "user",
      content: "Replay prompt"
    });
  });

  it("keeps assistant thoughts separate from visible assistant text", () => {
    let state = createCodexSessionState("session-a");

    state = applyCodexSessionUpdate(state, {
      type: "agent_message_chunk",
      sessionId: "session-a",
      text: "Visible",
      updatedAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyCodexSessionUpdate(state, {
      type: "agent_thought_chunk",
      sessionId: "session-a",
      text: "Hidden reasoning",
      updatedAt: "2026-05-02T12:00:01.000Z"
    });

    expect(state.messages[0]).toMatchObject({
      role: "assistant",
      content: "Visible",
      thoughts: "Hidden reasoning"
    });
  });

  it("replaces the current assistant plan", () => {
    let state = createCodexSessionState("session-a");

    state = applyCodexSessionUpdate(state, {
      type: "plan",
      sessionId: "session-a",
      entries: [{ title: "Inspect note", status: "pending" }],
      updatedAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyCodexSessionUpdate(state, {
      type: "plan",
      sessionId: "session-a",
      entries: [{ title: "Inspect note", status: "complete" }],
      updatedAt: "2026-05-02T12:00:01.000Z"
    });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.plan).toEqual({
      entries: [{ title: "Inspect note", status: "complete" }]
    });
  });

  it("upserts tool calls by id, merges updates into the same assistant message, and marks allowlist status", () => {
    let state = createCodexSessionState("session-a");

    state = applyCodexSessionUpdate(state, {
      type: "tool_call",
      sessionId: "session-a",
      toolCallId: "tool-1",
      toolName: "search_notes",
      status: "pending",
      input: { query: "vhdl" },
      updatedAt: "2026-05-02T12:00:00.000Z"
    });
    state = applyCodexSessionUpdate(state, {
      type: "tool_call_update",
      sessionId: "session-a",
      toolCallId: "tool-1",
      status: "completed",
      output: [{ title: "VHDL timing" }],
      updatedAt: "2026-05-02T12:00:01.000Z"
    });
    state = applyCodexSessionUpdate(state, {
      type: "tool_call",
      sessionId: "session-a",
      toolCallId: "tool-2",
      toolName: "write_file",
      status: "pending",
      updatedAt: "2026-05-02T12:00:02.000Z"
    });

    expect(state.messages).toHaveLength(1);
    expect(state.toolCallIndex).toEqual({ "tool-1": 0, "tool-2": 0 });
    expect(state.messages[0]?.toolCalls).toEqual([
      {
        toolCallId: "tool-1",
        toolName: "search_notes",
        isAllowed: true,
        status: "completed",
        input: { query: "vhdl" },
        output: [{ title: "VHDL timing" }]
      },
      {
        toolCallId: "tool-2",
        toolName: "write_file",
        isAllowed: false,
        status: "pending"
      }
    ]);
  });

  it("applies session metadata without creating chat messages", () => {
    const state = createCodexSessionState("session-a");

    const updated = applyCodexSessionUpdate(state, {
      type: "session_metadata",
      sessionId: "session-a",
      title: "Studio session",
      updatedAt: "2026-05-02T12:00:00.000Z"
    });

    expect(updated).not.toBe(state);
    expect(updated.messages).toEqual([]);
    expect(updated.metadata).toEqual({ title: "Studio session" });
    expect(updated.updatedAt).toBe("2026-05-02T12:00:00.000Z");
  });

  it("returns the same state reference for no-op session updates", () => {
    const state = createCodexSessionState("session-a");

    const updated = applyCodexSessionUpdate(state, {
      type: "noop",
      sessionId: "session-a"
    });

    expect(updated).toBe(state);
  });
});
