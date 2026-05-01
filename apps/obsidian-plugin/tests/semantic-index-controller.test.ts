import { describe, expect, it } from "vitest";
import {
  buildVaultSnapshot,
  buildVectorNamespace,
  chunkVaultInputs,
  getEmbeddingJobTargetKind,
  InMemoryVaultseerStore,
  planEmbeddingQueue,
  planSourceEmbeddingQueue,
  type EmbeddingProviderPort,
  type EmbeddingJobRecord,
  type NoteRecordInput,
  type SourceChunkRecord,
  type SourceRecord,
  type VectorRecord
} from "@vaultseer/core";
import {
  cancelSourceSemanticIndexQueue,
  cancelSemanticIndexQueue,
  planSourceSemanticIndexQueue,
  planSemanticIndexQueue,
  recoverSourceSemanticIndexQueue,
  recoverSemanticIndexQueue,
  runSourceSemanticIndexBatch,
  runSemanticIndexBatch
} from "../src/semantic-index-controller";

const now = "2026-04-29T23:30:00.000Z";
const modelProfile = {
  providerId: "ollama",
  modelId: "nomic-embed-text",
  dimensions: 768
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

async function createStore(): Promise<InMemoryVaultseerStore> {
  const store = new InMemoryVaultseerStore();
  const snapshot = buildVaultSnapshot(noteInputs);
  const chunks = chunkVaultInputs(noteInputs);
  await store.replaceNoteIndex(snapshot, "2026-04-29T23:20:00.000Z", chunks);
  return store;
}

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    id: "source:paper",
    status: "extracted",
    sourcePath: "Sources/Papers/paper.pdf",
    filename: "paper.pdf",
    extension: ".pdf",
    sizeBytes: 100,
    contentHash: "source-hash",
    importedAt: now,
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Paper\n\nExtracted source text.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function sourceChunk(overrides: Partial<SourceChunkRecord>): SourceChunkRecord {
  return {
    id: "source-chunk:paper-a",
    sourceId: "source:paper",
    sourcePath: "Sources/Papers/paper.pdf",
    sectionPath: ["Paper"],
    normalizedTextHash: "source-hash-a",
    ordinal: 0,
    text: "Extracted source text.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}

async function addSourceQueueJob(
  store: InMemoryVaultseerStore,
  status: EmbeddingJobRecord["status"] = "queued"
): Promise<EmbeddingJobRecord> {
  const sourceRecord = source({});
  const sourceChunks = [sourceChunk({})];
  await store.replaceSourceWorkspace([sourceRecord], sourceChunks);
  const sourcePlan = planSourceEmbeddingQueue({
    sources: [sourceRecord],
    sourceChunks,
    vectors: [],
    modelProfile,
    createdAt: now
  });
  const sourceJob: EmbeddingJobRecord = {
    ...sourcePlan.jobs[0]!,
    status,
    updatedAt: status === "queued" ? sourcePlan.jobs[0]!.updatedAt : "2026-04-29T23:36:00.000Z"
  };
  await store.replaceEmbeddingQueue([sourceJob]);
  return sourceJob;
}

class FakeEmbeddingProvider implements EmbeddingProviderPort {
  readonly embeddedTexts: string[] = [];

  async embedTexts(texts: string[]): Promise<number[][]> {
    this.embeddedTexts.push(...texts);
    return texts.map((_, index) => Array.from({ length: 768 }, (_, dimension) => index + dimension / 1000));
  }
}

describe("planSemanticIndexQueue", () => {
  it("plans embedding jobs from persisted chunks without calling a provider", async () => {
    const store = await createStore();

    const summary = await planSemanticIndexQueue({
      store,
      modelProfile,
      now,
      maxJobs: 8
    });

    expect(summary).toEqual({
      modelNamespace,
      queuedJobCount: 2,
      reusableVectorCount: 0,
      staleVectorCount: 0,
      skippedByLimitCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ chunkId: expect.any(String), modelNamespace, status: "queued", createdAt: now }),
      expect.objectContaining({ chunkId: expect.any(String), modelNamespace, status: "queued", createdAt: now })
    ]);
  });

  it("does not queue chunks that already have reusable vectors", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const reusableVector: VectorRecord = {
      chunkId: chunks[0]!.id,
      model: modelNamespace,
      dimensions: 768,
      contentHash: chunks[0]!.normalizedTextHash,
      vector: [0.1, 0.2, 0.3],
      embeddedAt: "2026-04-29T23:25:00.000Z"
    };
    await store.replaceVectorRecords([reusableVector]);

    const summary = await planSemanticIndexQueue({
      store,
      modelProfile,
      now,
      maxJobs: 8
    });

    expect(summary).toMatchObject({
      queuedJobCount: 1,
      reusableVectorCount: 1
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ chunkId: chunks[1]!.id, status: "queued" })
    ]);
  });

  it("reports skipped chunks when the planning limit is smaller than the missing-vector set", async () => {
    const store = await createStore();

    const summary = await planSemanticIndexQueue({
      store,
      modelProfile,
      now,
      maxJobs: 1
    });

    expect(summary).toMatchObject({
      queuedJobCount: 1,
      skippedByLimitCount: 1
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toHaveLength(1);
  });

  it("preserves source embedding jobs when replanning note embedding jobs", async () => {
    const store = await createStore();
    const sourceJob = await addSourceQueueJob(store);

    const summary = await planSemanticIndexQueue({
      store,
      modelProfile,
      now,
      maxJobs: 1
    });

    expect(summary).toMatchObject({
      queuedJobCount: 1,
      skippedByLimitCount: 1
    });
    const persistedJobs = await store.getEmbeddingJobRecords();
    expect(persistedJobs).toEqual([
      expect.objectContaining({ id: sourceJob.id, targetKind: "source", status: "queued" }),
      expect.objectContaining({ notePath: expect.any(String), status: "queued" })
    ]);
    expect(getEmbeddingJobTargetKind(persistedJobs[1]!)).toBe("note");
  });
});

describe("planSourceSemanticIndexQueue", () => {
  it("plans source embedding jobs while preserving note embedding jobs", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const notePlan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    const sourceRecord = source({});
    const sourceChunks = [sourceChunk({})];
    await store.replaceSourceWorkspace([sourceRecord], sourceChunks);
    await store.replaceEmbeddingQueue([notePlan.jobs[0]!]);

    const summary = await planSourceSemanticIndexQueue({
      store,
      modelProfile,
      now,
      maxJobs: 8
    });

    expect(summary).toEqual({
      modelNamespace,
      queuedJobCount: 1,
      reusableVectorCount: 0,
      staleVectorCount: 0,
      skippedByLimitCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: notePlan.jobs[0]!.id, status: "queued" }),
      expect.objectContaining({
        targetKind: "source",
        sourceId: sourceRecord.id,
        sourcePath: sourceRecord.sourcePath,
        chunkId: sourceChunks[0]!.id,
        status: "queued"
      })
    ]);
  });
});

describe("runSemanticIndexBatch", () => {
  it("runs one explicit persisted queue batch through an injected provider", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const plan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    await store.replaceEmbeddingQueue(plan.jobs);
    const provider = new FakeEmbeddingProvider();

    const summary = await runSemanticIndexBatch({
      store,
      provider,
      modelProfile,
      now: "2026-04-29T23:35:00.000Z",
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      vectorCount: 1
    });
    expect(provider.embeddedTexts).toEqual([chunks[0]!.text]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ status: "completed" }),
      expect.objectContaining({ status: "queued" })
    ]);
    await expect(store.getVectorRecords()).resolves.toEqual([
      expect.objectContaining({
        chunkId: chunks[0]!.id,
        model: modelNamespace,
        dimensions: 768,
        contentHash: chunks[0]!.normalizedTextHash
      })
    ]);
  });
});

describe("runSourceSemanticIndexBatch", () => {
  it("runs one explicit source queue batch through an injected provider", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const notePlan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    const sourceJob = await addSourceQueueJob(store);
    await store.replaceEmbeddingQueue([
      notePlan.jobs[0]!,
      sourceJob
    ]);
    const provider = new FakeEmbeddingProvider();

    const summary = await runSourceSemanticIndexBatch({
      store,
      provider,
      modelProfile,
      now: "2026-04-29T23:35:00.000Z",
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      vectorCount: 1
    });
    expect(provider.embeddedTexts).toEqual(["Extracted source text."]);
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: notePlan.jobs[0]!.id, status: "queued" }),
      expect.objectContaining({ id: sourceJob.id, targetKind: "source", status: "completed" })
    ]);
    await expect(store.getVectorRecords()).resolves.toEqual([
      expect.objectContaining({
        chunkId: sourceJob.chunkId,
        model: modelNamespace,
        dimensions: 768,
        contentHash: sourceJob.contentHash
      })
    ]);
  });
});

describe("cancelSemanticIndexQueue", () => {
  it("cancels queued and running semantic jobs while preserving completed jobs", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const plan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    const jobs: EmbeddingJobRecord[] = [
      { ...plan.jobs[0]!, status: "running", updatedAt: "2026-04-29T23:36:00.000Z" },
      { ...plan.jobs[1]!, status: "completed", updatedAt: "2026-04-29T23:37:00.000Z" }
    ];
    await store.replaceEmbeddingQueue(jobs);

    const summary = await cancelSemanticIndexQueue({
      store,
      now: "2026-04-29T23:40:00.000Z"
    });

    expect(summary).toEqual({
      cancelledJobCount: 1,
      totalJobCount: 2,
      remainingQueuedJobCount: 0,
      remainingRunningJobCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: jobs[0]!.id, status: "cancelled", updatedAt: "2026-04-29T23:40:00.000Z" }),
      expect.objectContaining({ id: jobs[1]!.id, status: "completed", updatedAt: "2026-04-29T23:37:00.000Z" })
    ]);
  });

  it("does not cancel source embedding jobs from the note semantic queue command", async () => {
    const store = await createStore();
    const sourceJob = await addSourceQueueJob(store, "running");

    const summary = await cancelSemanticIndexQueue({
      store,
      now: "2026-04-29T23:40:00.000Z"
    });

    expect(summary).toEqual({
      cancelledJobCount: 0,
      totalJobCount: 0,
      remainingQueuedJobCount: 0,
      remainingRunningJobCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: sourceJob.id, targetKind: "source", status: "running" })
    ]);
  });

  it("returns a zero summary when there are no active semantic jobs", async () => {
    const store = await createStore();

    await expect(
      cancelSemanticIndexQueue({
        store,
        now: "2026-04-29T23:40:00.000Z"
      })
    ).resolves.toEqual({
      cancelledJobCount: 0,
      totalJobCount: 0,
      remainingQueuedJobCount: 0,
      remainingRunningJobCount: 0
    });
  });
});

describe("cancelSourceSemanticIndexQueue", () => {
  it("cancels active source semantic jobs while preserving note jobs", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const notePlan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    const sourceJob = await addSourceQueueJob(store, "running");
    const noteJob: EmbeddingJobRecord = {
      ...notePlan.jobs[0]!,
      status: "running",
      updatedAt: "2026-04-29T23:36:00.000Z"
    };
    await store.replaceEmbeddingQueue([noteJob, sourceJob]);

    const summary = await cancelSourceSemanticIndexQueue({
      store,
      now: "2026-04-29T23:40:00.000Z"
    });

    expect(summary).toEqual({
      cancelledJobCount: 1,
      totalJobCount: 1,
      remainingQueuedJobCount: 0,
      remainingRunningJobCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: noteJob.id, status: "running" }),
      expect.objectContaining({ id: sourceJob.id, targetKind: "source", status: "cancelled" })
    ]);
  });
});

describe("recoverSemanticIndexQueue", () => {
  it("requeues running semantic jobs left over from a previous plugin session", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const plan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    const jobs: EmbeddingJobRecord[] = [
      { ...plan.jobs[0]!, status: "running", updatedAt: "2026-04-29T23:36:00.000Z" },
      { ...plan.jobs[1]!, status: "completed", updatedAt: "2026-04-29T23:37:00.000Z" }
    ];
    await store.replaceEmbeddingQueue(jobs);

    const summary = await recoverSemanticIndexQueue({
      store,
      now: "2026-04-30T00:10:00.000Z"
    });

    expect(summary).toEqual({
      recoveredJobCount: 1,
      totalJobCount: 2,
      remainingRunningJobCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({
        id: jobs[0]!.id,
        status: "queued",
        updatedAt: "2026-04-30T00:10:00.000Z",
        lastError: "Recovered after plugin restart before completion.",
        nextAttemptAt: null
      }),
      expect.objectContaining({ id: jobs[1]!.id, status: "completed", updatedAt: "2026-04-29T23:37:00.000Z" })
    ]);
  });

  it("does not recover source embedding jobs from the note semantic startup recovery", async () => {
    const store = await createStore();
    const sourceJob = await addSourceQueueJob(store, "running");

    const summary = await recoverSemanticIndexQueue({
      store,
      now: "2026-04-30T00:10:00.000Z"
    });

    expect(summary).toEqual({
      recoveredJobCount: 0,
      totalJobCount: 0,
      remainingRunningJobCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: sourceJob.id, targetKind: "source", status: "running" })
    ]);
  });
});

describe("recoverSourceSemanticIndexQueue", () => {
  it("requeues running source semantic jobs while preserving note jobs", async () => {
    const store = await createStore();
    const chunks = await store.getChunkRecords();
    const notePlan = planEmbeddingQueue({
      chunks,
      vectors: [],
      modelProfile,
      createdAt: now
    });
    const sourceJob = await addSourceQueueJob(store, "running");
    const noteJob: EmbeddingJobRecord = {
      ...notePlan.jobs[0]!,
      status: "running",
      updatedAt: "2026-04-29T23:36:00.000Z"
    };
    await store.replaceEmbeddingQueue([noteJob, sourceJob]);

    const summary = await recoverSourceSemanticIndexQueue({
      store,
      now: "2026-04-30T00:10:00.000Z"
    });

    expect(summary).toEqual({
      recoveredJobCount: 1,
      totalJobCount: 1,
      remainingRunningJobCount: 0
    });
    await expect(store.getEmbeddingJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: noteJob.id, status: "running" }),
      expect.objectContaining({
        id: sourceJob.id,
        targetKind: "source",
        status: "queued",
        lastError: "Recovered after plugin restart before completion.",
        nextAttemptAt: null
      })
    ]);
  });
});
