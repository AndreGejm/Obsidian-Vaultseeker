import { describe, expect, it } from "vitest";
import { buildSearchModalState } from "../src/search-modal-state";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  type IndexHealth,
  type NoteRecordInput
} from "@vaultseer/core";

function health(overrides: Partial<IndexHealth>): IndexHealth {
  return {
    schemaVersion: 1,
    status: "ready",
    statusMessage: null,
    lastIndexedAt: "2026-04-29T22:30:00.000Z",
    noteCount: 1,
    chunkCount: 1,
    vectorCount: 0,
    suggestionCount: 0,
    warnings: [],
    ...overrides
  };
}

const noteInputs: NoteRecordInput[] = [
  {
    path: "Literature/Mimisbrunnr Retrieval.md",
    basename: "Mimisbrunnr Retrieval",
    content: "# Mimisbrunnr Retrieval\n\nGoverned memory retrieval keeps agent context bounded.",
    stat: { ctime: 1, mtime: 2, size: 77 },
    metadata: {
      frontmatter: {
        title: "Mimisbrunnr Retrieval",
        aliases: ["Memory Retrieval"],
        tags: ["ai/memory"]
      },
      tags: ["#ai/memory"],
      links: [],
      headings: [{ level: 1, heading: "Mimisbrunnr Retrieval", position: { line: 0, column: 1 } }]
    }
  }
];

const snapshot = buildVaultSnapshot(noteInputs);
const chunks = chunkVaultInputs(noteInputs);
const lexicalIndex = buildLexicalIndex(snapshot, chunks);

describe("buildSearchModalState", () => {
  it("blocks search when the mirror is empty or failed", () => {
    expect(
      buildSearchModalState({
        query: "memory",
        health: health({ status: "empty", noteCount: 0, chunkCount: 0 }),
        notes: [],
        chunks: [],
        lexicalIndex: []
      })
    ).toMatchObject({
      status: "blocked",
      message: "Rebuild the Vaultseer index before searching."
    });

    expect(
      buildSearchModalState({
        query: "memory",
        health: health({ status: "error", statusMessage: "Unsupported index schema version: 999." }),
        notes: snapshot.notes,
        chunks,
        lexicalIndex
      })
    ).toMatchObject({
      status: "blocked",
      message: "Vaultseer index has an error: Unsupported index schema version: 999."
    });
  });

  it("returns a prompt for searchable mirrors until the user enters a query", () => {
    expect(
      buildSearchModalState({
        query: " ",
        health: health({ status: "ready" }),
        notes: snapshot.notes,
        chunks,
        lexicalIndex
      })
    ).toEqual({
      status: "ready",
      message: "Type a word, tag, title, alias, or topic to search the indexed mirror.",
      results: []
    });
  });

  it("returns explainable result rows from the persisted mirror", () => {
    const state = buildSearchModalState({
      query: "memory retrieval",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex
    });

    expect(state).toMatchObject({
      status: "ready",
      message: "1 result found.",
      results: [
        {
          notePath: "Literature/Mimisbrunnr Retrieval.md",
          title: "Mimisbrunnr Retrieval",
          reason: expect.stringContaining("memory in alias")
        }
      ]
    });
    expect(state.results[0]!.excerpt).toContain("Governed memory retrieval");
  });

  it("keeps stale mirrors searchable while warning the operator", () => {
    expect(
      buildSearchModalState({
        query: "memory",
        health: health({ status: "stale", statusMessage: "Vault changed since last index: 1 modified." }),
        notes: snapshot.notes,
        chunks,
        lexicalIndex
      })
    ).toMatchObject({
      status: "ready",
      message: "Showing the last indexed mirror. Vault changed since last index: 1 modified."
    });
  });

  it("adds semantic-only results with matched chunk evidence", () => {
    const state = buildSearchModalState({
      query: "adjacent mythic topic",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex,
      semantic: {
        status: "ready",
        message: "1 semantic result found.",
        results: [
          {
            notePath: "Literature/Mimisbrunnr Retrieval.md",
            title: "Mimisbrunnr Retrieval",
            score: 0.82,
            matchedChunks: [
              {
                chunkId: chunks[0]!.id,
                headingPath: ["Mimisbrunnr Retrieval"],
                text: "Governed memory retrieval keeps agent context bounded.",
                score: 0.82
              }
            ]
          }
        ]
      }
    });

    expect(state).toMatchObject({
      status: "ready",
      message: "1 result found.",
      results: [
        {
          notePath: "Literature/Mimisbrunnr Retrieval.md",
          source: "semantic",
          reason: "semantic match 0.82 in Mimisbrunnr Retrieval",
          excerpt: "Governed memory retrieval keeps agent context bounded."
        }
      ]
    });
  });

  it("merges semantic evidence into an existing lexical result for the same note", () => {
    const state = buildSearchModalState({
      query: "memory retrieval",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex,
      semantic: {
        status: "ready",
        message: "1 semantic result found.",
        results: [
          {
            notePath: "Literature/Mimisbrunnr Retrieval.md",
            title: "Mimisbrunnr Retrieval",
            score: 0.91,
            matchedChunks: [
              {
                chunkId: chunks[0]!.id,
                headingPath: ["Mimisbrunnr Retrieval"],
                text: "Governed memory retrieval keeps agent context bounded.",
                score: 0.91
              }
            ]
          }
        ]
      }
    });

    expect(state.results).toHaveLength(1);
    expect(state.results[0]).toMatchObject({
      source: "hybrid",
      reason: expect.stringContaining("semantic match 0.91 in Mimisbrunnr Retrieval")
    });
  });

  it("keeps lexical results visible when semantic search degrades", () => {
    const state = buildSearchModalState({
      query: "memory",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex,
      semantic: {
        status: "degraded",
        message: "Semantic search failed: Ollama offline",
        results: []
      }
    });

    expect(state).toMatchObject({
      status: "ready",
      message: "1 result found. Semantic search failed: Ollama offline"
    });
    expect(state.results).toHaveLength(1);
  });
});
