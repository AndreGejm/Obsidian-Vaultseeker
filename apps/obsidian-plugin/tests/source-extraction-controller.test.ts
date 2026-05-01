import { describe, expect, it } from "vitest";
import {
  createSourceExtractionJobId,
  InMemoryVaultseerStore,
  type SourceExtractionJobRecord,
  type SourceRecord
} from "@vaultseer/core";
import {
  cancelSourceExtractionQueue,
  planMarkerSourceExtractionQueue,
  recoverSourceExtractionQueue,
  summarizeSourceExtractionQueue
} from "../src/source-extraction-controller";

const now = "2026-05-01T11:00:00.000Z";

describe("planMarkerSourceExtractionQueue", () => {
  it("plans marker PDF jobs from vault files while honoring excluded folders and current sources", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceWorkspace(
      [
        source({
          sourcePath: "Sources/Papers/current.pdf",
          filename: "current.pdf",
          contentHash: "vault-file:100:10"
        }),
        source({
          sourcePath: "Sources/Papers/stale.pdf",
          filename: "stale.pdf",
          contentHash: "vault-file:190:19"
        })
      ],
      []
    );

    const summary = await planMarkerSourceExtractionQueue({
      store,
      files: [
        file("Sources/Papers/current.pdf", "current.pdf", "pdf", 100, 10),
        file("Sources/Papers/stale.pdf", "stale.pdf", "pdf", 200, 20),
        file("Sources/Papers/new.pdf", "new.pdf", "pdf", 300, 30),
        file("Sources/Docs/manual.docx", "manual.docx", "docx", 400, 40),
        file(".obsidian/plugins/private.pdf", "private.pdf", "pdf", 500, 50),
        file("research/cloned-reference.pdf", "cloned-reference.pdf", "pdf", 600, 60)
      ],
      excludedFolders: [".obsidian", "research"],
      now,
      maxJobs: 1
    });

    expect(summary).toMatchObject({
      candidateCount: 3,
      plannedJobCount: 1,
      reusableSourceCount: 1,
      staleSourceCount: 1,
      alreadyQueuedCount: 0,
      failedSourceCount: 0,
      skippedByLimitCount: 1,
      totalJobCount: 1,
      queuedJobCount: 1
    });
    await expect(store.getSourceExtractionJobRecords()).resolves.toEqual([
      expect.objectContaining({
        id: createSourceExtractionJobId("marker", "Sources/Papers/stale.pdf", "vault-file:200:20", {
          preserveImages: true,
          preserveTables: true
        }),
        extractorId: "marker",
        sourcePath: "Sources/Papers/stale.pdf",
        filename: "stale.pdf",
        extension: ".pdf",
        sizeBytes: 200,
        contentHash: "vault-file:200:20",
        extractionOptions: {
          preserveImages: true,
          preserveTables: true
        },
        status: "queued",
        createdAt: now
      })
    ]);
  });
});

describe("source extraction queue status controls", () => {
  it("summarizes persisted source extraction jobs", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceExtractionQueue([
      job({ id: "job:queued", status: "queued" }),
      job({ id: "job:running", status: "running" }),
      job({ id: "job:completed", status: "completed" }),
      job({ id: "job:failed", status: "failed" }),
      job({ id: "job:cancelled", status: "cancelled" })
    ]);

    await expect(summarizeSourceExtractionQueue({ store })).resolves.toEqual({
      totalJobCount: 5,
      queuedJobCount: 1,
      runningJobCount: 1,
      completedJobCount: 1,
      failedJobCount: 1,
      cancelledJobCount: 1
    });
  });

  it("cancels queued and running extraction jobs while preserving completed jobs", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceExtractionQueue([
      job({ id: "job:queued", status: "queued" }),
      job({ id: "job:running", status: "running" }),
      job({ id: "job:completed", status: "completed" })
    ]);

    const summary = await cancelSourceExtractionQueue({ store, now });

    expect(summary).toEqual({
      newlyCancelledJobCount: 2,
      totalJobCount: 3,
      queuedJobCount: 0,
      runningJobCount: 0,
      completedJobCount: 1,
      failedJobCount: 0,
      cancelledJobCount: 2
    });
    await expect(store.getSourceExtractionJobRecords()).resolves.toEqual([
      expect.objectContaining({ id: "job:queued", status: "cancelled", updatedAt: now }),
      expect.objectContaining({ id: "job:running", status: "cancelled", updatedAt: now }),
      expect.objectContaining({ id: "job:completed", status: "completed" })
    ]);
  });

  it("recovers running extraction jobs left behind by an interrupted plugin session", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceExtractionQueue([
      job({ id: "job:running", status: "running" }),
      job({ id: "job:completed", status: "completed" })
    ]);

    const summary = await recoverSourceExtractionQueue({ store, now });

    expect(summary).toEqual({
      recoveredJobCount: 1,
      totalJobCount: 2,
      queuedJobCount: 1,
      runningJobCount: 0,
      completedJobCount: 1,
      failedJobCount: 0,
      cancelledJobCount: 0
    });
    await expect(store.getSourceExtractionJobRecords()).resolves.toEqual([
      expect.objectContaining({
        id: "job:running",
        status: "queued",
        updatedAt: now,
        lastError: "Recovered after plugin restart before source extraction completed.",
        nextAttemptAt: null
      }),
      expect.objectContaining({ id: "job:completed", status: "completed" })
    ]);
  });
});

function file(path: string, name: string, extension: string, size: number, mtime: number) {
  return {
    path,
    name,
    extension,
    stat: {
      size,
      mtime
    }
  };
}

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    id: "source:paper",
    status: "extracted",
    sourcePath: "Sources/Papers/paper.pdf",
    filename: "paper.pdf",
    extension: ".pdf",
    sizeBytes: 100,
    contentHash: "vault-file:100:10",
    importedAt: now,
    extractor: {
      id: "marker",
      name: "Marker",
      version: "pending"
    },
    extractionOptions: {
      preserveImages: true,
      preserveTables: true
    },
    extractedMarkdown: "# Paper\n\nExtracted source text.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function job(overrides: Partial<SourceExtractionJobRecord>): SourceExtractionJobRecord {
  return {
    id: "job:queued",
    extractorId: "marker",
    sourcePath: "Sources/Papers/paper.pdf",
    filename: "paper.pdf",
    extension: ".pdf",
    sizeBytes: 100,
    contentHash: "vault-file:100:10",
    extractionOptions: {
      preserveImages: true,
      preserveTables: true
    },
    status: "queued",
    attemptCount: 0,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    lastError: null,
    nextAttemptAt: null,
    ...overrides
  };
}
