import { describe, expect, it } from "vitest";
import {
  buildVectorNamespace,
  cancelEmbeddingJobs,
  claimEmbeddingJobs,
  completeEmbeddingJob,
  createEmbeddingJobId,
  failEmbeddingJob,
  planEmbeddingQueue,
  type ChunkRecord,
  type EmbeddingJobRecord,
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

function job(overrides: Partial<EmbeddingJobRecord>): EmbeddingJobRecord {
  return {
    id: "job-a",
    chunkId: "chunk-a",
    notePath: "Notes/A.md",
    modelNamespace: "ollama/nomic-embed-text:768",
    contentHash: "hash-a",
    status: "queued",
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    lastError: null,
    nextAttemptAt: null,
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
        lastError: null,
        nextAttemptAt: null
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
        lastError: null,
        nextAttemptAt: null
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

describe("embedding queue transitions", () => {
  it("claims only due queued jobs up to the requested limit", () => {
    const now = "2026-04-29T23:00:00.000Z";
    const jobs = [
      job({ id: "job-ready-a", chunkId: "chunk-a", nextAttemptAt: null }),
      job({ id: "job-ready-b", chunkId: "chunk-b", nextAttemptAt: "2026-04-29T22:59:59.000Z" }),
      job({ id: "job-later", chunkId: "chunk-c", nextAttemptAt: "2026-04-29T23:05:00.000Z" }),
      job({ id: "job-running", chunkId: "chunk-d", status: "running" })
    ];

    const result = claimEmbeddingJobs({ jobs, now, limit: 1 });

    expect(result.claimedJobIds).toEqual(["job-ready-a"]);
    expect(result.jobs).toEqual([
      expect.objectContaining({ id: "job-ready-a", status: "running", updatedAt: now }),
      expect.objectContaining({ id: "job-ready-b", status: "queued" }),
      expect.objectContaining({ id: "job-later", status: "queued" }),
      expect.objectContaining({ id: "job-running", status: "running" })
    ]);
  });

  it("records completion, cancellation, retry backoff, and terminal failure", () => {
    const running = job({ id: "job-running", status: "running", attemptCount: 1 });

    expect(completeEmbeddingJob({ jobs: [running], jobId: "job-running", now: "2026-04-29T23:01:00.000Z" }).jobs).toEqual([
      expect.objectContaining({
        id: "job-running",
        status: "completed",
        updatedAt: "2026-04-29T23:01:00.000Z",
        lastError: null,
        nextAttemptAt: null
      })
    ]);

    expect(cancelEmbeddingJobs({ jobs: [running], jobIds: ["job-running"], now: "2026-04-29T23:02:00.000Z" }).jobs).toEqual([
      expect.objectContaining({
        id: "job-running",
        status: "cancelled",
        updatedAt: "2026-04-29T23:02:00.000Z"
      })
    ]);

    expect(
      failEmbeddingJob({
        jobs: [running],
        jobId: "job-running",
        error: "Ollama unavailable",
        now: "2026-04-29T23:03:00.000Z",
        retryDelayMs: 30_000,
        maxAttempts: 3
      }).jobs
    ).toEqual([
      expect.objectContaining({
        id: "job-running",
        status: "queued",
        attemptCount: 2,
        lastError: "Ollama unavailable",
        nextAttemptAt: "2026-04-29T23:03:30.000Z"
      })
    ]);

    expect(
      failEmbeddingJob({
        jobs: [job({ id: "job-terminal", status: "running", attemptCount: 2 })],
        jobId: "job-terminal",
        error: "bad vector dimension",
        now: "2026-04-29T23:04:00.000Z",
        retryDelayMs: 30_000,
        maxAttempts: 3
      }).jobs
    ).toEqual([
      expect.objectContaining({
        id: "job-terminal",
        status: "failed",
        attemptCount: 3,
        lastError: "bad vector dimension",
        nextAttemptAt: null
      })
    ]);
  });
});
