import { describe, expect, it, vi } from "vitest";
import type { CodexToolImplementations } from "../src/codex-tool-dispatcher";
import {
  BUILT_IN_APPROVED_SCRIPT_DEFINITIONS,
  createBuiltInApprovedScriptHandlers,
  mergeApprovedScriptDefinitions
} from "../src/approved-script-builtins";

function tools(overrides: Partial<CodexToolImplementations> = {}): CodexToolImplementations {
  return {
    inspectCurrentNote: async () => ({ status: "ready", note: { path: "Notes/Test.md" } }),
    inspectIndexHealth: async () => ({ status: "ready" }),
    inspectCurrentNoteChunks: async () => ({ status: "ready", chunks: [] }),
    searchNotes: async () => ({ status: "ready", results: [] }),
    searchSources: async () => ({ status: "ready", results: [] }),
    suggestCurrentNoteTags: async () => ({ status: "ready", suggestions: [] }),
    suggestCurrentNoteLinks: async () => ({ status: "ready", suggestions: [] }),
    inspectNoteQuality: async () => ({ status: "ready", issues: [] }),
    listCurrentNoteProposals: async () => ({ status: "ready", cards: [] }),
    stageSuggestion: async () => ({ status: "planned" }),
    ...overrides
  };
}

describe("approved script built-ins", () => {
  it("ships only Vaultseer-owned note-management scripts", () => {
    expect(BUILT_IN_APPROVED_SCRIPT_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "review-active-note",
      "stage-active-note-rewrite",
      "stage-active-note-tags",
      "stage-active-note-links"
    ]);
    expect(BUILT_IN_APPROVED_SCRIPT_DEFINITIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ permission: "read-only", scope: "active-note" }),
        expect.objectContaining({ permission: "active-note-proposal", scope: "active-note" })
      ])
    );
  });

  it("merges user-safe manifest entries while allowing built-ins to be disabled", () => {
    const definitions = mergeApprovedScriptDefinitions([
      {
        id: "stage-active-note-rewrite",
        title: "Rewrite current note",
        description: "Disabled for this vault.",
        scope: "active-note",
        permission: "active-note-proposal",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        enabled: false,
        timeoutSeconds: 10
      },
      {
        id: "custom-report",
        title: "Custom report",
        description: "A future trusted handler can implement this.",
        scope: "vault-read",
        permission: "read-only",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        enabled: true,
        timeoutSeconds: 10
      }
    ]);

    expect(definitions.find((definition) => definition.id === "stage-active-note-rewrite")?.enabled).toBe(false);
    expect(definitions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "custom-report" })]));
  });

  it("runs active-note review by composing existing Vaultseer tools", async () => {
    const inspectCurrentNote = vi.fn(async () => ({ status: "ready", note: { title: "Resistors" } }));
    const inspectNoteQuality = vi.fn(async () => ({ status: "ready", issues: [] }));
    const suggestCurrentNoteTags = vi.fn(async () => ({ status: "ready", suggestions: [{ tag: "electronics" }] }));
    const handlers = createBuiltInApprovedScriptHandlers(() =>
      tools({
        inspectCurrentNote,
        inspectNoteQuality,
        suggestCurrentNoteTags
      })
    );

    await expect(
      handlers["review-active-note"]?.({
        definition: BUILT_IN_APPROVED_SCRIPT_DEFINITIONS[0],
        input: {}
      })
    ).resolves.toMatchObject({
      status: "completed",
      scriptId: "review-active-note",
      output: {
        currentNote: { status: "ready", note: { title: "Resistors" } },
        quality: { status: "ready", issues: [] },
        tags: { status: "ready", suggestions: [{ tag: "electronics" }] }
      }
    });
    expect(inspectCurrentNote).toHaveBeenCalledOnce();
    expect(inspectNoteQuality).toHaveBeenCalledOnce();
    expect(suggestCurrentNoteTags).toHaveBeenCalledOnce();
  });

  it("stages active-note rewrite through the existing guarded proposal tool", async () => {
    const stageSuggestion = vi.fn(async () => ({ status: "planned", targetPath: "Notes/Test.md" }));
    const handlers = createBuiltInApprovedScriptHandlers(() => tools({ stageSuggestion }));

    await expect(
      handlers["stage-active-note-rewrite"]?.({
        definition: BUILT_IN_APPROVED_SCRIPT_DEFINITIONS[1],
        input: { markdown: "# Test\n", reason: "Make it readable." }
      })
    ).resolves.toMatchObject({
      status: "completed",
      scriptId: "stage-active-note-rewrite",
      output: { status: "planned", targetPath: "Notes/Test.md" }
    });
    expect(stageSuggestion).toHaveBeenCalledWith({
      kind: "rewrite",
      markdown: "# Test\n",
      reason: "Make it readable."
    });
  });

  it("rejects malformed built-in rewrite inputs before staging anything", async () => {
    const stageSuggestion = vi.fn(async () => ({ status: "planned" }));
    const handlers = createBuiltInApprovedScriptHandlers(() => tools({ stageSuggestion }));

    await expect(
      handlers["stage-active-note-rewrite"]?.({
        definition: BUILT_IN_APPROVED_SCRIPT_DEFINITIONS[1],
        input: { markdown: "   " }
      })
    ).rejects.toThrow("markdown");
    expect(stageSuggestion).not.toHaveBeenCalled();
  });
});
