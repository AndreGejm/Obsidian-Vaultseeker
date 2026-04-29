import { describe, expect, it } from "vitest";
import {
  buildVaultSnapshot,
  buildVectorNamespace,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  type NoteRecordInput,
  type VectorRecord
} from "@vaultseer/core";
import { planSemanticIndexQueue } from "../src/semantic-index-controller";

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
});
