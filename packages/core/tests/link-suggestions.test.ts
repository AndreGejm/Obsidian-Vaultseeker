import { describe, expect, it } from "vitest";
import { buildVaultSnapshot, suggestLinksForNote } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const noteInputs: NoteRecordInput[] = [
  {
    path: "Projects/Current.md",
    basename: "Current",
    content: "Current note links to [[Missing Note]] and [[Known Note]].",
    stat: { ctime: 1, mtime: 10, size: 100 },
    metadata: {
      frontmatter: { tags: ["project/vaultseer"] },
      tags: ["#project/vaultseer"],
      links: [
        { raw: "[[Missing Note]]", target: "Missing Note" },
        { raw: "[[Known Note]]", target: "Known Note" }
      ],
      headings: []
    }
  },
  {
    path: "References/The Missing Note.md",
    basename: "The Missing Note",
    content: "This note has an alias matching the broken link.",
    stat: { ctime: 2, mtime: 20, size: 100 },
    metadata: {
      frontmatter: { aliases: ["Missing Note"], tags: ["reference"] },
      tags: ["#reference"],
      aliases: ["Missing Note"],
      links: [],
      headings: []
    }
  },
  {
    path: "References/Known Note.md",
    basename: "Known Note",
    content: "This note is already linked.",
    stat: { ctime: 3, mtime: 30, size: 100 },
    metadata: {
      frontmatter: { tags: ["reference"] },
      tags: ["#reference"],
      links: [],
      headings: []
    }
  },
  {
    path: "References/Missing Memory.md",
    basename: "Missing Memory",
    content: "This weaker candidate shares one word.",
    stat: { ctime: 4, mtime: 40, size: 100 },
    metadata: {
      frontmatter: { tags: ["reference"] },
      tags: ["#reference"],
      links: [],
      headings: []
    }
  }
];

const snapshot = buildVaultSnapshot(noteInputs);
const currentNote = snapshot.notesByPath["Projects/Current.md"]!;

describe("suggestLinksForNote", () => {
  it("suggests replacement targets for unresolved links using alias evidence", () => {
    const suggestions = suggestLinksForNote({
      currentNote,
      notes: snapshot.notes,
      limit: 5
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        unresolvedTarget: "Missing Note",
        suggestedPath: "References/The Missing Note.md",
        evidence: expect.arrayContaining([
          { type: "unresolved_link", raw: "[[Missing Note]]", target: "Missing Note" },
          { type: "alias_match", alias: "Missing Note" }
        ]),
        reason: expect.stringContaining("alias Missing Note")
      })
    ]);
  });

  it("does not suggest resolved links or the current note itself", () => {
    const suggestions = suggestLinksForNote({
      currentNote,
      notes: snapshot.notes
    });

    expect(suggestions.map((suggestion) => suggestion.unresolvedTarget)).not.toContain("Known Note");
    expect(suggestions.map((suggestion) => suggestion.suggestedPath)).not.toContain(currentNote.path);
  });

  it("returns no suggestions when a note has no unresolved links", () => {
    expect(
      suggestLinksForNote({
        currentNote: snapshot.notesByPath["References/Known Note.md"]!,
        notes: snapshot.notes
      })
    ).toEqual([]);
  });
});
