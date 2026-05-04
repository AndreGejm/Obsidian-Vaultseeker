import { describe, expect, it } from "vitest";
import { applyChatEvent, createEmptyChatState } from "../src/codex-chat-state";
import { buildCodexPendingToolRequestDisplayItems } from "../src/codex-pending-tool-request-display";

describe("codex pending tool request display", () => {
  it("renders Run and Dismiss controls for read-only tool requests", () => {
    const items = buildCodexPendingToolRequestDisplayItems([
      {
        displayId: "codex-tool-request-1-1",
        toolCallId: "tool-call-1",
        sessionId: "session-a",
        tool: "search_notes",
        input: { query: "timing", limit: 3 },
        createdAt: "2026-05-02T12:00:01.000Z",
        reviewStatus: "pending_review",
        status: "requested",
        kind: "read"
      }
    ]);

    expect(items).toEqual([
      {
        displayId: "codex-tool-request-1-1",
        title: "Search notes",
        description: "Searches the read-only Vaultseer note index before Codex answers.",
        tool: "search_notes",
        inputPreview: '{"query":"timing","limit":3}',
        statusLabel: "Pending review",
        controls: [
          {
            type: "run",
            label: "Run",
            displayId: "codex-tool-request-1-1"
          },
          {
            type: "dismiss",
            label: "Dismiss",
            displayId: "codex-tool-request-1-1"
          }
        ]
      }
    ]);
    expect(items.flatMap((item) => item.controls.map((control) => control.label))).not.toContain("Approve");
    expect(items.flatMap((item) => item.controls.map((control) => control.label))).not.toContain("Execute");
  });

  it("uses friendly Vaultseer command names instead of raw command ids", () => {
    const items = buildCodexPendingToolRequestDisplayItems([
      {
        displayId: "codex-tool-request-1-1",
        toolCallId: "tool-call-1",
        sessionId: "session-a",
        tool: "run_vaultseer_command",
        input: { commandId: "plan-semantic-index" },
        createdAt: "2026-05-02T12:00:01.000Z",
        reviewStatus: "pending_review",
        status: "requested",
        kind: "command"
      }
    ]);

    expect(items[0]).toMatchObject({
      title: "Plan semantic indexing queue",
      description: "Queues a Vaultseer command. Review it here, then press Run when you want it executed."
    });
    expect(items[0]?.title).not.toBe("run_vaultseer_command");
  });

  it("renders Stage and Dismiss controls for proposal tool requests", () => {
    const items = buildCodexPendingToolRequestDisplayItems([
      {
        displayId: "codex-tool-request-1-1",
        toolCallId: "tool-call-1",
        sessionId: "session-a",
        tool: "stage_suggestion",
        input: { kind: "tag", value: "vhdl" },
        createdAt: "2026-05-02T12:00:01.000Z",
        reviewStatus: "pending_review",
        status: "requested",
        kind: "proposal"
      }
    ]);

    expect(items[0]?.controls).toEqual([
      {
        type: "stage",
        label: "Stage",
        displayId: "codex-tool-request-1-1"
      },
      {
        type: "dismiss",
        label: "Dismiss",
        displayId: "codex-tool-request-1-1"
      }
    ]);
    expect(items[0]?.controls.map((control) => control.label)).not.toContain("Approve");
    expect(items[0]?.controls.map((control) => control.label)).not.toContain("Apply");
  });

  it("renders Run and Dismiss controls for Vaultseer command requests", () => {
    const items = buildCodexPendingToolRequestDisplayItems([
      {
        displayId: "codex-tool-request-1-1",
        toolCallId: "tool-call-1",
        sessionId: "session-a",
        tool: "run_vaultseer_command",
        input: { commandId: "rebuild-index" },
        createdAt: "2026-05-02T12:00:01.000Z",
        reviewStatus: "pending_review",
        status: "requested",
        kind: "command"
      }
    ]);

    expect(items[0]?.controls).toEqual([
      {
        type: "run",
        label: "Run",
        displayId: "codex-tool-request-1-1"
      },
      {
        type: "dismiss",
        label: "Dismiss",
        displayId: "codex-tool-request-1-1"
      }
    ]);
  });

  it("renders Dismiss only for unknown or arbitrary write tool requests", () => {
    const items = buildCodexPendingToolRequestDisplayItems([
      {
        displayId: "codex-tool-request-1-1",
        toolCallId: "tool-call-1",
        sessionId: "session-a",
        tool: "write_file",
        input: { path: "Notes/VHDL.md", content: "replace" },
        createdAt: "2026-05-02T12:00:01.000Z",
        reviewStatus: "pending_review",
        status: "requested",
        kind: "write"
      },
      {
        displayId: "codex-tool-request-1-2",
        toolCallId: "tool-call-2",
        sessionId: "session-a",
        tool: "unknown_tool",
        input: {},
        createdAt: "2026-05-02T12:00:01.000Z",
        reviewStatus: "pending_review",
        status: "requested"
      }
    ]);

    expect(items.map((item) => item.controls)).toEqual([
      [
        {
          type: "dismiss",
          label: "Dismiss",
          displayId: "codex-tool-request-1-1"
        }
      ],
      [
        {
          type: "dismiss",
          label: "Dismiss",
          displayId: "codex-tool-request-1-2"
        }
      ]
    ]);
  });

  it("uses the Dismiss display id to remove a pending request locally", () => {
    let state = createEmptyChatState("Notes/VHDL.md");
    state = applyChatEvent(state, {
      type: "assistant_message",
      content: "I can inspect and search.",
      createdAt: "2026-05-02T12:00:01.000Z",
      toolRequests: [
        { tool: "inspect_current_note", input: null, toolCallId: "tool-call-1" },
        { tool: "search_notes", input: { query: "timing" }, toolCallId: "tool-call-2" }
      ]
    });
    const [dismissControl] = buildCodexPendingToolRequestDisplayItems(state.pendingToolRequests)[0]?.controls ?? [];

    state = applyChatEvent(state, {
      type: "dismiss_tool_request",
      displayId: dismissControl?.displayId ?? ""
    });

    expect(state.pendingToolRequests.map((request) => request.toolCallId)).toEqual(["tool-call-2"]);
  });
});
