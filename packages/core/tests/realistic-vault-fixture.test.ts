import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildRelationshipGraph, buildVaultSnapshot } from "../src/index";
import type { NoteRecordInput } from "../src/index";

const fixtureRoot = new URL("../../../tests/fixtures/vault-personal-knowledge/", import.meta.url);

describe("personal knowledge vault fixture", () => {
  it("covers common Obsidian note patterns without requiring core Markdown parsing", async () => {
    const inputs = await loadFixtureInputs();
    const snapshot = buildVaultSnapshot(inputs);
    const graph = buildRelationshipGraph(snapshot);

    expect(snapshot.notes.map((note) => note.path)).toEqual([
      "Inbox/Reading Index.md",
      "Literature/The Great Gatsby.md",
      "People/Scott Fitzgerald.md",
      "Projects/Vaultseer Platform.md",
      "References/Fiction.md"
    ]);
    expect(snapshot.notesByPath["Literature/The Great Gatsby.md"]?.aliases).toEqual(["Gatsby"]);
    expect(snapshot.notesByPath["Literature/The Great Gatsby.md"]?.tags).toEqual([
      "source",
      "source/literature",
      "status",
      "status/read"
    ]);
    expect(snapshot.notePathsByTag["project/vaultseer"]).toEqual(["Projects/Vaultseer Platform.md"]);

    expect(graph.resolvedLinksByPath["Inbox/Reading Index.md"]?.map((link) => link.targetPath)).toEqual([
      "Literature/The Great Gatsby.md",
      "Projects/Vaultseer Platform.md"
    ]);
    expect(graph.resolvedLinksByPath["Literature/The Great Gatsby.md"]?.map((link) => link.targetPath)).toEqual([
      "People/Scott Fitzgerald.md",
      "References/Fiction.md"
    ]);
    expect(graph.unresolvedLinksByPath["Projects/Vaultseer Platform.md"]).toEqual([
      { raw: "[[Missing Citation]]", target: "Missing Citation" }
    ]);
    expect(graph.backlinksByPath["Literature/The Great Gatsby.md"]).toEqual([
      "Inbox/Reading Index.md",
      "Projects/Vaultseer Platform.md"
    ]);
    expect(graph.tagStatsByTag["source"]?.notePaths).toEqual([
      "Literature/The Great Gatsby.md",
      "References/Fiction.md"
    ]);
  });
});

async function loadFixtureInputs(): Promise<NoteRecordInput[]> {
  return [
    {
      path: "Inbox/Reading Index.md",
      basename: "Reading Index",
      content: await readFixture("Inbox/Reading Index.md"),
      stat: { ctime: 1, mtime: 10, size: 180 },
      metadata: {
        frontmatter: { tags: ["map/reading"], aliases: ["Reading Map"] },
        tags: ["#map/reading"],
        aliases: ["Reading Map"],
        links: [
          { raw: "[[Literature/The Great Gatsby]]", target: "Literature/The Great Gatsby" },
          { raw: "[[Projects/Vaultseer Platform]]", target: "Projects/Vaultseer Platform" }
        ],
        headings: [{ heading: "Active Reading", level: 2, position: { line: 8, column: 1 } }]
      }
    },
    {
      path: "Literature/The Great Gatsby.md",
      basename: "The Great Gatsby",
      content: await readFixture("Literature/The Great Gatsby.md"),
      stat: { ctime: 2, mtime: 20, size: 260 },
      metadata: {
        frontmatter: {
          tags: ["source/literature", "status/read"],
          aliases: ["Gatsby"],
          author: "Scott Fitzgerald",
          rating: 5
        },
        tags: ["#source/literature", "#status/read"],
        aliases: ["Gatsby"],
        links: [
          { raw: "[[People/Scott Fitzgerald]]", target: "People/Scott Fitzgerald" },
          { raw: "[[References/Fiction]]", target: "References/Fiction" }
        ],
        headings: [{ heading: "Notes", level: 2, position: { line: 12, column: 1 } }]
      }
    },
    {
      path: "People/Scott Fitzgerald.md",
      basename: "Scott Fitzgerald",
      content: await readFixture("People/Scott Fitzgerald.md"),
      stat: { ctime: 3, mtime: 30, size: 120 },
      metadata: {
        frontmatter: { tags: ["person/author"], aliases: ["F. Scott Fitzgerald"] },
        tags: ["#person/author"],
        aliases: ["F. Scott Fitzgerald"],
        links: [],
        headings: []
      }
    },
    {
      path: "Projects/Vaultseer Platform.md",
      basename: "Vaultseer Platform",
      content: await readFixture("Projects/Vaultseer Platform.md"),
      stat: { ctime: 4, mtime: 40, size: 320 },
      metadata: {
        frontmatter: {
          tags: ["project/vaultseer", "status/active"],
          fileClass: "Project"
        },
        tags: ["#project/vaultseer", "#status/active"],
        links: [
          { raw: "[[Literature/The Great Gatsby]]", target: "Literature/The Great Gatsby" },
          { raw: "[[Missing Citation]]", target: "Missing Citation" }
        ],
        headings: [
          { heading: "Goals", level: 2, position: { line: 10, column: 1 } },
          { heading: "Safety", level: 2, position: { line: 16, column: 1 } }
        ]
      }
    },
    {
      path: "References/Fiction.md",
      basename: "Fiction",
      content: await readFixture("References/Fiction.md"),
      stat: { ctime: 5, mtime: 50, size: 90 },
      metadata: {
        frontmatter: { tags: ["source/reference"] },
        tags: ["#source/reference"],
        links: [],
        headings: []
      }
    }
  ];
}

async function readFixture(path: string): Promise<string> {
  return readFile(new URL(path, fixtureRoot), "utf8");
}
