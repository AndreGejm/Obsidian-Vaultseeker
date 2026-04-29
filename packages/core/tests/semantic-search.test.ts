import { describe, expect, it } from "vitest";
import { searchSemanticVectors, type ChunkRecord, type NoteRecord, type VectorRecord } from "../src";

const notes: NoteRecord[] = [
  {
    path: "Norse/Ragnarok.md",
    basename: "Ragnarok",
    title: "Ragnarok",
    contentHash: "note-ragnarok",
    stat: { ctime: 1, mtime: 2, size: 100 },
    frontmatter: {},
    tags: ["mythology"],
    aliases: [],
    links: [],
    headings: []
  },
  {
    path: "Norse/Yggdrasil.md",
    basename: "Yggdrasil",
    title: "Yggdrasil",
    contentHash: "note-yggdrasil",
    stat: { ctime: 3, mtime: 4, size: 120 },
    frontmatter: {},
    tags: ["cosmology"],
    aliases: [],
    links: [],
    headings: []
  }
];

const chunks: ChunkRecord[] = [
  chunk({
    id: "chunk-ragnarok",
    notePath: "Norse/Ragnarok.md",
    headingPath: ["Ragnarok"],
    normalizedTextHash: "hash-ragnarok",
    text: "Ragnarok is a mythic ending and renewal cycle."
  }),
  chunk({
    id: "chunk-yggdrasil",
    notePath: "Norse/Yggdrasil.md",
    headingPath: ["Yggdrasil"],
    normalizedTextHash: "hash-yggdrasil",
    text: "Yggdrasil connects the worlds in Norse cosmology."
  }),
  chunk({
    id: "chunk-stale",
    notePath: "Norse/Ragnarok.md",
    headingPath: ["Ragnarok", "Old"],
    normalizedTextHash: "hash-current",
    text: "Current chunk text."
  })
];

const modelNamespace = "ollama/nomic-embed-text:3";

describe("searchSemanticVectors", () => {
  it("returns ranked notes with matched chunk evidence from stored vectors", () => {
    const results = searchSemanticVectors({
      queryVector: [1, 0, 0],
      modelNamespace,
      notes,
      chunks,
      vectors: [
        vector({ chunkId: "chunk-yggdrasil", contentHash: "hash-yggdrasil", vector: [0.2, 0.8, 0] }),
        vector({ chunkId: "chunk-ragnarok", contentHash: "hash-ragnarok", vector: [0.9, 0.1, 0] })
      ],
      limit: 5
    });

    expect(results.map((result) => result.notePath)).toEqual(["Norse/Ragnarok.md", "Norse/Yggdrasil.md"]);
    expect(results[0]).toMatchObject({
      notePath: "Norse/Ragnarok.md",
      title: "Ragnarok",
      matchedChunks: [
        {
          chunkId: "chunk-ragnarok",
          headingPath: ["Ragnarok"],
          text: "Ragnarok is a mythic ending and renewal cycle."
        }
      ]
    });
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("ignores wrong namespace, wrong dimensions, stale hashes, missing chunks, and zero vectors", () => {
    const results = searchSemanticVectors({
      queryVector: [1, 0, 0],
      modelNamespace,
      notes,
      chunks,
      vectors: [
        vector({ chunkId: "chunk-ragnarok", model: "ollama/other-model:3", contentHash: "hash-ragnarok", vector: [1, 0, 0] }),
        vector({ chunkId: "chunk-yggdrasil", dimensions: 2, contentHash: "hash-yggdrasil", vector: [1, 0] }),
        vector({ chunkId: "chunk-stale", contentHash: "old-hash", vector: [1, 0, 0] }),
        vector({ chunkId: "missing-chunk", contentHash: "hash-missing", vector: [1, 0, 0] }),
        vector({ chunkId: "chunk-ragnarok", contentHash: "hash-ragnarok", vector: [0, 0, 0] }),
        vector({ chunkId: "chunk-ragnarok", contentHash: "hash-ragnarok", vector: [0.5, 0.5, 0] })
      ],
      limit: 5
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      notePath: "Norse/Ragnarok.md",
      matchedChunks: [expect.objectContaining({ chunkId: "chunk-ragnarok" })]
    });
  });

  it("applies minimum score and deterministic limits", () => {
    const results = searchSemanticVectors({
      queryVector: [1, 0, 0],
      modelNamespace,
      notes,
      chunks,
      vectors: [
        vector({ chunkId: "chunk-yggdrasil", contentHash: "hash-yggdrasil", vector: [0.6, 0.8, 0] }),
        vector({ chunkId: "chunk-ragnarok", contentHash: "hash-ragnarok", vector: [1, 0, 0] })
      ],
      minScore: 0.8,
      limit: 1
    });

    expect(results).toEqual([
      expect.objectContaining({
        notePath: "Norse/Ragnarok.md",
        score: 1
      })
    ]);
  });

  it("returns no results for empty or invalid query vectors", () => {
    expect(searchSemanticVectors({ queryVector: [], modelNamespace, notes, chunks, vectors: [] })).toEqual([]);
    expect(searchSemanticVectors({ queryVector: [0, 0, 0], modelNamespace, notes, chunks, vectors: [] })).toEqual([]);
    expect(searchSemanticVectors({ queryVector: [1, Number.NaN, 0], modelNamespace, notes, chunks, vectors: [] })).toEqual([]);
  });
});

function chunk(overrides: Partial<ChunkRecord>): ChunkRecord {
  return {
    id: "chunk",
    notePath: "Note.md",
    headingPath: ["Note"],
    normalizedTextHash: "hash",
    ordinal: 0,
    text: "Text.",
    ...overrides
  };
}

function vector(overrides: Partial<VectorRecord>): VectorRecord {
  return {
    chunkId: "chunk",
    model: modelNamespace,
    dimensions: 3,
    contentHash: "hash",
    vector: [1, 0, 0],
    embeddedAt: "2026-04-29T23:30:00.000Z",
    ...overrides
  };
}
