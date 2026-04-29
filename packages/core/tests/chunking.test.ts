import { describe, expect, it } from "vitest";
import { chunkNoteInput, chunkVaultInputs } from "../src/index";
import type { NoteRecordInput } from "../src/index";

function noteInput(content: string, safetyHeadingLine = 10): NoteRecordInput {
  return {
    path: "Projects/Vaultseer Platform.md",
    basename: "Vaultseer Platform",
    content,
    stat: { ctime: 1, mtime: 2, size: content.length },
    metadata: {
      frontmatter: {
        title: "Vaultseer Platform",
        tags: ["project/vaultseer"]
      },
      tags: ["#project/vaultseer"],
      links: [],
      headings: [
        { level: 1, heading: "Vaultseer Platform", position: { line: 0, column: 1 } },
        { level: 2, heading: "Goals", position: { line: 4, column: 1 } },
        { level: 2, heading: "Safety", position: { line: safetyHeadingLine, column: 1 } }
      ]
    }
  };
}

const baseContent = [
  "# Vaultseer Platform",
  "",
  "Opening context.",
  "",
  "## Goals",
  "",
  "Make a trusted mirror.",
  "",
  "Keep search explainable.",
  "",
  "## Safety",
  "",
  "Never write without preview.",
  "",
  "```dataview",
  "TABLE rating, author",
  "FROM \"Literature\"",
  "```"
].join("\n");

describe("chunkNoteInput", () => {
  it("creates block chunks under Obsidian heading paths and preserves fenced code as one chunk", () => {
    const chunks = chunkNoteInput(noteInput(baseContent));

    expect(chunks.map((chunk) => ({ headingPath: chunk.headingPath, text: chunk.text }))).toEqual([
      {
        headingPath: ["Vaultseer Platform", "Vaultseer Platform"],
        text: "Opening context."
      },
      {
        headingPath: ["Vaultseer Platform", "Vaultseer Platform", "Goals"],
        text: "Make a trusted mirror."
      },
      {
        headingPath: ["Vaultseer Platform", "Vaultseer Platform", "Goals"],
        text: "Keep search explainable."
      },
      {
        headingPath: ["Vaultseer Platform", "Vaultseer Platform", "Safety"],
        text: "Never write without preview."
      },
      {
        headingPath: ["Vaultseer Platform", "Vaultseer Platform", "Safety"],
        text: ["```dataview", "TABLE rating, author", "FROM \"Literature\"", "```"].join("\n")
      }
    ]);
    expect(chunks.every((chunk) => chunk.notePath === "Projects/Vaultseer Platform.md")).toBe(true);
    expect(chunks.every((chunk) => chunk.id.startsWith("chunk:"))).toBe(true);
  });

  it("keeps unchanged chunk ids stable when a nearby block is inserted", () => {
    const editedContent = baseContent.replace("Keep search explainable.", "Add a health check.\n\nKeep search explainable.");
    const before = chunkNoteInput(noteInput(baseContent));
    const after = chunkNoteInput(noteInput(editedContent, 12));

    const beforeByText = Object.fromEntries(before.map((chunk) => [chunk.text, chunk.id]));
    const afterByText = Object.fromEntries(after.map((chunk) => [chunk.text, chunk.id]));

    expect(afterByText["Make a trusted mirror."]).toBe(beforeByText["Make a trusted mirror."]);
    expect(afterByText["Keep search explainable."]).toBe(beforeByText["Keep search explainable."]);
    expect(afterByText["Never write without preview."]).toBe(beforeByText["Never write without preview."]);
    expect(afterByText["Add a health check."]).toBeDefined();
  });

  it("uses ordinal only to disambiguate duplicate chunks within the same heading path", () => {
    const content = ["# Vaultseer Platform", "", "Repeat.", "", "Repeat."].join("\n");
    const chunks = chunkNoteInput({
      ...noteInput(content),
      metadata: {
        ...noteInput(content).metadata,
        headings: [{ level: 1, heading: "Vaultseer Platform", position: { line: 0, column: 1 } }]
      }
    });

    expect(chunks.map((chunk) => chunk.ordinal)).toEqual([0, 1]);
    expect(chunks[0]!.normalizedTextHash).toBe(chunks[1]!.normalizedTextHash);
    expect(chunks[0]!.id).not.toBe(chunks[1]!.id);
  });
});

describe("chunkVaultInputs", () => {
  it("returns chunks sorted by note path and content order", () => {
    const chunks = chunkVaultInputs([
      {
        path: "B.md",
        basename: "B",
        content: "B body.",
        stat: { ctime: 1, mtime: 1, size: 7 },
        metadata: { frontmatter: {}, tags: [], links: [], headings: [] }
      },
      {
        path: "A.md",
        basename: "A",
        content: "A body.",
        stat: { ctime: 1, mtime: 1, size: 7 },
        metadata: { frontmatter: {}, tags: [], links: [], headings: [] }
      }
    ]);

    expect(chunks.map((chunk) => `${chunk.notePath}:${chunk.text}`)).toEqual(["A.md:A body.", "B.md:B body."]);
  });
});
