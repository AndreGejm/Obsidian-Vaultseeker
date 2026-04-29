import { describe, expect, it } from "vitest";
import {
  buildVaultSnapshot,
  buildVectorNamespace,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  planEmbeddingQueue,
  runEmbeddingWorkerBatch,
  type EmbeddingProviderPort,
  type NoteRecordInput,
  type VectorRecord
} from "../src";

const indexedAt = "2026-04-29T23:10:00.000Z";
const workerNow = "2026-04-29T23:15:00.000Z";
const modelProfile = {
  providerId: "test-provider",
  modelId: "tiny-embedding",
  dimensions: 3
};
const modelNamespace = buildVectorNamespace(modelProfile);

const noteInputs: NoteRecordInput[] = [
  {
    path: "A.md",
    basename: "A",
    content: "# Alpha\n\nAlpha memory retrieval.",
    stat: { ctime: 1, mtime: 2, size: 32 },
    metadata: {
      frontmatter: { tags: ["alpha"] },
      tags: ["#alpha"],
      links: [],
      headings: [{ level: 1, heading: "Alpha", position: { line: 0, column: 1 } }]
    }
  },
  {
    path: "B.md",
    basename: "B",
    content: "# Beta\n\nBeta related context.",
    stat: { ctime: 3, mtime: 4, size: 29 },
    metadata: {
      frontmatter: { tags: ["beta"] },
      tags: ["#beta"],
      links: [],
      headings: [{ level: 1, heading: "Beta", position: { line: 0, column: 1 } }]
    }
  }
];

class FakeEmbeddingProvider implements EmbeddingProviderPort {
  readonly embeddedTexts: string[] = [];

  constructor(private readonly result: number[][] | Error) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    this.embeddedTexts.push(...texts);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

async function createQueuedStore(): Promise<InMemoryVaultseerStore> {
  const store = new InMemoryVaultseerStore();
  const snapshot = buildVaultSnapshot(noteInputs);
  const chunks = chunkVaultInputs(noteInputs);
  await store.replaceNoteIndex(snapshot, indexedAt, chunks);
  const plan = planEmbeddingQueue({
    chunks,
    vectors: [],
    modelProfile,
    createdAt: indexedAt
  });
  await store.replaceEmbeddingQueue(plan.jobs);
  return store;
}

describe("runEmbeddingWorkerBatch", () => {
  it("embeds claimed queued jobs and stores completed vector records", async () => {
    const store = await createQueuedStore();
    const chunks = await store.getChunkRecords();
    const provider = new FakeEmbeddingProvider([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6]
    ]);

    const summary = await runEmbeddingWorkerBatch({
      store,
      provider,
      modelProfile,
      now: workerNow,
      batchSize: 2,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 2,
      completed: 2,
      failed: 0,
      vectorCount: 2
    });
    expect(provider.embeddedTexts).toEqual(chunks.map((chunk) => chunk.text));
    await expect(store.getVectorRecords()).resolves.toEqual([
      {
        chunkId: chunks[0]!.id,
        model: modelNamespace,
        dimensions: 3,
        contentHash: chunks[0]!.normalizedTextHash,
        vector: [0.1, 0.2, 0.3],
        embeddedAt: workerNow
      },
      {
        chunkId: chunks[1]!.id,
        model: modelNamespace,
        dimensions: 3,
        contentHash: chunks[1]!.normalizedTextHash,
        vector: [0.4, 0.5, 0.6],
        embeddedAt: workerNow
      }
    ]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ status: "completed", updatedAt: workerNow }),
      expect.objectContaining({ status: "completed", updatedAt: workerNow })
    ]);
  });

  it("records retryable provider failure without deleting existing vectors", async () => {
    const store = await createQueuedStore();
    const existingVector: VectorRecord = {
      chunkId: "old-chunk",
      model: modelNamespace,
      dimensions: 3,
      contentHash: "old-hash",
      vector: [0.7, 0.8, 0.9],
      embeddedAt: "2026-04-29T23:00:00.000Z"
    };
    await store.replaceVectorRecords([existingVector]);
    const provider = new FakeEmbeddingProvider(new Error("provider offline"));

    const summary = await runEmbeddingWorkerBatch({
      store,
      provider,
      modelProfile,
      now: workerNow,
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      vectorCount: 1
    });
    await expect(store.getVectorRecords()).resolves.toEqual([existingVector]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({
        status: "queued",
        attemptCount: 1,
        lastError: "provider offline",
        nextAttemptAt: "2026-04-29T23:15:30.000Z"
      }),
      expect.objectContaining({ status: "queued", attemptCount: 0 })
    ]);
  });

  it("fails claimed jobs when the provider returns the wrong vector shape", async () => {
    const store = await createQueuedStore();
    const provider = new FakeEmbeddingProvider([[0.1, 0.2]]);

    const summary = await runEmbeddingWorkerBatch({
      store,
      provider,
      modelProfile,
      now: workerNow,
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 1
    });

    expect(summary).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      vectorCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        attemptCount: 1,
        lastError: "Embedding for chunk 0 returned 2 dimensions; expected 3.",
        nextAttemptAt: null
      }),
      expect.objectContaining({ status: "queued", attemptCount: 0 })
    ]);
  });
});
