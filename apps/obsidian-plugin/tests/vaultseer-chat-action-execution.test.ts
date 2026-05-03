import { describe, expect, it } from "vitest";
import type { CodexToolResult } from "../src/codex-tool-dispatcher";
import {
  buildVaultseerActionEvidenceMessage,
  splitVaultseerChatActionPlan
} from "../src/vaultseer-chat-action-execution";

describe("vaultseer chat action execution", () => {
  it("splits safe read-only actions from approval-gated actions", () => {
    const split = splitVaultseerChatActionPlan({
      content: "Vaultseer prepared actions.",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "search_notes", input: { query: "timing", limit: 8 } },
        { tool: "run_vaultseer_command", input: { commandId: "plan-semantic-index" } },
        { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } }
      ]
    });

    expect(split.autoRunToolRequests).toEqual([
      { tool: "inspect_current_note", input: null },
      { tool: "search_notes", input: { query: "timing", limit: 8 } }
    ]);
    expect(split.approvalToolRequests).toEqual([
      { tool: "run_vaultseer_command", input: { commandId: "plan-semantic-index" } },
      { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } }
    ]);
  });

  it("keeps the original user message when no automatic evidence exists", () => {
    expect(buildVaultseerActionEvidenceMessage("hello", [])).toBe("hello");
  });

  it("adds automatic Vaultseer evidence as data for the Codex turn", () => {
    const results: CodexToolResult[] = [
      {
        ok: true,
        tool: "inspect_current_note",
        output: {
          status: "ready",
          note: { title: "VHDL", path: "Notes/VHDL.md" },
          noteChunks: [{ id: "chunk-1" }],
          relatedNotes: [],
          sourceExcerpts: []
        }
      },
      {
        ok: false,
        tool: "search_notes",
        message: "Search unavailable"
      }
    ];

    const message = buildVaultseerActionEvidenceMessage("review current note", results);

    expect(message).toContain("review current note");
    expect(message).toContain("BEGIN_VAULTSEER_AUTOMATIC_TOOL_RESULTS");
    expect(message).toContain("Tool result (inspect_current_note)");
    expect(message).toContain("VHDL - Notes/VHDL.md");
    expect(message).toContain("Tool result (search_notes) failed: Search unavailable");
    expect(message).toContain("END_VAULTSEER_AUTOMATIC_TOOL_RESULTS");
  });
});
