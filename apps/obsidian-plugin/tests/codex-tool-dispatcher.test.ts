import { describe, expect, it, vi } from "vitest";
import {
  dispatchCodexToolRequest,
  getCodexToolRequestClass,
  isAllowedCodexTool,
  isProposalCodexTool,
  isReadOnlyCodexTool,
  isRunnableCodexTool
} from "../src/codex-tool-dispatcher";

describe("dispatchCodexToolRequest", () => {
  it("exposes the Vaultseer Codex tool allowlist as a predicate", () => {
    expect(isAllowedCodexTool("inspect_current_note")).toBe(true);
    expect(isAllowedCodexTool("inspect_index_health")).toBe(true);
    expect(isAllowedCodexTool("inspect_current_note_chunks")).toBe(true);
    expect(isAllowedCodexTool("search_notes")).toBe(true);
    expect(isAllowedCodexTool("semantic_search_notes")).toBe(true);
    expect(isAllowedCodexTool("search_sources")).toBe(true);
    expect(isAllowedCodexTool("inspect_pdf_source_extraction_queue")).toBe(true);
    expect(isAllowedCodexTool("list_vault_images")).toBe(true);
    expect(isAllowedCodexTool("suggest_current_note_tags")).toBe(true);
    expect(isAllowedCodexTool("suggest_current_note_links")).toBe(true);
    expect(isAllowedCodexTool("inspect_note_quality")).toBe(true);
    expect(isAllowedCodexTool("list_current_note_proposals")).toBe(true);
    expect(isAllowedCodexTool("list_approved_scripts")).toBe(false);
    expect(isAllowedCodexTool("rebuild_note_index")).toBe(true);
    expect(isAllowedCodexTool("plan_semantic_index")).toBe(true);
    expect(isAllowedCodexTool("run_semantic_index_batch")).toBe(true);
    expect(isAllowedCodexTool("import_vault_text_source")).toBe(true);
    expect(isAllowedCodexTool("plan_pdf_source_extraction")).toBe(true);
    expect(isAllowedCodexTool("run_pdf_source_extraction_batch")).toBe(true);
    expect(isAllowedCodexTool("plan_source_semantic_index")).toBe(true);
    expect(isAllowedCodexTool("run_source_semantic_index_batch")).toBe(true);
    expect(isAllowedCodexTool("run_vaultseer_command")).toBe(true);
    expect(isAllowedCodexTool("run_approved_script")).toBe(false);
    expect(isAllowedCodexTool("stage_suggestion")).toBe(true);
    expect(isAllowedCodexTool("review_current_note_proposal")).toBe(true);
    expect(isAllowedCodexTool("write_file")).toBe(false);
    expect(isAllowedCodexTool("run_terminal")).toBe(false);
    expect(isAllowedCodexTool("execute_command")).toBe(false);
  });

  it("classifies read-only and proposal tools separately", () => {
    expect(isReadOnlyCodexTool("inspect_current_note")).toBe(true);
    expect(isReadOnlyCodexTool("inspect_index_health")).toBe(true);
    expect(isReadOnlyCodexTool("inspect_current_note_chunks")).toBe(true);
    expect(isReadOnlyCodexTool("search_notes")).toBe(true);
    expect(isReadOnlyCodexTool("semantic_search_notes")).toBe(true);
    expect(isReadOnlyCodexTool("search_sources")).toBe(true);
    expect(isReadOnlyCodexTool("inspect_pdf_source_extraction_queue")).toBe(true);
    expect(isReadOnlyCodexTool("list_vault_images")).toBe(true);
    expect(isReadOnlyCodexTool("suggest_current_note_tags")).toBe(true);
    expect(isReadOnlyCodexTool("suggest_current_note_links")).toBe(true);
    expect(isReadOnlyCodexTool("inspect_note_quality")).toBe(true);
    expect(isReadOnlyCodexTool("list_current_note_proposals")).toBe(true);
    expect(isReadOnlyCodexTool("list_approved_scripts")).toBe(false);
    expect(isReadOnlyCodexTool("rebuild_note_index")).toBe(false);
    expect(isReadOnlyCodexTool("plan_semantic_index")).toBe(false);
    expect(isReadOnlyCodexTool("run_semantic_index_batch")).toBe(false);
    expect(isReadOnlyCodexTool("import_vault_text_source")).toBe(false);
    expect(isReadOnlyCodexTool("plan_pdf_source_extraction")).toBe(false);
    expect(isReadOnlyCodexTool("run_pdf_source_extraction_batch")).toBe(false);
    expect(isReadOnlyCodexTool("plan_source_semantic_index")).toBe(false);
    expect(isReadOnlyCodexTool("run_source_semantic_index_batch")).toBe(false);
    expect(isReadOnlyCodexTool("run_vaultseer_command")).toBe(false);
    expect(isReadOnlyCodexTool("stage_suggestion")).toBe(false);
    expect(isReadOnlyCodexTool("review_current_note_proposal")).toBe(false);
    expect(isReadOnlyCodexTool("write_file")).toBe(false);

    expect(isProposalCodexTool("stage_suggestion")).toBe(true);
    expect(isProposalCodexTool("review_current_note_proposal")).toBe(true);
    expect(isProposalCodexTool("search_notes")).toBe(false);
    expect(getCodexToolRequestClass("search_notes")).toBe("read-only");
    expect(getCodexToolRequestClass("semantic_search_notes")).toBe("read-only");
    expect(getCodexToolRequestClass("inspect_pdf_source_extraction_queue")).toBe("read-only");
    expect(getCodexToolRequestClass("list_vault_images")).toBe("read-only");
    expect(getCodexToolRequestClass("list_current_note_proposals")).toBe("read-only");
    expect(getCodexToolRequestClass("list_approved_scripts")).toBeNull();
    expect(getCodexToolRequestClass("rebuild_note_index")).toBe("command");
    expect(getCodexToolRequestClass("plan_semantic_index")).toBe("command");
    expect(getCodexToolRequestClass("run_semantic_index_batch")).toBe("command");
    expect(getCodexToolRequestClass("import_vault_text_source")).toBe("command");
    expect(getCodexToolRequestClass("plan_pdf_source_extraction")).toBe("command");
    expect(getCodexToolRequestClass("run_pdf_source_extraction_batch")).toBe("command");
    expect(getCodexToolRequestClass("plan_source_semantic_index")).toBe("command");
    expect(getCodexToolRequestClass("run_source_semantic_index_batch")).toBe("command");
    expect(getCodexToolRequestClass("run_vaultseer_command")).toBe("command");
    expect(getCodexToolRequestClass("run_approved_script")).toBeNull();
    expect(getCodexToolRequestClass("stage_suggestion")).toBe("proposal");
    expect(getCodexToolRequestClass("review_current_note_proposal")).toBe("proposal");
    expect(getCodexToolRequestClass("write_file")).toBeNull();
  });

  it("treats read-only and Vaultseer command requests as runnable chat actions", () => {
    expect(isRunnableCodexTool("inspect_current_note")).toBe(true);
    expect(isRunnableCodexTool("inspect_index_health")).toBe(true);
    expect(isRunnableCodexTool("inspect_current_note_chunks")).toBe(true);
    expect(isRunnableCodexTool("search_notes")).toBe(true);
    expect(isRunnableCodexTool("semantic_search_notes")).toBe(true);
    expect(isRunnableCodexTool("search_sources")).toBe(true);
    expect(isRunnableCodexTool("inspect_pdf_source_extraction_queue")).toBe(true);
    expect(isRunnableCodexTool("list_vault_images")).toBe(true);
    expect(isRunnableCodexTool("suggest_current_note_tags")).toBe(true);
    expect(isRunnableCodexTool("suggest_current_note_links")).toBe(true);
    expect(isRunnableCodexTool("inspect_note_quality")).toBe(true);
    expect(isRunnableCodexTool("list_current_note_proposals")).toBe(true);
    expect(isRunnableCodexTool("list_approved_scripts")).toBe(false);
    expect(isRunnableCodexTool("rebuild_note_index")).toBe(true);
    expect(isRunnableCodexTool("plan_semantic_index")).toBe(true);
    expect(isRunnableCodexTool("run_semantic_index_batch")).toBe(true);
    expect(isRunnableCodexTool("import_vault_text_source")).toBe(true);
    expect(isRunnableCodexTool("plan_pdf_source_extraction")).toBe(true);
    expect(isRunnableCodexTool("run_pdf_source_extraction_batch")).toBe(true);
    expect(isRunnableCodexTool("plan_source_semantic_index")).toBe(true);
    expect(isRunnableCodexTool("run_source_semantic_index_batch")).toBe(true);
    expect(isRunnableCodexTool("run_vaultseer_command")).toBe(true);
    expect(isRunnableCodexTool("run_approved_script")).toBe(false);
    expect(isRunnableCodexTool("stage_suggestion")).toBe(false);
    expect(isRunnableCodexTool("review_current_note_proposal")).toBe(false);
    expect(isRunnableCodexTool("write_file")).toBe(false);
  });

  it("delegates approved Vaultseer command requests", async () => {
    const runVaultseerCommand = vi.fn(async () => ({ message: "Ran command." }));

    const result = await dispatchCodexToolRequest({
      request: { tool: "run_vaultseer_command", input: { commandId: "search-index" } },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        runVaultseerCommand,
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result).toEqual({
      ok: true,
      tool: "run_vaultseer_command",
      output: { message: "Ran command." }
    });
    expect(runVaultseerCommand).toHaveBeenCalledWith({ commandId: "search-index" });
  });

  it("does not expose approved scripts as Codex chat tools", async () => {
    const listApprovedScripts = vi.fn(async () => [{ id: "normalize-frontmatter", title: "Normalize frontmatter" }]);
    const runApprovedScript = vi.fn(async () => ({
      status: "completed",
      scriptId: "normalize-frontmatter",
      output: { proposalCount: 1 }
    }));

    const tools = {
      inspectCurrentNote: async () => ({ status: "ready" }),
      searchNotes: async () => [],
      searchSources: async () => [],
      listApprovedScripts,
      runApprovedScript,
      stageSuggestion: async () => ({ staged: true })
    };

    await expect(
      dispatchCodexToolRequest({ request: { tool: "list_approved_scripts", input: null }, tools })
    ).resolves.toEqual({
      ok: false,
      tool: "list_approved_scripts",
      message: "Codex tool 'list_approved_scripts' is not allowed by Vaultseer."
    });
    expect(listApprovedScripts).not.toHaveBeenCalled();

    await expect(
      dispatchCodexToolRequest({
        request: {
          tool: "run_approved_script",
          input: { scriptId: "normalize-frontmatter", input: { targetPath: "Electronics/Resistors.md" } }
        },
        tools
      })
    ).resolves.toEqual({
      ok: false,
      tool: "run_approved_script",
      message: "Codex tool 'run_approved_script' is not allowed by Vaultseer."
    });
    expect(runApprovedScript).not.toHaveBeenCalled();
  });

  it("delegates native Vaultseer command tools without using the generic command escape hatch", async () => {
    const rebuildNoteIndex = vi.fn(async () => ({ message: "Indexed 2 notes." }));
    const planSemanticIndex = vi.fn(async () => ({ queuedJobCount: 4 }));
    const runSemanticIndexBatch = vi.fn(async () => ({ claimed: 2, completed: 2, failed: 0 }));
    const importVaultTextSource = vi.fn(async () => ({
      status: "extracted",
      sourcePath: "Sources/timer.vhd",
      chunkCount: 2
    }));
    const planPdfSourceExtraction = vi.fn(async () => ({ plannedJobCount: 1 }));
    const runPdfSourceExtractionBatch = vi.fn(async () => ({ claimed: 1, completed: 1, failed: 0 }));
    const planSourceSemanticIndex = vi.fn(async () => ({ queuedJobCount: 3 }));
    const runSourceSemanticIndexBatch = vi.fn(async () => ({ claimed: 3, completed: 3, failed: 0 }));

    const tools = {
      inspectCurrentNote: async () => ({ status: "ready" }),
      searchNotes: async () => [],
      searchSources: async () => [],
      rebuildNoteIndex,
      planSemanticIndex,
      runSemanticIndexBatch,
      importVaultTextSource,
      planPdfSourceExtraction,
      runPdfSourceExtractionBatch,
      planSourceSemanticIndex,
      runSourceSemanticIndexBatch,
      stageSuggestion: async () => ({ staged: true })
    };

    await expect(
      dispatchCodexToolRequest({ request: { tool: "rebuild_note_index", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "rebuild_note_index",
      output: { message: "Indexed 2 notes." }
    });
    await expect(
      dispatchCodexToolRequest({ request: { tool: "plan_semantic_index", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "plan_semantic_index",
      output: { queuedJobCount: 4 }
    });
    await expect(
      dispatchCodexToolRequest({ request: { tool: "run_semantic_index_batch", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "run_semantic_index_batch",
      output: { claimed: 2, completed: 2, failed: 0 }
    });
    await expect(
      dispatchCodexToolRequest({
        request: { tool: "import_vault_text_source", input: { path: "Sources/timer.vhd" } },
        tools
      })
    ).resolves.toEqual({
      ok: true,
      tool: "import_vault_text_source",
      output: {
        status: "extracted",
        sourcePath: "Sources/timer.vhd",
        chunkCount: 2
      }
    });
    expect(importVaultTextSource).toHaveBeenCalledWith({ path: "Sources/timer.vhd" });
    await expect(
      dispatchCodexToolRequest({ request: { tool: "plan_pdf_source_extraction", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "plan_pdf_source_extraction",
      output: { plannedJobCount: 1 }
    });
    await expect(
      dispatchCodexToolRequest({ request: { tool: "run_pdf_source_extraction_batch", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "run_pdf_source_extraction_batch",
      output: { claimed: 1, completed: 1, failed: 0 }
    });
    await expect(
      dispatchCodexToolRequest({ request: { tool: "plan_source_semantic_index", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "plan_source_semantic_index",
      output: { queuedJobCount: 3 }
    });
    await expect(
      dispatchCodexToolRequest({ request: { tool: "run_source_semantic_index_batch", input: null }, tools })
    ).resolves.toEqual({
      ok: true,
      tool: "run_source_semantic_index_batch",
      output: { claimed: 3, completed: 3, failed: 0 }
    });
  });

  it.each([
    {
      tool: "inspect_current_note",
      input: { query: "ignored" },
      implementation: "inspectCurrentNote",
      output: { status: "ready", title: "VHDL" },
      expectedArguments: []
    },
    {
      tool: "inspect_index_health",
      input: null,
      implementation: "inspectIndexHealth",
      output: { status: "ready", noteCount: 2 },
      expectedArguments: []
    },
    {
      tool: "inspect_current_note_chunks",
      input: { limit: 3 },
      implementation: "inspectCurrentNoteChunks",
      output: { chunkCount: 3 },
      expectedArguments: [{ limit: 3 }]
    },
    {
      tool: "search_notes",
      input: { query: "vhdl timing" },
      implementation: "searchNotes",
      output: [{ title: "VHDL" }],
      expectedArguments: [{ query: "vhdl timing" }]
    },
    {
      tool: "semantic_search_notes",
      input: { query: "adjacent timing topics" },
      implementation: "semanticSearchNotes",
      output: { status: "ready", results: [] },
      expectedArguments: [{ query: "adjacent timing topics" }]
    },
    {
      tool: "search_sources",
      input: { query: "datasheet" },
      implementation: "searchSources",
      output: [{ title: "FPGA Datasheet" }],
      expectedArguments: [{ query: "datasheet" }]
    },
    {
      tool: "inspect_pdf_source_extraction_queue",
      input: null,
      implementation: "inspectPdfSourceExtractionQueue",
      output: { status: "ready", queuedJobCount: 2 },
      expectedArguments: []
    },
    {
      tool: "list_vault_images",
      input: { query: "resistor", limit: 3 },
      implementation: "listVaultImages",
      output: { status: "ready", images: [] },
      expectedArguments: [{ query: "resistor", limit: 3 }]
    },
    {
      tool: "suggest_current_note_tags",
      input: null,
      implementation: "suggestCurrentNoteTags",
      output: { suggestions: [{ tag: "vhdl/timing" }] },
      expectedArguments: []
    },
    {
      tool: "suggest_current_note_links",
      input: null,
      implementation: "suggestCurrentNoteLinks",
      output: { suggestions: [{ suggestedPath: "Notes/Timing.md" }] },
      expectedArguments: []
    },
    {
      tool: "inspect_note_quality",
      input: null,
      implementation: "inspectNoteQuality",
      output: { issues: [] },
      expectedArguments: []
    },
    {
      tool: "list_current_note_proposals",
      input: null,
      implementation: "listCurrentNoteProposals",
      output: { status: "ready", cards: [] },
      expectedArguments: []
    },
  ] as const)("allows $tool and delegates to $implementation", async (scenario) => {
    const tools = {
      inspectCurrentNote: vi.fn(async () => (scenario.implementation === "inspectCurrentNote" ? scenario.output : null)),
      inspectIndexHealth: vi.fn(async () => (scenario.implementation === "inspectIndexHealth" ? scenario.output : null)),
      inspectCurrentNoteChunks: vi.fn(async () => (scenario.implementation === "inspectCurrentNoteChunks" ? scenario.output : null)),
      searchNotes: vi.fn(async () => (scenario.implementation === "searchNotes" ? scenario.output : [])),
      semanticSearchNotes: vi.fn(async () => (scenario.implementation === "semanticSearchNotes" ? scenario.output : [])),
      searchSources: vi.fn(async () => (scenario.implementation === "searchSources" ? scenario.output : [])),
      inspectPdfSourceExtractionQueue: vi.fn(async () =>
        scenario.implementation === "inspectPdfSourceExtractionQueue" ? scenario.output : []
      ),
      listVaultImages: vi.fn(async () => (scenario.implementation === "listVaultImages" ? scenario.output : [])),
      suggestCurrentNoteTags: vi.fn(async () => (scenario.implementation === "suggestCurrentNoteTags" ? scenario.output : [])),
      suggestCurrentNoteLinks: vi.fn(async () => (scenario.implementation === "suggestCurrentNoteLinks" ? scenario.output : [])),
      inspectNoteQuality: vi.fn(async () => (scenario.implementation === "inspectNoteQuality" ? scenario.output : [])),
      listCurrentNoteProposals: vi.fn(async () => (scenario.implementation === "listCurrentNoteProposals" ? scenario.output : [])),
      stageSuggestion: vi.fn(async () => (scenario.implementation === "stageSuggestion" ? scenario.output : { staged: false }))
    };

    const result = await dispatchCodexToolRequest({
      request: { tool: scenario.tool, input: scenario.input },
      tools
    });

    expect(result).toEqual({ ok: true, tool: scenario.tool, output: scenario.output });
    expect(tools[scenario.implementation]).toHaveBeenCalledTimes(1);
    expect(tools[scenario.implementation]).toHaveBeenCalledWith(...scenario.expectedArguments);
  });

  it("lets the autonomous agent stage proposals but requires explicit approval authority before review/apply", async () => {
    const tools = {
      inspectCurrentNote: vi.fn(async () => ({ status: "ready" })),
      searchNotes: vi.fn(async () => []),
      searchSources: vi.fn(async () => []),
      stageSuggestion: vi.fn(async () => ({ staged: true })),
      reviewCurrentNoteProposal: vi.fn(async () => ({ status: "applied" }))
    };

    const rejected = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", value: "vhdl" } },
      tools
    });

    expect(rejected.ok).toBe(false);
    expect(rejected.tool).toBe("stage_suggestion");
    expect(rejected.message).toContain("requires explicit proposal approval");
    expect(tools.stageSuggestion).not.toHaveBeenCalled();

    const allowed = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", value: "vhdl" } },
      tools,
      allowProposalTools: true
    });

    expect(allowed).toEqual({ ok: true, tool: "stage_suggestion", output: { staged: true } });
    expect(tools.stageSuggestion).toHaveBeenCalledWith({ kind: "tag", value: "vhdl" });

    const rejectedReview = await dispatchCodexToolRequest({
      request: { tool: "review_current_note_proposal", input: { apply: true } },
      tools
    });

    expect(rejectedReview.ok).toBe(false);
    expect(rejectedReview.tool).toBe("review_current_note_proposal");
    expect(rejectedReview.message).toContain("requires explicit user approval");
    expect(tools.reviewCurrentNoteProposal).not.toHaveBeenCalled();

    const rejectedAutonomousReview = await dispatchCodexToolRequest({
      request: { tool: "review_current_note_proposal", input: { apply: true } },
      tools,
      allowProposalTools: true
    });

    expect(rejectedAutonomousReview.ok).toBe(false);
    expect(rejectedAutonomousReview.tool).toBe("review_current_note_proposal");
    expect(rejectedAutonomousReview.message).toContain("requires explicit user approval");
    expect(tools.reviewCurrentNoteProposal).not.toHaveBeenCalled();

    const allowedReview = await dispatchCodexToolRequest({
      request: { tool: "review_current_note_proposal", input: { apply: true } },
      tools,
      allowProposalReviewTools: true
    });

    expect(allowedReview).toEqual({
      ok: true,
      tool: "review_current_note_proposal",
      output: { status: "applied" }
    });
    expect(tools.reviewCurrentNoteProposal).toHaveBeenCalledWith({ apply: true });
  });

  it("returns a failed result when an allowed native tool has not been wired", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "semantic_search_notes", input: { query: "timing" } },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("semantic_search_notes");
    expect(result.message).toContain("not available");
  });

  it("forwards proposal freshness context only when proposals are explicitly allowed", async () => {
    const beforeProposalCommit = vi.fn(() => true);
    const tools = {
      inspectCurrentNote: vi.fn(async () => ({ status: "ready" })),
      searchNotes: vi.fn(async () => []),
      searchSources: vi.fn(async () => []),
      stageSuggestion: vi.fn(async () => ({ staged: true }))
    };

    await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } },
      tools,
      beforeProposalCommit
    });

    expect(tools.stageSuggestion).not.toHaveBeenCalled();

    const allowed = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag", tags: ["vhdl/timing"] } },
      tools,
      allowProposalTools: true,
      beforeProposalCommit
    });

    expect(allowed).toEqual({ ok: true, tool: "stage_suggestion", output: { staged: true } });
    expect(tools.stageSuggestion).toHaveBeenCalledWith(
      { kind: "tag", tags: ["vhdl/timing"] },
      { beforeProposalCommit }
    );

    tools.stageSuggestion.mockClear();

    const reviewCurrentNoteProposal = vi.fn(async () => ({ status: "applied" }));
    const reviewTools = {
      ...tools,
      reviewCurrentNoteProposal
    };
    const autonomousReviewBlocked = await dispatchCodexToolRequest({
      request: { tool: "review_current_note_proposal", input: { apply: true } },
      tools: reviewTools,
      allowProposalTools: true,
      beforeProposalCommit
    });

    expect(autonomousReviewBlocked.ok).toBe(false);
    expect(autonomousReviewBlocked.tool).toBe("review_current_note_proposal");
    expect(autonomousReviewBlocked.message).toContain("requires explicit user approval");
    expect(reviewCurrentNoteProposal).not.toHaveBeenCalled();

    const reviewAllowed = await dispatchCodexToolRequest({
      request: { tool: "review_current_note_proposal", input: { apply: true } },
      tools: reviewTools,
      allowProposalReviewTools: true,
      beforeProposalCommit
    });

    expect(reviewAllowed).toEqual({
      ok: true,
      tool: "review_current_note_proposal",
      output: { status: "applied" }
    });
    expect(reviewCurrentNoteProposal).toHaveBeenCalledWith({ apply: true }, { beforeProposalCommit });
  });

  it.each(["write_file", "unknown_tool", "list_approved_scripts", "run_approved_script"])(
    "rejects disallowed tool %s",
    async (tool) => {
    const result = await dispatchCodexToolRequest({
      request: { tool, input: {} },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe(tool);
    expect(result.message).toContain("not allowed");
    }
  );

  it("returns a failed result when an allowed implementation throws an Error", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "search_notes", input: { query: "vhdl" } },
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => {
          throw new Error("search unavailable");
        },
        searchSources: async () => [],
        stageSuggestion: async () => ({ staged: true })
      }
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("search_notes");
    expect(result.message).toContain("search unavailable");
  });

  it("returns a fallback failed result when an allowed implementation throws a non-Error", async () => {
    const result = await dispatchCodexToolRequest({
      request: { tool: "stage_suggestion", input: { kind: "tag" } },
      allowProposalTools: true,
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => [],
        searchSources: async () => [],
        stageSuggestion: async () => {
          throw "offline";
        }
      }
    });

    expect(result).toEqual({
      ok: false,
      tool: "stage_suggestion",
      message: "Codex tool 'stage_suggestion' failed."
    });
  });
});
