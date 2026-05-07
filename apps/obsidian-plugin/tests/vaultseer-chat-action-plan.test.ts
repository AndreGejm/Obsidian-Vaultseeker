import { describe, expect, it } from "vitest";
import {
  buildAssistantRequestedStageSuggestion,
  buildVaultseerChatActionPlan,
  extractLastAssistantMarkdownSuggestion,
  extractLastAssistantStageableMarkdownSuggestion
} from "../src/vaultseer-chat-action-plan";

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

  it("treats natural staging requests as active-note proposal work", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "stage it for review",
      activePath: "Notes/VHDL.md"
    });

    expect(plan.sendToCodex).toBeUndefined();
    expect(plan.content).toContain("Vaultseer is preparing an active-note proposal for review.");
    expect(plan.agentMessage).toContain("Create or refine the smallest useful active-note proposal");
    expect(plan.agentMessage).toContain("request stage_suggestion");
    expect(plan.agentMessage).toContain("Do not ask the user to run stage_suggestion");
    expect(plan.toolRequests.map((request) => request.tool)).toEqual([
      "inspect_current_note",
      "inspect_current_note_chunks",
      "inspect_note_quality",
      "search_notes"
    ]);
  });

  it("keeps natural staging requests inside Vaultseer when no note is active", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "stage it for review",
      activePath: null
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.toolRequests).toEqual([]);
    expect(plan.content).toContain("Open a note first");
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
    expect(plan.content).toContain("Vaultseer staged the previous draft.");
    expect(plan.content).toContain("Review the redline card below, then press Write to note.");
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

  it("extracts compact assistant markdown drafts when the fence starts inline", () => {
    expect(
      extractLastAssistantMarkdownSuggestion([
        {
          role: "assistant",
          content: [
            "Please run Vaultseer `stage_suggestion` with this content: ```markdown ---",
            "title: Resistor types 2",
            "tags:",
            "- electronics",
            "---",
            "# Resistor types 2",
            "",
            "A clearer note."
          ].join("\n") + "\n```"
        }
      ])
    ).toBe(["---", "title: Resistor types 2", "tags:", "- electronics", "---", "# Resistor types 2", "", "A clearer note."].join("\n"));
  });

  it("stages compact previous assistant drafts for explicit stage-suggestion requests", () => {
    const lastAssistantMarkdownSuggestion = extractLastAssistantMarkdownSuggestion([
      {
        role: "assistant",
        content: "Please run Vaultseer `stage_suggestion` using: ```markdown # Resistor types 2\n\nA cleaner active note.\n```"
      }
    ]);

    const plan = buildVaultseerChatActionPlan({
      message: "run vaultseer stage suggestion",
      activePath: "Electronics/Resistor types 2.md",
      lastAssistantMarkdownSuggestion
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.content).toContain("Vaultseer staged the previous draft.");
    expect(plan.content).toContain("Review the redline card below, then press Write to note.");
    expect(plan.autoStageToolRequests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Resistor types 2.md",
          markdown: "# Resistor types 2\n\nA cleaner active note.",
          reason: "User explicitly asked Vaultseer chat to write the previous assistant draft to the active note."
        }
      }
    ]);
  });

  it("treats a natural confirmation as approval to stage the previous assistant draft", () => {
    const lastAssistantStageableMarkdownSuggestion = extractLastAssistantStageableMarkdownSuggestion([
      {
        role: "assistant",
        content: [
          "Please run Vaultseer `stage_suggestion` with this draft:",
          "```markdown",
          "# Resistor types 2",
          "",
          "A cleaner active note.",
          "```"
        ].join("\n")
      }
    ]);

    const plan = buildVaultseerChatActionPlan({
      message: "yes, proceed",
      activePath: "Electronics/Resistor types 2.md",
      lastAssistantMarkdownSuggestion: "# Example\n\nThis is not used for the confirmation.",
      lastAssistantStageableMarkdownSuggestion
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.content).toContain("Vaultseer staged the previous draft.");
    expect(plan.content).toContain("Review the redline card below, then press Write to note.");
    expect(plan.autoStageToolRequests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Resistor types 2.md",
          markdown: "# Resistor types 2\n\nA cleaner active note.",
          reason: "User explicitly asked Vaultseer chat to write the previous assistant draft to the active note."
        }
      }
    ]);
  });

  it("stages a previous unfenced assistant note draft when the user asks to write it", () => {
    const lastAssistantStageableMarkdownSuggestion = extractLastAssistantStageableMarkdownSuggestion([
      {
        role: "assistant",
        content: [
          "Here is a useful first draft.",
          "",
          "# Ohm's law",
          "",
          "Ohm's law describes the relationship between voltage, current, and resistance.",
          "",
          "## Formula",
          "",
          "`V = I * R`",
          "",
          "If you want, I can stage this for review."
        ].join("\n")
      }
    ]);

    const plan = buildVaultseerChatActionPlan({
      message: "write this to the actual note",
      activePath: "Electronics/Ohm's law.md",
      lastAssistantStageableMarkdownSuggestion
    });

    expect(plan.sendToCodex).toBe(false);
    expect(plan.content).toContain("Vaultseer staged the previous draft.");
    expect(plan.autoStageToolRequests).toEqual([
      {
        tool: "stage_suggestion",
        input: {
          kind: "rewrite",
          targetPath: "Electronics/Ohm's law.md",
          markdown: [
            "# Ohm's law",
            "",
            "Ohm's law describes the relationship between voltage, current, and resistance.",
            "",
            "## Formula",
            "",
            "`V = I * R`"
          ].join("\n"),
          reason: "User explicitly asked Vaultseer chat to write the previous assistant draft to the active note."
        }
      }
    ]);
  });

  it("does not stage ordinary assistant Markdown examples from a vague confirmation", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "yes",
      activePath: "Electronics/Resistor types 2.md",
      lastAssistantMarkdownSuggestion: "# Example\n\nNot a proposed note rewrite."
    });

    expect(plan.autoStageToolRequests).toBeUndefined();
    expect(plan.sendToCodex).toBeUndefined();
  });

  it("builds an automatic guarded proposal when an assistant asks to run stage_suggestion with markdown", () => {
    expect(
      buildAssistantRequestedStageSuggestion({
        activePath: "Electronics/Resistor types 2.md",
        content: [
          "Please run Vaultseer `stage_suggestion` as a full current-note rewrite using:",
          "```markdown",
          "# Resistor types 2",
          "",
          "A cleaner active note.",
          "```"
        ].join("\n")
      })
    ).toEqual({
      tool: "stage_suggestion",
      input: {
        kind: "rewrite",
        targetPath: "Electronics/Resistor types 2.md",
        markdown: "# Resistor types 2\n\nA cleaner active note.",
        reason: "Assistant requested Vaultseer stage_suggestion for the active note."
      }
    });
  });

  it("does not auto-stage ordinary assistant markdown blocks", () => {
    expect(
      buildAssistantRequestedStageSuggestion({
        activePath: "Electronics/Resistor types 2.md",
        content: "Here is an example:\n```markdown\n# Example\n```"
      })
    ).toBeNull();
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

  it("treats active-note creation wording as a write-review proposal task", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "write a detailed note for Ohm's law",
      activePath: "Electronics/Ohm's law.md"
    });

    expect(plan.content).toContain("Vaultseer is preparing an active-note rewrite proposal.");
    expect(plan.agentMessage).toContain("request stage_suggestion with kind=rewrite");
    expect(plan.agentMessage).toContain("If liveNote.text is empty");
    expect(plan.agentMessage).toContain("Do not ask the user to run stage_suggestion");
    expect(plan.toolRequests.map((request) => request.tool)).toEqual([
      "inspect_current_note",
      "inspect_current_note_chunks",
      "inspect_note_quality",
      "search_notes"
    ]);
  });

  it("treats the common 'nore' typo as note creation wording", () => {
    const plan = buildVaultseerChatActionPlan({
      message: "write a detailed nore for Ohm's law",
      activePath: "Electronics/Ohm's law.md"
    });

    expect(plan.content).toContain("Vaultseer is preparing an active-note rewrite proposal.");
    expect(plan.agentMessage).toContain("If liveNote.text is empty");
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
      content: "Vaultseer prepared native PDF source extraction planning.",
      toolRequests: [
        { tool: "inspect_pdf_source_extraction_queue", input: null },
        { tool: "plan_pdf_source_extraction", input: null }
      ]
    });
  });

  it("plans a native PDF extraction batch for queued PDF processing requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "run one pdf extraction batch",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared one native PDF extraction batch.",
      toolRequests: [
        { tool: "inspect_pdf_source_extraction_queue", input: null },
        { tool: "run_pdf_source_extraction_batch", input: null }
      ]
    });
  });

  it("plans native source semantic indexing for source vectorization requests", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "vectorize extracted sources",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared native source semantic indexing.",
      toolRequests: [{ tool: "plan_source_semantic_index", input: null }]
    });
  });

  it("plans a native source semantic indexing batch for queued source embedding work", () => {
    expect(
      buildVaultseerChatActionPlan({
        message: "run source semantic indexing batch",
        activePath: "Notes/VHDL.md"
      })
    ).toEqual({
      content: "Vaultseer prepared one source semantic indexing batch.",
      toolRequests: [{ tool: "run_source_semantic_index_batch", input: null }]
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
