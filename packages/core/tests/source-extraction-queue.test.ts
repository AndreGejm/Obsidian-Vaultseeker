import { describe, expect, it } from "vitest";
import {
  cancelSourceExtractionJobs,
  claimSourceExtractionJobs,
  completeSourceExtractionJob,
  createSourceExtractionJobId,
  failSourceExtractionJob,
  planSourceExtractionQueue,
  recoverRunningSourceExtractionJobs,
  type SourceExtractionCandidate,
  type SourceExtractionJobRecord,
  type SourceRecord
} from "../src";

const createdAt = "2026-05-01T10:30:00.000Z";
const later = "2026-05-01T10:35:00.000Z";

describe("source extraction queue", () => {
  it("queues new and stale source candidates while skipping current extracted sources", () => {
    const current = source({
      sourcePath: "Sources/Papers/current.pdf",
      contentHash: "sha256:current",
      extractionOptions: { preserveImages: true }
    });
    const stale = source({
      sourcePath: "Sources/Papers/stale.pdf",
      contentHash: "sha256:old",
      extractionOptions: { preserveImages: true }
    });
    const candidates = [
      candidate("Sources/Papers/current.pdf", "sha256:current", { preserveImages: true }),
      candidate("Sources/Papers/stale.pdf", "sha256:new", { preserveImages: true }),
      candidate("Sources/Papers/new.pdf", "sha256:new-source", { preserveImages: true })
    ];

    const plan = planSourceExtractionQueue({
      extractorId: "marker",
      candidates,
      sourceRecords: [current, stale],
      jobs: [],
      createdAt,
      maxJobs: 1
    });

    expect(plan).toMatchObject({
      reusableSourceCount: 1,
      staleSourceCount: 1,
      alreadyQueuedCount: 0,
      skippedByLimitCount: 1
    });
    expect(plan.jobs).toEqual([
      {
        id: createSourceExtractionJobId("marker", "Sources/Papers/stale.pdf", "sha256:new", {
          preserveImages: true
        }),
        extractorId: "marker",
        sourcePath: "Sources/Papers/stale.pdf",
        filename: "stale.pdf",
        extension: ".pdf",
        sizeBytes: 2048,
        contentHash: "sha256:new",
        extractionOptions: { preserveImages: true },
        status: "queued",
        attemptCount: 0,
        createdAt,
        updatedAt: createdAt,
        lastError: null,
        nextAttemptAt: null
      }
    ]);
  });

  it("does not duplicate active jobs and treats extraction options as part of identity", () => {
    const activeJob = job({
      sourcePath: "Sources/Papers/manual.pdf",
      contentHash: "sha256:manual",
      extractionOptions: { ocr: true }
    });

    const plan = planSourceExtractionQueue({
      extractorId: "marker",
      candidates: [
        candidate("Sources/Papers/manual.pdf", "sha256:manual", { ocr: true }),
        candidate("Sources/Papers/manual.pdf", "sha256:manual", { ocr: false })
      ],
      sourceRecords: [],
      jobs: [activeJob],
      createdAt
    });

    expect(plan.alreadyQueuedCount).toBe(1);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]).toMatchObject({
      id: createSourceExtractionJobId("marker", "Sources/Papers/manual.pdf", "sha256:manual", { ocr: false }),
      extractionOptions: { ocr: false }
    });
  });

  it("claims only due queued extraction jobs", () => {
    const due = job({ id: "job:due", sourcePath: "A.pdf", status: "queued", nextAttemptAt: null });
    const future = job({
      id: "job:future",
      sourcePath: "B.pdf",
      status: "queued",
      nextAttemptAt: "2026-05-01T11:00:00.000Z"
    });
    const running = job({ id: "job:running", sourcePath: "C.pdf", status: "running" });

    const result = claimSourceExtractionJobs({
      jobs: [due, future, running],
      now: later,
      limit: 2
    });

    expect(result.claimedJobIds).toEqual(["job:due"]);
    expect(result.jobs.map((queuedJob) => queuedJob.status)).toEqual(["running", "queued", "running"]);
  });

  it("moves failed extraction jobs through retry and terminal states", () => {
    const retryable = failSourceExtractionJob({
      jobs: [job({ id: "job:retry", attemptCount: 0, status: "running" })],
      jobId: "job:retry",
      error: "Marker service unavailable",
      now: later,
      retryDelayMs: 30_000,
      maxAttempts: 2
    });

    expect(retryable.jobs[0]).toMatchObject({
      status: "queued",
      attemptCount: 1,
      lastError: "Marker service unavailable",
      nextAttemptAt: "2026-05-01T10:35:30.000Z"
    });

    const terminal = failSourceExtractionJob({
      jobs: retryable.jobs,
      jobId: "job:retry",
      error: "Marker still unavailable",
      now: "2026-05-01T10:36:00.000Z",
      retryDelayMs: 30_000,
      maxAttempts: 2
    });

    expect(terminal.jobs[0]).toMatchObject({
      status: "failed",
      attemptCount: 2,
      lastError: "Marker still unavailable",
      nextAttemptAt: null
    });
  });

  it("completes, cancels, and recovers extraction jobs without changing completed jobs", () => {
    const completed = completeSourceExtractionJob({
      jobs: [job({ id: "job:done", status: "running" })],
      jobId: "job:done",
      now: later
    });
    expect(completed.jobs[0]).toMatchObject({ status: "completed", lastError: null, nextAttemptAt: null });

    const cancelled = cancelSourceExtractionJobs({
      jobs: [
        ...completed.jobs,
        job({ id: "job:queued", sourcePath: "queued.pdf", status: "queued" })
      ],
      jobIds: ["job:done", "job:queued"],
      now: later
    });
    expect(cancelled.changedJobIds).toEqual(["job:queued"]);
    expect(cancelled.jobs.map((queuedJob) => queuedJob.status)).toEqual(["completed", "cancelled"]);

    const recovered = recoverRunningSourceExtractionJobs({
      jobs: [job({ id: "job:running", status: "running" }), ...cancelled.jobs],
      now: later,
      reason: "Plugin restarted during extraction."
    });
    expect(recovered.changedJobIds).toEqual(["job:running"]);
    expect(recovered.jobs[0]).toMatchObject({
      status: "queued",
      lastError: "Plugin restarted during extraction."
    });
  });
});

function candidate(
  sourcePath: string,
  contentHash: string,
  extractionOptions: Record<string, unknown> = {}
): SourceExtractionCandidate {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  return {
    sourcePath,
    filename,
    extension,
    sizeBytes: 2048,
    contentHash,
    extractionOptions
  };
}

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source:paper",
    status: "extracted",
    sourcePath: "Sources/Papers/paper.pdf",
    filename: "paper.pdf",
    extension: ".pdf",
    sizeBytes: 2048,
    contentHash: "sha256:paper",
    importedAt: createdAt,
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Paper\n\nBody.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function job(overrides: Partial<SourceExtractionJobRecord> = {}): SourceExtractionJobRecord {
  const sourcePath = overrides.sourcePath ?? "Sources/Papers/manual.pdf";
  const contentHash = overrides.contentHash ?? "sha256:manual";
  const extractionOptions = overrides.extractionOptions ?? {};
  return {
    id: createSourceExtractionJobId("marker", sourcePath, contentHash, extractionOptions),
    extractorId: "marker",
    sourcePath,
    filename: sourcePath.split("/").pop() ?? sourcePath,
    extension: ".pdf",
    sizeBytes: 2048,
    contentHash,
    extractionOptions,
    status: "queued",
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    lastError: null,
    nextAttemptAt: null,
    ...overrides
  };
}
