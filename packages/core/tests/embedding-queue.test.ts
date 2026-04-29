import { describe, expect, it } from "vitest";
import {
  buildVectorNamespace,
  createEmbeddingJobId,
  planEmbeddingQueue,
  type ChunkRecord,
  type VectorRecord
} from "../src";

const createdAt = "2026-04-29T22:45:00.000Z";

function chunk(overrides: Partial<ChunkRecord>): ChunkRecord {
  return {
    id: "chunk-a",
    notePath: "Notes/A.md",
    headingPath: ["A"],
    normalizedTextHash: "hash-a",
    ordinal: 0,
    text: "Alpha memory note.",
    ...overrides
  };
}

function vector(overrides: Partial<VectorRecord>): VectorRecord {
  return {
    chunkId: "chunk-a",
    model: "ollama/nomic-embed-text:768",
    dimensions: 768,
    contentHash: "hash-a",
    vector: [0.1, 0.2],
    embeddedAt: "2026-04-29T22:30:00.000Z",
    ...overrides
  };
}

describe("embedding queue planning", () => {
  it("creates a stable namespace from provider, model, and dimensions", () => {
    expect(
      buildVectorNamespace({
        providerId: "ollama",
        modelId: "nomic-embed-text",
        dimensions: 768
      })
    ).toBe("ollama/nomic-embed-text:768");
  });

  it("queues only chunks missing a matching vector for the selected model namespace", () => {
    const chunks = [
      chunk({ id: "chunk-a", normalizedTextHash: "hash-a", notePath: "Notes/A.md" }),
      chunk({ id: "chunk-b", normalizedTextHash: "hash-b", notePath: "Notes/B.md" }),
      chunk({ id: "chunk-c", normalizedTextHash: "hash-c", notePath: "Notes/C.md" })
    ];
    const modelProfile = { providerId: "ollama", modelId: "nomic-embed-text", dimensions: 768 };
    const namespace = buildVectorNamespace(modelProfile);

    const plan = planEmbeddingQueue({
      chunks,
      vectors: [
        vector({ chunkId: "chunk-a", model: namespace, dimensions: 768, contentHash: "hash-a" }),
        vector({ chunkId: "chunk-b", model: namespace, dimensions: 768, contentHash: "old-hash" }),
        vector({ chunkId: "chunk-c", model: "ollama/other-model:768", dimensions: 768, contentHash: "hash-c" })
      ],
      modelProfile,
      createdAt
    });

    expect(plan).toMatchObject({
      modelNamespace: namespace,
      reusableVectorCount: 1,
      staleVectorCount: 1,
      skippedByLimitCount: 0
    });
    expect(plan.jobs).toEqual([
      {
        id: createEmbeddingJobId(namespace, "chunk-b", "hash-b"),
        chunkId: "chunk-b",
        notePath: "Notes/B.md",
        modelNamespace: namespace,
        contentHash: "hash-b",
        status: "queued",
        attemptCount: 0,
        createdAt,
        updatedAt: createdAt,
        lastError: null
      },
      {
        id: createEmbeddingJobId(namespace, "chunk-c", "hash-c"),
        chunkId: "chunk-c",
        notePath: "Notes/C.md",
        modelNamespace: namespace,
        contentHash: "hash-c",
        status: "queued",
        attemptCount: 0,
        createdAt,
        updatedAt: createdAt,
        lastError: null
      }
    ]);
  });

  it("limits queued jobs without hiding how much work remains", () => {
    const plan = planEmbeddingQueue({
      chunks: [
        chunk({ id: "chunk-a", normalizedTextHash: "hash-a" }),
        chunk({ id: "chunk-b", normalizedTextHash: "hash-b" })
      ],
      vectors: [],
      modelProfile: { providerId: "ollama", modelId: "nomic-embed-text", dimensions: 768 },
      createdAt,
      maxJobs: 1
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.skippedByLimitCount).toBe(1);
  });

  it("rejects incomplete model profiles before planning provider work", () => {
    expect(() =>
      buildVectorNamespace({
        providerId: " ",
        modelId: "nomic-embed-text",
        dimensions: 768
      })
    ).toThrow("Embedding provider id is required.");

    expect(() =>
      buildVectorNamespace({
        providerId: "ollama",
        modelId: "nomic-embed-text",
        dimensions: 0
      })
    ).toThrow("Embedding dimensions must be a positive integer.");
  });
});
