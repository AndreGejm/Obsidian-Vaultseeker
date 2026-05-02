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

  it("renders Dismiss only for proposal tool requests", () => {
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
        type: "dismiss",
        label: "Dismiss",
        displayId: "codex-tool-request-1-1"
      }
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
