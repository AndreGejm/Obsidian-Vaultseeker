import { describe, expect, it } from "vitest";
import { buildVaultSnapshot, suggestTagsForNote } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const noteInputs: NoteRecordInput[] = [
  {
    path: "Projects/Current.md",
    basename: "Current",
    content: "Current note links to [[Sources/Paper]].",
    stat: { ctime: 1, mtime: 10, size: 100 },
    metadata: {
      frontmatter: { tags: ["project/vaultseer"] },
      tags: ["#project/vaultseer"],
      links: [{ raw: "[[Sources/Paper]]", target: "Sources/Paper" }],
      headings: []
    }
  },
  {
    path: "Sources/Paper.md",
    basename: "Paper",
    content: "Paper links back to [[Projects/Current]].",
    stat: { ctime: 2, mtime: 20, size: 100 },
    metadata: {
      frontmatter: { tags: ["ai/memory", "source/literature"] },
      tags: ["#ai/memory", "#source/literature"],
      links: [{ raw: "[[Projects/Current]]", target: "Projects/Current" }],
      headings: []
    }
  },
  {
    path: "Notes/Adjacent.md",
    basename: "Adjacent",
    content: "Adjacent memory note.",
    stat: { ctime: 3, mtime: 30, size: 100 },
    metadata: {
      frontmatter: { tags: ["ai/memory", "source/literature"] },
      tags: ["#ai/memory", "#source/literature"],
      links: [],
      headings: []
    }
  },
  {
    path: "Notes/Project Existing.md",
    basename: "Project Existing",
    content: "Already uses the project tag with another tag.",
    stat: { ctime: 4, mtime: 40, size: 100 },
    metadata: {
      frontmatter: { tags: ["project/vaultseer", "workflow/review"] },
      tags: ["#project/vaultseer", "#workflow/review"],
      links: [],
      headings: []
    }
  }
];

const snapshot = buildVaultSnapshot(noteInputs);
const currentNote = snapshot.notesByPath["Projects/Current.md"]!;

describe("suggestTagsForNote", () => {
  it("suggests existing vault tags from linked and backlink notes with evidence", () => {
    const suggestions = suggestTagsForNote({
      currentNote,
      notes: snapshot.notes,
      limit: 4
    });

    expect(suggestions[0]).toMatchObject({
      tag: "ai/memory",
      evidence: expect.arrayContaining([
        { type: "linked_note_tag", notePath: "Sources/Paper.md", tag: "ai/memory" },
        { type: "backlink_note_tag", notePath: "Sources/Paper.md", tag: "ai/memory" },
        { type: "tag_frequency", noteCount: 2 }
      ])
    });
    expect(suggestions.map((suggestion) => suggestion.tag)).not.toContain("project");
    expect(suggestions.map((suggestion) => suggestion.tag)).not.toContain("project/vaultseer");
  });

  it("uses current note co-tags to suggest companion tags from the vault vocabulary", () => {
    const suggestions = suggestTagsForNote({
      currentNote,
      notes: snapshot.notes,
      limit: 5
    });

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "workflow/review",
          evidence: expect.arrayContaining([
            { type: "co_tag", fromTag: "project/vaultseer", count: 1 }
          ])
        })
      ])
    );
  });

  it("returns no suggestions when every evidenced tag is already present", () => {
    const onlyCurrentVocabulary = buildVaultSnapshot([
      {
        path: "Only.md",
        basename: "Only",
        content: "Only note.",
        stat: { ctime: 1, mtime: 10, size: 10 },
        metadata: {
          frontmatter: { tags: ["known/tag"] },
          tags: ["#known/tag"],
          links: [],
          headings: []
        }
      }
    ]);

    expect(
      suggestTagsForNote({
        currentNote: onlyCurrentVocabulary.notesByPath["Only.md"]!,
        notes: onlyCurrentVocabulary.notes
      })
    ).toEqual([]);
  });
});
