import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  type NoteRecordInput,
  type SourceChunkRecord,
  type SourceRecord
} from "@vaultseer/core";
import {
  createCodexReadOnlyToolImplementations,
  parseCodexSearchToolInput
} from "../src/codex-read-only-tool-implementations";

describe("parseCodexSearchToolInput", () => {
  it("accepts a string input as the query with a default bounded limit", () => {
    expect(parseCodexSearchToolInput("timing")).toEqual({ query: "timing", limit: 5 });
  });

  it("accepts object query input and integer limit", () => {
    expect(parseCodexSearchToolInput({ query: "vhdl timing", limit: 7 })).toEqual({
      query: "vhdl timing",
      limit: 7
    });
  });

  it("bounds supplied limits to the supported range", () => {
    expect(parseCodexSearchToolInput({ query: "timer", limit: 100 })).toEqual({ query: "timer", limit: 10 });
    expect(parseCodexSearchToolInput({ query: "timer", limit: -2 })).toEqual({ query: "timer", limit: 1 });
  });

  it("rejects blank queries", () => {
    expect(() => parseCodexSearchToolInput(" ")).toThrow("query");
    expect(() => parseCodexSearchToolInput({ query: "" })).toThrow("query");
  });
});

describe("createCodexReadOnlyToolImplementations", () => {
  it("inspects the current active note through the active note context builder", async () => {
    const store = new InMemoryVaultseerStore();
    await indexNotes(store, [
      {
        path: "Notes/VHDL.md",
        basename: "VHDL",
        content: "VHDL setup time matters.",
        stat: { ctime: 1, mtime: 1, size: 24 },
        metadata: {
          frontmatter: { tags: ["vhdl"] },
          tags: ["#vhdl"],
          links: [],
          headings: []
        }
      }
    ]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.inspectCurrentNote()).resolves.toMatchObject({
      status: "ready",
      note: { path: "Notes/VHDL.md", title: "VHDL" },
      noteChunks: [expect.objectContaining({ text: "VHDL setup time matters." })]
    });
  });

  it("searches indexed notes through the existing search modal query state", async () => {
    const store = new InMemoryVaultseerStore();
    await indexNotes(store, [
      {
        path: "Notes/VHDL.md",
        basename: "VHDL",
        content: "Setup timing constraints matter.",
        stat: { ctime: 1, mtime: 1, size: 32 },
        metadata: {
          frontmatter: { tags: ["vhdl"] },
          tags: ["#vhdl"],
          links: [],
          headings: []
        }
      }
    ]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.searchNotes({ query: "timing", limit: 2 })).resolves.toMatchObject({
      status: "ready",
      message: "1 result found.",
      results: [expect.objectContaining({ notePath: "Notes/VHDL.md", source: "lexical" })]
    });
  });

  it("searches extracted sources through the existing source search modal state", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceWorkspace(sourceRecords, sourceChunks);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.searchSources("reset")).resolves.toMatchObject({
      status: "ready",
      message: "1 source result found.",
      results: [expect.objectContaining({ sourceId: "source:timer", source: "lexical" })]
    });
  });
});

async function indexNotes(store: InMemoryVaultseerStore, noteInputs: NoteRecordInput[]): Promise<void> {
  const snapshot = buildVaultSnapshot(noteInputs);
  const chunks = chunkVaultInputs(noteInputs);
  await store.replaceNoteIndex(snapshot, "2026-05-02T00:00:00.000Z", chunks, buildLexicalIndex(snapshot, chunks));
}

const sourceRecords: SourceRecord[] = [
  {
    id: "source:timer",
    status: "extracted",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
    extension: ".pdf",
    sizeBytes: 100,
    contentHash: "source-hash",
    importedAt: "2026-05-01T07:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Timer\n\nPin 1 controls reset behavior.",
    diagnostics: [],
    attachments: []
  }
];

const sourceChunks: SourceChunkRecord[] = [
  {
    id: "source-chunk:timer-reset",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    sectionPath: ["Timer"],
    normalizedTextHash: "hash-reset",
    ordinal: 0,
    text: "Pin 1 controls reset behavior.",
    provenance: { kind: "unknown" }
  }
];
