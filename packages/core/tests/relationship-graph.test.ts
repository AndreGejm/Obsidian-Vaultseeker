import { describe, expect, it } from "vitest";
import { buildRelationshipGraph, buildVaultSnapshot } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const notes: NoteRecordInput[] = [
  {
    path: "Index.md",
    basename: "Index",
    content: "Index links to [[Literature/Ragnarok]] and [[Missing Note]].",
    stat: { ctime: 1, mtime: 10, size: 100 },
    metadata: {
      frontmatter: { tags: ["map"] },
      tags: ["#map"],
      links: [
        { raw: "[[Literature/Ragnarok]]", target: "Literature/Ragnarok" },
        { raw: "[[Missing Note]]", target: "Missing Note" }
      ],
      headings: []
    }
  },
  {
    path: "Literature/Ragnarok.md",
    basename: "Ragnarok",
    content: "Ragnarok links to [[Permanent/Viking Cosmology#World Tree]].",
    stat: { ctime: 2, mtime: 20, size: 200 },
    metadata: {
      frontmatter: { tags: ["myth/norse", "source/literature"] },
      tags: ["#myth/norse", "#source/literature"],
      links: [{ raw: "[[Permanent/Viking Cosmology#World Tree]]", target: "Permanent/Viking Cosmology", heading: "World Tree" }],
      headings: []
    }
  },
  {
    path: "Permanent/Viking Cosmology.md",
    basename: "Viking Cosmology",
    content: "Cosmology.",
    stat: { ctime: 3, mtime: 30, size: 300 },
    metadata: {
      frontmatter: { tags: ["myth/norse", "permanent"] },
      tags: ["#myth/norse", "#permanent"],
      links: [],
      headings: []
    }
  },
  {
    path: "Loose.md",
    basename: "Loose",
    content: "Loose note.",
    stat: { ctime: 4, mtime: 40, size: 400 },
    metadata: {
      frontmatter: {},
      tags: [],
      links: [],
      headings: []
    }
  },
  {
    path: "Tagged Only.md",
    basename: "Tagged Only",
    content: "Tagged but isolated.",
    stat: { ctime: 5, mtime: 50, size: 500 },
    metadata: {
      frontmatter: { tags: ["myth/norse"] },
      tags: ["#myth/norse"],
      links: [],
      headings: []
    }
  }
];

describe("buildRelationshipGraph", () => {
  it("resolves internal links, preserves unresolved targets, and builds backlinks", () => {
    const graph = buildRelationshipGraph(buildVaultSnapshot(notes));

    expect(graph.resolvedLinksByPath).toEqual({
      "Index.md": [
        {
          raw: "[[Literature/Ragnarok]]",
          target: "Literature/Ragnarok",
          targetPath: "Literature/Ragnarok.md"
        }
      ],
      "Literature/Ragnarok.md": [
        {
          raw: "[[Permanent/Viking Cosmology#World Tree]]",
          target: "Permanent/Viking Cosmology",
          heading: "World Tree",
          targetPath: "Permanent/Viking Cosmology.md"
        }
      ],
      "Loose.md": [],
      "Permanent/Viking Cosmology.md": [],
      "Tagged Only.md": []
    });
    expect(graph.unresolvedLinksByPath).toEqual({
      "Index.md": [{ raw: "[[Missing Note]]", target: "Missing Note" }],
      "Literature/Ragnarok.md": [],
      "Loose.md": [],
      "Permanent/Viking Cosmology.md": [],
      "Tagged Only.md": []
    });
    expect(graph.backlinksByPath).toEqual({
      "Index.md": [],
      "Literature/Ragnarok.md": ["Index.md"],
      "Loose.md": [],
      "Permanent/Viking Cosmology.md": ["Literature/Ragnarok.md"],
      "Tagged Only.md": []
    });
  });

  it("computes tag statistics and co-occurrence from normalized tags", () => {
    const graph = buildRelationshipGraph(buildVaultSnapshot(notes));

    expect(graph.tagStatsByTag["myth"]).toEqual({
      tag: "myth",
      noteCount: 3,
      notePaths: ["Literature/Ragnarok.md", "Permanent/Viking Cosmology.md", "Tagged Only.md"],
      latestMtime: 50,
      coTags: [
        { tag: "myth/norse", count: 3 },
        { tag: "permanent", count: 1 },
        { tag: "source", count: 1 },
        { tag: "source/literature", count: 1 }
      ]
    });
    expect(graph.tagStatsByTag["myth/norse"]?.noteCount).toBe(3);
    expect(graph.tagStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "myth", noteCount: 3 }),
        expect.objectContaining({ tag: "myth/norse", noteCount: 3 })
      ])
    );
  });

  it("identifies orphan and weakly connected notes", () => {
    const graph = buildRelationshipGraph(buildVaultSnapshot(notes));

    expect(graph.orphanNotePaths).toEqual(["Loose.md", "Tagged Only.md"]);
    expect(graph.weaklyConnectedNotePaths).toEqual(["Loose.md", "Tagged Only.md"]);
  });
});

