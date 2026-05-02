import { describe, expect, it } from "vitest";
import { applyCodexSessionUpdate, createCodexSessionState } from "../src/codex-session-state";
import { normalizeCodexAcpSessionUpdate } from "../src/codex-acp-session-update-normalizer";

describe("normalizeCodexAcpSessionUpdate", () => {
  it("maps text chunks directly to Codex session updates", () => {
    expect(
      normalizeCodexAcpSessionUpdate({
        type: "agent_message_chunk",
        sessionId: "session-a",
        text: "Hello"
      })
    ).toEqual({
      type: "agent_message_chunk",
      sessionId: "session-a",
      text: "Hello"
    });

    expect(
      normalizeCodexAcpSessionUpdate({
        type: "agent_thought_chunk",
        sessionId: "session-a",
        text: "Reasoning"
      })
    ).toEqual({
      type: "agent_thought_chunk",
      sessionId: "session-a",
      text: "Reasoning"
    });

    expect(
      normalizeCodexAcpSessionUpdate({
        type: "user_message_chunk",
        sessionId: "session-a",
        text: "Replay"
      })
    ).toEqual({
      type: "user_message_chunk",
      sessionId: "session-a",
      text: "Replay"
    });
  });

  it("maps plans to reducer plan updates", () => {
    const entries = [{ content: "Inspect active note", status: "pending" }];

    expect(
      normalizeCodexAcpSessionUpdate({
        type: "plan",
        sessionId: "session-a",
        entries
      })
    ).toEqual({
      type: "plan",
      sessionId: "session-a",
      entries
    });
  });

  it("maps session info to metadata and uses string updatedAt as the reducer update time", () => {
    expect(
      normalizeCodexAcpSessionUpdate({
        type: "session_info_update",
        sessionId: "session-a",
        title: "Native Studio",
        updatedAt: "2026-05-02T12:00:00.000Z"
      })
    ).toEqual({
      type: "session_metadata",
      sessionId: "session-a",
      title: "Native Studio",
      metadata: {
        sessionInfo: {
          title: "Native Studio",
          updatedAt: "2026-05-02T12:00:00.000Z"
        }
      },
      updatedAt: "2026-05-02T12:00:00.000Z"
    });
  });

  it("maps non-message session updates to metadata without creating chat messages", () => {
    let state = createCodexSessionState("session-a");

    for (const input of [
      { type: "usage_update", sessionId: "session-a", used: 10, size: 100, cost: { amount: 1, currency: "USD" } },
      { type: "available_commands_update", sessionId: "session-a", commands: [{ name: "plan", description: "Plan" }] },
      { type: "current_mode_update", sessionId: "session-a", currentModeId: "build" },
      {
        type: "config_option_update",
        sessionId: "session-a",
        configOptions: [{ id: "model", name: "Model", type: "select", currentValue: "gpt", options: [] }]
      },
      { type: "process_error", sessionId: "session-a", error: { message: "spawn failed", code: "ENOENT" } }
    ] as const) {
      state = applyCodexSessionUpdate(state, normalizeCodexAcpSessionUpdate(input));
    }

    expect(state.messages).toEqual([]);
    expect(state.metadata).toEqual({
      usage: { used: 10, size: 100, cost: { amount: 1, currency: "USD" } },
      availableCommands: [{ name: "plan", description: "Plan" }],
      currentModeId: "build",
      configOptions: [{ id: "model", name: "Model", type: "select", currentValue: "gpt", options: [] }],
      processError: { message: "spawn failed", code: "ENOENT" }
    });
  });

  it("normalizes tool calls without executing tools and infers tool names only from structured raw input", () => {
    expect(
      normalizeCodexAcpSessionUpdate({
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "tool-1",
        title: "search_notes",
        status: "running",
        kind: "read",
        rawInput: { toolName: "search_notes", query: "vhdl" }
      })
    ).toEqual({
      type: "tool_call",
      sessionId: "session-a",
      toolCallId: "tool-1",
      title: "search_notes",
      status: "running",
      kind: "read",
      input: { toolName: "search_notes", query: "vhdl" },
      toolName: "search_notes"
    });

    expect(
      normalizeCodexAcpSessionUpdate({
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "tool-2",
        title: "search_notes",
        status: "running",
        rawInput: { query: "vhdl" }
      })
    ).not.toHaveProperty("toolName");
  });

  it("infers Codex MCP-style tool names and preserves explicit null raw input", () => {
    expect(
      normalizeCodexAcpSessionUpdate({
        type: "tool_call_update",
        sessionId: "session-a",
        toolCallId: "tool-1",
        rawInput: { invocation: { tool: "inspect_current_note" } },
        content: [{ type: "text", text: "ok" }]
      })
    ).toMatchObject({
      type: "tool_call_update",
      toolName: "inspect_current_note",
      input: { invocation: { tool: "inspect_current_note" } },
      output: [{ type: "text", text: "ok" }]
    });

    expect(
      normalizeCodexAcpSessionUpdate({
        type: "tool_call_update",
        sessionId: "session-a",
        toolCallId: "tool-2",
        rawInput: null
      })
    ).toMatchObject({
      type: "tool_call_update",
      input: null
    });
  });

  it("normalizes unsupported update types to noop instead of throwing", () => {
    expect(
      normalizeCodexAcpSessionUpdate({
        type: "future_update",
        sessionId: "session-a",
        value: 1
      })
    ).toEqual({
      type: "noop",
      sessionId: "session-a"
    });
  });
});
