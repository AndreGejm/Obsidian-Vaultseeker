import { describe, expect, it, vi } from "vitest";
import {
  createVaultseerAgentToolRegistry,
  listVaultseerAgentToolDefinitions,
  toOpenAiFunctionTools
} from "../src/vaultseer-agent-tool-registry";

describe("Vaultseer agent tool registry", () => {
  it("exposes the native Vaultseer tools as provider-facing function definitions", () => {
    const definitions = listVaultseerAgentToolDefinitions();

    expect(definitions.map((definition) => definition.id)).toEqual([
      "inspect_current_note",
      "inspect_index_health",
      "inspect_current_note_chunks",
      "search_notes",
      "semantic_search_notes",
      "search_sources",
      "suggest_current_note_tags",
      "suggest_current_note_links",
      "inspect_note_quality",
      "list_current_note_proposals",
      "list_approved_scripts",
      "rebuild_note_index",
      "plan_semantic_index",
      "run_semantic_index_batch",
      "run_vaultseer_command",
      "run_approved_script",
      "stage_suggestion",
      "review_current_note_proposal"
    ]);
    expect(definitions.find((definition) => definition.id === "search_notes")).toMatchObject({
      safety: "read",
      requestClass: "read-only"
    });
    expect(definitions.find((definition) => definition.id === "stage_suggestion")).toMatchObject({
      safety: "active-note-proposal",
      requestClass: "proposal"
    });
    expect(definitions.find((definition) => definition.id === "list_approved_scripts")).toMatchObject({
      safety: "read",
      requestClass: "read-only"
    });
    expect(definitions.find((definition) => definition.id === "run_approved_script")).toMatchObject({
      safety: "approved-script",
      requestClass: "command",
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          scriptId: expect.objectContaining({ type: "string" }),
          input: expect.objectContaining({ type: "object" })
        }),
        required: ["scriptId"]
      })
    });
    expect(definitions.find((definition) => definition.id === "review_current_note_proposal")).toMatchObject({
      safety: "active-note-proposal",
      requestClass: "proposal",
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          decision: expect.objectContaining({ enum: ["approved", "deferred", "rejected"] }),
          apply: expect.objectContaining({ type: "boolean" })
        })
      })
    });

    const openAiTools = toOpenAiFunctionTools(definitions);
    expect(openAiTools).toContainEqual(
      expect.objectContaining({
        type: "function",
        name: "search_notes",
        parameters: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            query: expect.objectContaining({ type: "string" }),
            limit: expect.objectContaining({ type: "number" })
          })
        })
      })
    );
    expect(openAiTools.map((tool) => tool.name)).not.toContain("run_terminal");
    expect(openAiTools.map((tool) => tool.name)).not.toContain("execute_command");
    expect(openAiTools.map((tool) => tool.name)).not.toContain("write_file");
  });

  it("executes tools through the existing Vaultseer dispatcher and preserves proposal approval gates", async () => {
    const searchNotes = vi.fn(async () => ({ status: "ready", results: [] }));
    const stageSuggestion = vi.fn(async () => ({ status: "planned" }));
    const reviewCurrentNoteProposal = vi.fn(async () => ({ status: "applied" }));
    const listApprovedScripts = vi.fn(async () => [{ id: "normalize-frontmatter" }]);
    const runApprovedScript = vi.fn(async () => ({ status: "completed", scriptId: "normalize-frontmatter" }));
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes,
        searchSources: async () => ({ status: "ready", results: [] }),
        listApprovedScripts,
        runApprovedScript,
        stageSuggestion,
        reviewCurrentNoteProposal
      }
    });

    await expect(registry.execute("search_notes", { query: "resistor", limit: 3 })).resolves.toEqual({
      ok: true,
      tool: "search_notes",
      output: { status: "ready", results: [] }
    });
    expect(searchNotes).toHaveBeenCalledWith({ query: "resistor", limit: 3 });

    await expect(registry.execute("list_approved_scripts", null)).resolves.toEqual({
      ok: true,
      tool: "list_approved_scripts",
      output: [{ id: "normalize-frontmatter" }]
    });
    expect(listApprovedScripts).toHaveBeenCalledTimes(1);

    await expect(
      registry.execute("run_approved_script", { scriptId: "normalize-frontmatter", input: { targetPath: "Notes/A.md" } })
    ).resolves.toEqual({
      ok: true,
      tool: "run_approved_script",
      output: { status: "completed", scriptId: "normalize-frontmatter" }
    });
    expect(runApprovedScript).toHaveBeenCalledWith({
      scriptId: "normalize-frontmatter",
      input: { targetPath: "Notes/A.md" }
    });

    await expect(registry.execute("stage_suggestion", { kind: "rewrite", markdown: "# Draft" })).resolves.toMatchObject({
      ok: false,
      tool: "stage_suggestion",
      message: expect.stringContaining("requires explicit proposal approval")
    });
    expect(stageSuggestion).not.toHaveBeenCalled();

    await expect(
      registry.execute("stage_suggestion", { kind: "rewrite", markdown: "# Draft" }, { allowProposalTools: true })
    ).resolves.toEqual({
      ok: true,
      tool: "stage_suggestion",
      output: { status: "planned" }
    });
    expect(stageSuggestion).toHaveBeenCalledWith({ kind: "rewrite", markdown: "# Draft" });

    await expect(registry.execute("review_current_note_proposal", { apply: true })).resolves.toMatchObject({
      ok: false,
      tool: "review_current_note_proposal",
      message: expect.stringContaining("requires explicit proposal approval")
    });
    expect(reviewCurrentNoteProposal).not.toHaveBeenCalled();

    await expect(
      registry.execute("review_current_note_proposal", { apply: true }, { allowProposalTools: true })
    ).resolves.toEqual({
      ok: true,
      tool: "review_current_note_proposal",
      output: { status: "applied" }
    });
    expect(reviewCurrentNoteProposal).toHaveBeenCalledWith({ apply: true });
  });
});
