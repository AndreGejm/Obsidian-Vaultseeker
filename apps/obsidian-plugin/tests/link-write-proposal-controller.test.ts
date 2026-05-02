import { describe, expect, it } from "vitest";
import { InMemoryVaultseerStore, type LinkSuggestion } from "@vaultseer/core";
import { stageNoteLinkUpdateProposal } from "../src/link-write-proposal-controller";

describe("stageNoteLinkUpdateProposal", () => {
  it("stores note link suggestion records and a preview-only guarded link update", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await stageNoteLinkUpdateProposal({
      store,
      targetPath: "Projects/Vaultseer Platform.md",
      currentContent: "# Vaultseer Platform\n\nConnects to [[Missing Note]].\n",
      linkSuggestions: [
        linkSuggestion({
          unresolvedTarget: "Missing Note",
          rawLink: "[[Missing Note]]",
          suggestedPath: "Literature/Actually Missing Note.md",
          suggestedTitle: "Actually Missing Note",
          confidence: 0.78,
          evidence: [
            { type: "unresolved_link", raw: "[[Missing Note]]", target: "Missing Note" },
            { type: "alias_match", alias: "Missing Note" }
          ]
        })
      ],
      now: () => "2026-05-01T23:00:00.000Z"
    });

    expect(summary).toMatchObject({
      status: "planned",
      targetPath: "Projects/Vaultseer Platform.md",
      suggestionCount: 1,
      operation: {
        type: "update_note_links",
        targetPath: "Projects/Vaultseer Platform.md",
        linkUpdate: {
          replacements: [
            {
              rawLink: "[[Missing Note]]",
              unresolvedTarget: "Missing Note",
              suggestedPath: "Literature/Actually Missing Note.md",
              replacement: "[[Literature/Actually Missing Note|Missing Note]]"
            }
          ]
        },
        suggestionIds: [
          "suggestion:note-link:Projects/Vaultseer Platform.md:Missing Note:Literature/Actually Missing Note.md"
        ]
      },
      message: "Staged 1 link suggestion for review. No note was changed."
    });
    await expect(store.getSuggestionRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "suggestion:note-link:Projects/Vaultseer Platform.md:Missing Note:Literature/Actually Missing Note.md",
        type: "note_link",
        targetPath: "Projects/Vaultseer Platform.md"
      })
    ]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([
      expect.objectContaining({
        type: "update_note_links",
        targetPath: "Projects/Vaultseer Platform.md",
        content: expect.stringContaining("[[Literature/Actually Missing Note|Missing Note]]")
      })
    ]);
  });

  it("skips staging when suggested unresolved links are no longer present in the current file", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await stageNoteLinkUpdateProposal({
      store,
      targetPath: "Projects/Vaultseer Platform.md",
      currentContent: "# Vaultseer Platform\n\nAlready links to [[Literature/Actually Missing Note]].\n",
      linkSuggestions: [linkSuggestion({ rawLink: "[[Missing Note]]", unresolvedTarget: "Missing Note" })],
      now: () => "2026-05-01T23:00:00.000Z"
    });

    expect(summary).toEqual({
      status: "skipped",
      targetPath: "Projects/Vaultseer Platform.md",
      suggestionCount: 1,
      operation: null,
      message: "The suggested unresolved links are not present in the current file."
    });
    await expect(store.getSuggestionRecords()).resolves.toEqual([]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([]);
  });

  it("skips storage when the before-commit guard reports stale state", async () => {
    const store = new InMemoryVaultseerStore();

    const summary = await stageNoteLinkUpdateProposal({
      store,
      targetPath: "Projects/Vaultseer Platform.md",
      currentContent: "# Vaultseer Platform\n\nConnects to [[Missing Note]].\n",
      linkSuggestions: [linkSuggestion({ rawLink: "[[Missing Note]]", unresolvedTarget: "Missing Note" })],
      now: () => "2026-05-01T23:00:00.000Z",
      beforeCommit: async () => false
    });

    expect(summary).toEqual({
      status: "skipped",
      targetPath: "Projects/Vaultseer Platform.md",
      suggestionCount: 1,
      operation: null,
      message: "The active note changed before staging could finish. Nothing was staged."
    });
    await expect(store.getSuggestionRecords()).resolves.toEqual([]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([]);
  });
});

function linkSuggestion(overrides: Partial<LinkSuggestion>): LinkSuggestion {
  return {
    unresolvedTarget: "Missing Note",
    rawLink: "[[Missing Note]]",
    suggestedPath: "Literature/Actually Missing Note.md",
    suggestedTitle: "Actually Missing Note",
    score: 58,
    confidence: 0.78,
    evidence: [],
    reason: "alias Missing Note",
    ...overrides
  };
}
