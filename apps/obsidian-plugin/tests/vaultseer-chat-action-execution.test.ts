import { describe, expect, it } from "vitest";
import type { CodexToolResult } from "../src/codex-tool-dispatcher";
import {
  appendAssistantRequestedStageSuggestion,
  buildVaultseerToolContinuationMessage,
  buildVaultseerActionEvidenceMessage,
  shouldContinueVaultseerToolLoop,
  splitCodexToolRequestsForExecution,
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
    expect(split.autoStageToolRequests).toEqual([
      { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } }
    ]);
    expect(split.approvalToolRequests).toEqual([
      { tool: "run_vaultseer_command", input: { commandId: "plan-semantic-index" } }
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

  it("splits Codex-requested read-only tools from approval-gated continuation requests", () => {
    const split = splitCodexToolRequestsForExecution([
      { tool: "inspect_current_note_chunks", input: null },
      { tool: "semantic_search_notes", input: { query: "decoupling capacitors" } },
      { tool: "stage_suggestion", input: { kind: "link", links: ["[[Bypass capacitor]]"] } },
      { tool: "run_vaultseer_command", input: { commandId: "rebuild-index" } }
    ]);

    expect(split.autoRunToolRequests).toEqual([
      { tool: "inspect_current_note_chunks", input: null },
      { tool: "semantic_search_notes", input: { query: "decoupling capacitors" } }
    ]);
    expect(split.autoStageToolRequests).toEqual([
      { tool: "stage_suggestion", input: { kind: "link", links: ["[[Bypass capacitor]]"] } }
    ]);
    expect(split.approvalToolRequests).toEqual([
      { tool: "run_vaultseer_command", input: { commandId: "rebuild-index" } }
    ]);
  });

  it("builds a bounded continuation prompt from approved Vaultseer tool results", () => {
    const message = buildVaultseerToolContinuationMessage([
      {
        ok: true,
        tool: "stage_suggestion",
        output: {
          status: "planned",
          message: "Staged a refactor proposal for review. No note was changed."
        }
      }
    ]);

    expect(message).toContain("Vaultseer completed approved native tool work.");
    expect(message).toContain("Tool result (stage_suggestion)");
    expect(message).toContain("Staged a refactor proposal for review. No note was changed.");
    expect(message).toContain("Continue the same task");
  });

  it("stops automatic continuation before the tool loop can run forever", () => {
    expect(shouldContinueVaultseerToolLoop({ iteration: 0, maxIterations: 3, resultCount: 1 })).toBe(true);
    expect(shouldContinueVaultseerToolLoop({ iteration: 2, maxIterations: 3, resultCount: 1 })).toBe(true);
    expect(shouldContinueVaultseerToolLoop({ iteration: 3, maxIterations: 3, resultCount: 1 })).toBe(false);
    expect(shouldContinueVaultseerToolLoop({ iteration: 0, maxIterations: 3, resultCount: 0 })).toBe(false);
  });

  it("adds an auto-stage request when the assistant text asks to run stage_suggestion", () => {
    const requests = appendAssistantRequestedStageSuggestion({
      activePath: "Electronics/Resistor types 2.md",
      content: [
        "Please run Vaultseer `stage_suggestion` with:",
        "```markdown",
        "# Resistor types 2",
        "",
        "A cleaner active note.",
        "```"
      ].join("\n"),
      toolRequests: []
    });

    expect(requests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Resistor types 2.md",
          markdown: "# Resistor types 2\n\nA cleaner active note.",
          reason: "Assistant requested Vaultseer stage_suggestion for the active note."
        }
      }
    ]);
  });

  it("does not duplicate an explicit stage_suggestion tool request", () => {
    const explicitRequest = { tool: "stage_suggestion", input: { kind: "rewrite", markdown: "# Explicit" } };

    expect(
      appendAssistantRequestedStageSuggestion({
        activePath: "Electronics/Resistor types 2.md",
        content: "Please run Vaultseer `stage_suggestion` with:\n```markdown\n# Parsed\n```",
        toolRequests: [explicitRequest]
      })
    ).toEqual([explicitRequest]);
  });
});
