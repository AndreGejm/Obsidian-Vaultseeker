import { describe, expect, it } from "vitest";
import type { CodexToolResult } from "../src/codex-tool-dispatcher";
import {
  appendAssistantRequestedStageSuggestion,
  buildVaultseerStagedProposalMessage,
  buildVaultseerNativeToolLoopMessage,
  buildVaultseerToolContinuationMessage,
  buildVaultseerActionEvidenceMessage,
  shouldHandleVaultseerActionPlanBeforeNativeToolLoop,
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

  it("summarizes successful staged proposals without noisy raw tool output", () => {
    const message = buildVaultseerStagedProposalMessage([
      {
        ok: true,
        tool: "stage_suggestion",
        output: {
          status: "planned",
          message: "Staged a refactor proposal for review. No note was changed."
        }
      }
    ]);

    expect(message).toBe(
      "Vaultseer drafted the active-note change. Review the redline card below, edit if needed, then press Write to note."
    );
    expect(message).not.toContain("Tool result");
  });

  it("keeps diagnostic detail when proposal staging fails", () => {
    const message = buildVaultseerStagedProposalMessage([
      {
        ok: false,
        tool: "stage_suggestion",
        message: "No active note"
      }
    ]);

    expect(message).toContain("Vaultseer could not stage the active-note proposal.");
    expect(message).toContain("Tool result (stage_suggestion) failed: No active note");
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

  it("can stage an unfenced full-note draft during an active-note rewrite task", () => {
    const requests = appendAssistantRequestedStageSuggestion({
      activePath: "Electronics/Ohm's law.md",
      content: [
        "Here is the draft:",
        "",
        "# Ohm's law",
        "",
        "Ohm's law relates voltage, current, and resistance.",
        "",
        "## Formula",
        "",
        "V = I * R",
        "",
        "If you want, I can stage this for review."
      ].join("\n"),
      toolRequests: [],
      allowUnfencedRewriteDraft: true
    });

    expect(requests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Ohm's law.md",
          markdown: [
            "# Ohm's law",
            "",
            "Ohm's law relates voltage, current, and resistance.",
            "",
            "## Formula",
            "",
            "V = I * R"
          ].join("\n"),
          reason: "Assistant returned a stageable active-note draft during a rewrite or create-note task."
        }
      }
    ]);
  });

  it("can stage a fenced full-note draft during an active-note rewrite task even without a literal tool name", () => {
    const requests = appendAssistantRequestedStageSuggestion({
      activePath: "Electronics/Ohm's law.md",
      content: [
        "Here is the draft:",
        "",
        "```markdown",
        "# Ohm's law",
        "",
        "Ohm's law relates voltage, current, and resistance.",
        "```"
      ].join("\n"),
      toolRequests: [],
      allowUnfencedRewriteDraft: true
    });

    expect(requests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Ohm's law.md",
          markdown: "# Ohm's law\n\nOhm's law relates voltage, current, and resistance.",
          reason: "Assistant returned a stageable active-note draft during a rewrite or create-note task."
        }
      }
    ]);
  });

  it("does not stage unfenced Markdown from ordinary chat turns", () => {
    const requests = appendAssistantRequestedStageSuggestion({
      activePath: "Electronics/Ohm's law.md",
      content: [
        "# Ohm's law",
        "",
        "Ohm's law relates voltage, current, and resistance."
      ].join("\n"),
      toolRequests: []
    });

    expect(requests).toEqual([]);
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

  it("handles local-only action plans before native Codex tool-loop sends", () => {
    expect(
      shouldHandleVaultseerActionPlanBeforeNativeToolLoop({
        content: "Vaultseer staged the previous draft for review.",
        toolRequests: [],
        autoStageToolRequests: [{ tool: "stage_suggestion", input: { kind: "rewrite", markdown: "# Draft" } }],
        sendToCodex: false
      })
    ).toBe(true);

    expect(
      shouldHandleVaultseerActionPlanBeforeNativeToolLoop({
        content: "Vaultseer is preparing an active-note rewrite proposal.",
        toolRequests: [{ tool: "inspect_current_note", input: null }],
        agentMessage: "Use liveNote.text and request stage_suggestion."
      })
    ).toBe(false);
  });

  it("uses Vaultseer task instructions as the native Codex message when available", () => {
    expect(
      buildVaultseerNativeToolLoopMessage({
        originalMessage: "review this note",
        actionPlan: {
          content: "Vaultseer is preparing an active-note rewrite proposal.",
          toolRequests: [{ tool: "inspect_current_note", input: null }],
          agentMessage: "Use liveNote.text and request stage_suggestion."
        }
      })
    ).toBe("Use liveNote.text and request stage_suggestion.");

    expect(
      buildVaultseerNativeToolLoopMessage({
        originalMessage: "hello",
        actionPlan: { content: null, toolRequests: [] }
      })
    ).toBe("hello");
  });
});
