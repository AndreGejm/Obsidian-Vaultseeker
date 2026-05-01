import type { VaultseerStore } from "../storage/types";
import type {
  SourceChunkRecord,
  SourceExtractionJobRecord,
  SourceExtractorPort,
  SourceRecord
} from "./types";
import {
  claimSourceExtractionJobs,
  completeSourceExtractionJob,
  failSourceExtractionJob
} from "./source-extraction-queue";

export type RunSourceExtractionWorkerBatchInput = {
  store: VaultseerStore;
  extractor: SourceExtractorPort;
  now: string;
  batchSize: number;
  retryDelayMs: number;
  maxAttempts: number;
};

export type SourceExtractionWorkerBatchSummary = {
  claimed: number;
  completed: number;
  failed: number;
  sourceCount: number;
  chunkCount: number;
};

export async function runSourceExtractionWorkerBatch(
  input: RunSourceExtractionWorkerBatchInput
): Promise<SourceExtractionWorkerBatchSummary> {
  const storedJobs = await input.store.getSourceExtractionJobRecords();
  const preservedJobs = storedJobs.filter((job) => job.extractorId !== input.extractor.id);
  const extractorJobs = storedJobs.filter((job) => job.extractorId === input.extractor.id);
  const claim = claimSourceExtractionJobs({
    jobs: extractorJobs,
    now: input.now,
    limit: input.batchSize
  });
  let jobs = claim.jobs;
  let completed = 0;
  let failed = 0;

  if (claim.claimedJobIds.length === 0) {
    const [sources, chunks] = await Promise.all([
      input.store.getSourceRecords(),
      input.store.getSourceChunkRecords()
    ]);
    return { claimed: 0, completed: 0, failed: 0, sourceCount: sources.length, chunkCount: chunks.length };
  }

  await input.store.replaceSourceExtractionQueue(sortJobs([...preservedJobs, ...jobs]));

  const claimedJobs = jobs.filter((job) => claim.claimedJobIds.includes(job.id));
  for (const job of claimedJobs) {
    try {
      const result = await input.extractor.extract({
        sourcePath: job.sourcePath,
        filename: job.filename,
        extension: job.extension,
        sizeBytes: job.sizeBytes,
        contentHash: job.contentHash,
        importedAt: input.now,
        options: job.extractionOptions
      });

      await replaceStoredSourceWorkspace(input.store, result.source, result.ok ? result.chunks : []);

      if (result.ok) {
        jobs = completeSourceExtractionJob({ jobs, jobId: job.id, now: input.now }).jobs;
        completed += 1;
      } else {
        jobs = failSourceExtractionJob({
          jobs,
          jobId: job.id,
          error: `Source extraction failed: ${result.failureMode}`,
          now: input.now,
          retryDelayMs: input.retryDelayMs,
          maxAttempts: input.maxAttempts
        }).jobs;
        failed += 1;
      }
    } catch (error) {
      jobs = failSourceExtractionJob({
        jobs,
        jobId: job.id,
        error: getErrorMessage(error),
        now: input.now,
        retryDelayMs: input.retryDelayMs,
        maxAttempts: input.maxAttempts
      }).jobs;
      failed += 1;
    }
  }

  await input.store.replaceSourceExtractionQueue(sortJobs([...preservedJobs, ...jobs]));
  const [sources, chunks] = await Promise.all([
    input.store.getSourceRecords(),
    input.store.getSourceChunkRecords()
  ]);

  return {
    claimed: claim.claimedJobIds.length,
    completed,
    failed,
    sourceCount: sources.length,
    chunkCount: chunks.length
  };
}

async function replaceStoredSourceWorkspace(
  store: VaultseerStore,
  source: SourceRecord,
  chunks: SourceChunkRecord[]
): Promise<void> {
  const [existingSources, existingChunks] = await Promise.all([
    store.getSourceRecords(),
    store.getSourceChunkRecords()
  ]);
  const nextSources = [
    ...existingSources.filter((existing) => existing.id !== source.id && existing.sourcePath !== source.sourcePath),
    source
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const nextChunks = [
    ...existingChunks.filter((existing) => existing.sourceId !== source.id && existing.sourcePath !== source.sourcePath),
    ...chunks
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.ordinal - right.ordinal);

  await store.replaceSourceWorkspace(nextSources, nextChunks);
}

function sortJobs(jobs: SourceExtractionJobRecord[]): SourceExtractionJobRecord[] {
  return [...jobs].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.id.localeCompare(right.id));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
