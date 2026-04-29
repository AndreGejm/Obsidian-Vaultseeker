import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  type IndexHealth,
  type NoteRecordInput
} from "@vaultseer/core";
import { buildSearchModalQueryState } from "../src/search-modal-query";

function health(overrides: Partial<IndexHealth>): IndexHealth {
  return {
    schemaVersion: 1,
    status: "ready",
    statusMessage: null,
    lastIndexedAt: "2026-04-30T00:00:00.000Z",
    noteCount: 1,
    chunkCount: 1,
    vectorCount: 1,
    suggestionCount: 0,
    warnings: [],
    ...overrides
  };
}

const noteInputs: NoteRecordInput[] = [
  {
    path: "Notes/Yggdrasil.md",
    basename: "Yggdrasil",
    content: "# Yggdrasil\n\nWorld tree and cosmic structure.",
    stat: { ctime: 1, mtime: 2, size: 44 },
    metadata: {
      frontmatter: { tags: ["cosmology"] },
      tags: ["#cosmology"],
      links: [],
      headings: [{ level: 1, heading: "Yggdrasil", position: { line: 0, column: 1 } }]
    }
  }
];

const snapshot = buildVaultSnapshot(noteInputs);
const chunks = chunkVaultInputs(noteInputs);
const lexicalIndex = buildLexicalIndex(snapshot, chunks);

describe("buildSearchModalQueryState", () => {
  it("runs semantic search for searchable nonblank queries and merges the result", async () => {
    const requestedQueries: string[] = [];

    const state = await buildSearchModalQueryState({
      query: "cosmic tree",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex,
      semanticSearch: async (query) => {
        requestedQueries.push(query);
        return {
          status: "ready",
          message: "1 semantic result found.",
          results: [
            {
              notePath: "Notes/Yggdrasil.md",
              title: "Yggdrasil",
              score: 0.88,
              matchedChunks: [
                {
                  chunkId: chunks[0]!.id,
                  headingPath: ["Yggdrasil"],
                  text: "World tree and cosmic structure.",
                  score: 0.88
                }
              ]
            }
          ]
        };
      }
    });

    expect(requestedQueries).toEqual(["cosmic tree"]);
    expect(state).toMatchObject({
      status: "ready",
      results: [
        {
          source: "hybrid",
          reason: expect.stringContaining("semantic match 0.88 in Yggdrasil")
        }
      ]
    });
  });

  it("does not call semantic search for blank or blocked searches", async () => {
    const requestedQueries: string[] = [];
    const semanticSearch = async (query: string) => {
      requestedQueries.push(query);
      return { status: "ready" as const, message: "0 semantic results found.", results: [] };
    };

    await buildSearchModalQueryState({
      query: " ",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex,
      semanticSearch
    });

    await buildSearchModalQueryState({
      query: "cosmic tree",
      health: health({ status: "empty", noteCount: 0, chunkCount: 0, vectorCount: 0 }),
      notes: [],
      chunks: [],
      lexicalIndex: [],
      semanticSearch
    });

    expect(requestedQueries).toEqual([]);
  });

  it("turns unexpected semantic runner rejection into degraded search state", async () => {
    const state = await buildSearchModalQueryState({
      query: "cosmic tree",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex,
      semanticSearch: async () => {
        throw new Error("provider process crashed");
      }
    });

    expect(state).toMatchObject({
      status: "ready",
      message: "1 result found. Semantic search failed: provider process crashed"
    });
    expect(state.results).toHaveLength(1);
  });
});
