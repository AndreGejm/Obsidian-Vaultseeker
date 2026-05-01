import { describe, expect, it } from "vitest";
import { buildRelationshipGraph, buildVaultSnapshot, detectNoteQualityIssues, normalizeNoteRecord } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const noteInputs: NoteRecordInput[] = [
  {
    path: "Projects/Current.md",
    basename: "Current",
    content: "Current note links to [[Missing Note]] and [[Known Note]].",
    stat: { ctime: 1, mtime: 10, size: 100 },
    metadata: {
      frontmatter: {
        tags: ["project/vaultseer", "bad tag"],
        aliases: ["Research Note", "research note"]
      },
      tags: ["#project/vaultseer"],
      links: [
        { raw: "[[Missing Note]]", target: "Missing Note" },
        { raw: "[[Known Note]]", target: "Known Note" }
      ],
      headings: []
    }
  },
  {
    path: "References/Known Note.md",
    basename: "Known Note",
    content: "This note is linked.",
    stat: { ctime: 2, mtime: 20, size: 100 },
    metadata: {
      frontmatter: { tags: ["reference"] },
      tags: ["#reference"],
      links: [],
      headings: []
    }
  }
];

const snapshot = buildVaultSnapshot(noteInputs);
const graph = buildRelationshipGraph(snapshot);

describe("detectNoteQualityIssues", () => {
  it("reports duplicate aliases, malformed tags, and broken internal links with evidence", () => {
    const issues = detectNoteQualityIssues({
      currentNote: snapshot.notesByPath["Projects/Current.md"]!,
      graph
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "duplicate_alias:research note",
          kind: "duplicate_alias",
          severity: "low",
          evidence: expect.arrayContaining([
            { type: "alias_value", alias: "Research Note" },
            { type: "alias_value", alias: "research note" }
          ])
        }),
        expect.objectContaining({
          id: "malformed_tag:bad tag",
          kind: "malformed_tag",
          severity: "medium",
          evidence: [{ type: "tag_value", tag: "bad tag" }]
        }),
        expect.objectContaining({
          id: "broken_internal_link:Missing Note",
          kind: "broken_internal_link",
          severity: "medium",
          evidence: [{ type: "unresolved_link", raw: "[[Missing Note]]", target: "Missing Note" }]
        })
      ])
    );
  });

  it("reports missing frontmatter tags and empty titles", () => {
    const currentNote = normalizeNoteRecord({
      path: "Inbox/Untitled.md",
      basename: "",
      content: "",
      stat: { ctime: 1, mtime: 1, size: 0 },
      metadata: {
        frontmatter: {},
        links: [],
        headings: []
      }
    });

    expect(detectNoteQualityIssues({ currentNote })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing_frontmatter_field:tags",
          kind: "missing_frontmatter_field",
          severity: "low",
          message: "This note has no frontmatter tags field."
        }),
        expect.objectContaining({
          id: "empty_title",
          kind: "empty_title",
          severity: "medium",
          message: "This note has no usable title."
        })
      ])
    );
  });

  it("returns no issues for a clean note with a resolved link", () => {
    expect(
      detectNoteQualityIssues({
        currentNote: snapshot.notesByPath["References/Known Note.md"]!,
        graph
      })
    ).toEqual([]);
  });
});
