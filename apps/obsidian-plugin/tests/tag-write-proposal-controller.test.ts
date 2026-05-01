import { describe, expect, it } from "vitest";
import { InMemoryVaultseerStore, type TagSuggestion } from "@vaultseer/core";
import { stageNoteTagUpdateProposal } from "../src/tag-write-proposal-controller";

describe("stageNoteTagUpdateProposal", () => {
  it("stores note tag suggestion records and a preview-only guarded tag update", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await stageNoteTagUpdateProposal({
      store,
      targetPath: "Literature/Mimisbrunnr Retrieval.md",
      currentContent: ["---", "tags:", "  - ai/memory", "---", "", "# Mimisbrunnr Retrieval", ""].join("\n"),
      tagSuggestions: [
        tagSuggestion({
          tag: "project/vaultseer",
          confidence: 0.72,
          evidence: [
            {
              type: "linked_note_tag",
              notePath: "Projects/Vaultseer Platform.md",
              tag: "project/vaultseer"
            }
          ]
        })
      ],
      now: () => "2026-05-01T22:00:00.000Z"
    });

    expect(summary).toMatchObject({
      status: "planned",
      targetPath: "Literature/Mimisbrunnr Retrieval.md",
      suggestionCount: 1,
      operation: {
        type: "update_note_tags",
        targetPath: "Literature/Mimisbrunnr Retrieval.md",
        tagUpdate: {
          beforeTags: ["ai/memory"],
          addedTags: ["project/vaultseer"],
          afterTags: ["ai/memory", "project/vaultseer"]
        },
        suggestionIds: ["suggestion:note-tag:Literature/Mimisbrunnr Retrieval.md:project/vaultseer"]
      },
      message: "Staged 1 tag suggestion for review. No note was changed."
    });
    await expect(store.getSuggestionRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "suggestion:note-tag:Literature/Mimisbrunnr Retrieval.md:project/vaultseer",
        type: "note_tag",
        targetPath: "Literature/Mimisbrunnr Retrieval.md"
      })
    ]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([
      expect.objectContaining({
        type: "update_note_tags",
        targetPath: "Literature/Mimisbrunnr Retrieval.md"
      })
    ]);
  });

  it("skips staging when suggested tags are already present in the current file", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await stageNoteTagUpdateProposal({
      store,
      targetPath: "Literature/Mimisbrunnr Retrieval.md",
      currentContent: ["---", "tags:", "  - ai/memory", "  - project/vaultseer", "---", "# Note"].join("\n"),
      tagSuggestions: [tagSuggestion({ tag: "project/vaultseer" })],
      now: () => "2026-05-01T22:00:00.000Z"
    });

    expect(summary).toEqual({
      status: "skipped",
      targetPath: "Literature/Mimisbrunnr Retrieval.md",
      suggestionCount: 1,
      operation: null,
      message: "The suggested tags are already present in the current file."
    });
    await expect(store.getSuggestionRecords()).resolves.toEqual([]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([]);
  });
});

function tagSuggestion(overrides: Partial<TagSuggestion>): TagSuggestion {
  return {
    tag: "project/vaultseer",
    score: 12,
    confidence: 0.72,
    evidence: [],
    reason: "linked note Projects/Vaultseer Platform.md",
    ...overrides
  };
}
