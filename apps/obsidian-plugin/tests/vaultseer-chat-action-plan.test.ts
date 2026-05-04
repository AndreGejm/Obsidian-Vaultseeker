import { describe, expect, it } from "vitest";
import { buildVaultseerChatActionPlan, extractLastAssistantMarkdownSuggestion } from "../src/vaultseer-chat-action-plan";

describe("buildVaultseerChatActionPlan", () => {
  it("answers Vaultseer capability questions locally instead of asking Codex", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "do you have access to all vaultseer commands?",
      activePath: "Notes/VHDL.md"
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.toolRequests).toEqual([]);
    expect(plan.content).toContain("Yes. Vaultseer commands are available in this chat.");
    expect(plan.content).toContain("Native agent tools include note search, semantic search, indexing, chunk inspection, and suggestion drafting.");
    expect(plan.content).toContain("/rebuild-index");
    expect(plan.content).toContain("/plan-source-extraction-queue");
  });

  it("treats healthy native bridge check-ins as local Vaultseer status", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "vaultseet native in codex, successful",
      activePath: "Notes/VHDL.md"
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.toolRequests).toEqual([]);
    expect(plan.content).toContain("Vaultseer-native setup is healthy");
    expect(plan.content).toContain("write-like changes are staged for approval");
  });

  it("does not send underspecified staging requests to generic Codex chat", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "stage it for review",
      activePath: "Notes/VHDL.md"
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.toolRequests).toEqual([]);
    expect(plan.content).toContain("I can stage suggestions here");
    expect(plan.content).toContain("exact tags or links");
  });

  it("stages the previous assistant markdown draft for explicit active-note write requests", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "ok write this to the actual note",
      activePath: "Electronics/Resistor types 2.md",
      lastAssistantMarkdownSuggestion: [
        "---",
        "title: Resistor types 2",
        "tags:",
        "  - electronics",
        "  - resistors",
        "---",
        "# Resistor types 2",
        "",
        "## Fixed resistors",
        "",
        "Metal film resistors are stable."
      ].join("\n")
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.content).toContain("Vaultseer staged the previous draft for review.");
    expect(plan.autoStageToolRequests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Resistor types 2.md",
          markdown: [
            "---",
            "title: Resistor types 2",
            "tags:",
            "  - electronics",
            "  - resistors",
            "---",
            "# Resistor types 2",
            "",
            "## Fixed resistors",
            "",
            "Metal film resistors are stable."
          ].join("\n"),
          reason: "User explicitly asked Vaultseer chat to write the previous assistant draft to the active note."
        }
      }
    ]);
    expect(plan.toolRequests).toEqual([]);
  });

  it("extracts the last assistant markdown draft from chat history", () => {
    expect(
      extractLastAssistantMarkdownSuggestion([
        { role: "assistant", content: "```markdown\n# Old\n```" },
        { role: "user", content: "make another" },
        { role: "assistant", content: "Use this:\n```markdown\n# New\n\nBody.\n```" }
      ])
    ).toBe("# New\n\nBody.");
  });

  it("queues explicit tag staging requests locally for user approval", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "stage tags electronics, components, circuits for review",
      activePath: "Notes/resistor.md"
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.content).toContain("Vaultseer prepared a tag suggestion for review.");
    expect(plan.toolRequests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "tag",
          targetPath: "Notes/resistor.md",
          tags: ["electronics", "components", "circuits"],
          reason: "User asked Vaultseer chat to stage these tags."
        }
      }
    ]);
  });

  it("drafts suggestions by gathering current-note and related-note evidence before asking Codex", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "draft suggestions for this note",
      activePath: "Notes/resistor.md"
    });

    expect(plan.sendToCodex).toBeUndefined();
    expect(plan.content).toContain("Vaultseer is drafting suggestions from current-note evidence.");
    expect(plan.agentMessage).toContain("Draft concise Vaultseer suggestions");
    expect(plan.agentMessage).toContain("tag suggestions");
    expect(plan.agentMessage).toContain("link suggestions");
    expect(plan.toolRequests.map((request) => request.tool)).toEqual([
      "inspect_current_note",
      "inspect_current_note_chunks",
      "suggest_current_note_tags",
      "suggest_current_note_links",
      "inspect_note_quality",
      "search_notes"
    ]);
  });

  it("turns active-note rewrite requests into a Vaultseer proposal task instead of a generic review", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "review this note and make it more readable and refactored",
      activePath: "Electronics/Resistor types 2.md"
    });

    expect(plan.content).toContain("Vaultseer is preparing an active-note rewrite proposal.");
    expect(plan.agentMessage).toContain("Use liveNote.text as the active note body");
    expect(plan.agentMessage).toContain("request stage_suggestion with kind=rewrite");
    expect(plan.agentMessage).toContain("Do not ask the user to run stage_suggestion");
    expect(plan.toolRequests.map((request) => request.tool)).toEqual([
      "inspect_current_note",
      "inspect_current_note_chunks",
      "inspect_note_quality",
      "search_notes"
    ]);
  });

  it("treats review-queue draft wording as an active-note proposal task", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "draft a suggestion for me to review in review writes",
      activePath: "Electronics/Resistor types 2.md"
    });

    expect(plan.content).toContain("Vaultseer is preparing an active-note rewrite proposal.");
    expect(plan.agentMessage).toContain("request stage_suggestion with kind=rewrite");
    expect(plan.agentMessage).toContain("Do not ask the user to run stage_suggestion");
    expect(plan.toolRequests.map((request) => request.tool)).toEqual([
      "inspect_current_note",
      "inspect_current_note_chunks",
      "inspect_note_quality",
      "search_notes"
    ]);
  });

  it("treats natural tag/link suggestion requests as draft suggestion work", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "suggest tags and links",
      activePath: "Notes/resistor.md"
    });

    expect(plan.content).toContain("Vaultseer is drafting suggestions from current-note evidence.");
    expect(plan.agentMessage).toContain("Do not write directly");
    expect(plan.toolRequests.map((request) => request.tool)).toEqual([
      "inspect_current_note",
      "inspect_current_note_chunks",
      "suggest_current_note_tags",
      "suggest_current_note_links",
      "inspect_note_quality",
      "search_notes"
    ]);
  });

  it("plans current-note inspection for note review requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "review current note",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared current-note inspection before answering.",
      toolRequests: [
        { tool: "inspect_current_note", input: null },
        { tool: "inspect_current_note_chunks", input: { limit: 8 } },
        { tool: "inspect_note_quality", input: null }
      ]
    });
  });

  it("plans chunk inspection for current-note chunking requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "show chunks for this note",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared current-note chunk inspection.",
      toolRequests: [{ tool: "inspect_current_note_chunks", input: { limit: 12 } }]
    });
  });

  it("plans native index rebuild for note indexing requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "rebuild the note index",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared the note index rebuild command.",
      toolRequests: [{ tool: "rebuild_note_index", input: null }]
    });
  });

  it("plans native semantic search for explicit semantic search requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "semantic search adjacent timing topics",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared native semantic note search.",
      toolRequests: [{ tool: "semantic_search_notes", input: { query: "semantic search adjacent timing topics", limit: 8 } }]
    });
  });

  it("plans note search for related-note requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "find related notes about VHDL timing",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared a note search for related context.",
      toolRequests: [{ tool: "search_notes", input: { query: "find related notes about VHDL timing", limit: 8 } }]
    });
  });

  it("plans source search for literature and datasheet requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "search sources for this FPGA datasheet timing claim",
        activePath: "Notes/FPGA.md"
      })
    ).toEqual({
      content: "Vaultseer prepared a source workspace search.",
      toolRequests: [
        { tool: "search_sources", input: { query: "search sources for this FPGA datasheet timing claim", limit: 8 } }
      ]
    });
  });

  it("plans semantic indexing for vectorization requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "chunk and vectorize my notes",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared the semantic indexing command.",
      toolRequests: [{ tool: "plan_semantic_index", input: null }]
    });
  });

  it("plans source extraction for PDF extraction requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "extract a PDF into a source workspace",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared the source extraction queue command.",
      toolRequests: [{ tool: "run_vaultseer_command", input: { commandId: "plan-source-extraction-queue" } }]
    });
  });

  it("does not invent actions for ordinary chat", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "hello",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: null,
      toolRequests: []
    });
  });
});
