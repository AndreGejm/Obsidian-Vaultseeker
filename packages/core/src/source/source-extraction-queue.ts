import { hashString } from "../chunking/text-chunking";
import type {
  SourceExtractionCandidate,
  SourceExtractionJobRecord,
  SourceRecord
} from "./types";

export type SourceExtractionQueuePlan = {
  jobs: SourceExtractionJobRecord[];
  reusableSourceCount: number;
  staleSourceCount: number;
  alreadyQueuedCount: number;
  failedSourceCount: number;
  skippedByLimitCount: number;
};

export type PlanSourceExtractionQueueInput = {
  extractorId: string;
  candidates: SourceExtractionCandidate[];
  sourceRecords: SourceRecord[];
  jobs: SourceExtractionJobRecord[];
  createdAt: string;
  maxJobs?: number;
  retryFailedSources?: boolean;
};

export type SourceExtractionQueueTransitionResult = {
  jobs: SourceExtractionJobRecord[];
  changedJobIds: string[];
};

export type ClaimSourceExtractionJobsInput = {
  jobs: SourceExtractionJobRecord[];
  now: string;
  limit: number;
};

export type ClaimSourceExtractionJobsResult = SourceExtractionQueueTransitionResult & {
  claimedJobIds: string[];
};

export type CompleteSourceExtractionJobInput = {
  jobs: SourceExtractionJobRecord[];
  jobId: string;
  now: string;
};

export type CancelSourceExtractionJobsInput = {
  jobs: SourceExtractionJobRecord[];
  jobIds: string[];
  now: string;
};

export type FailSourceExtractionJobInput = {
  jobs: SourceExtractionJobRecord[];
  jobId: string;
  error: string;
  now: string;
  retryDelayMs: number;
  maxAttempts: number;
};

export type RecoverRunningSourceExtractionJobsInput = {
  jobs: SourceExtractionJobRecord[];
  now: string;
  reason: string;
};

export function createSourceExtractionJobId(
  extractorId: string,
  sourcePath: string,
  contentHash: string,
  extractionOptions: Record<string, unknown> = {}
): string {
  const optionsHash = hashString(stableStringify(extractionOptions));
  return [
    "source-extraction-job",
    encodeJobIdSegment(extractorId),
    encodeJobIdSegment(sourcePath),
    encodeJobIdSegment(contentHash),
    optionsHash
  ].join(":");
}

export function planSourceExtractionQueue(input: PlanSourceExtractionQueueInput): SourceExtractionQueuePlan {
  const maxJobs = input.maxJobs === undefined ? Number.POSITIVE_INFINITY : Math.max(0, input.maxJobs);
  const activeJobIds = new Set(
    input.jobs
      .filter((job) => job.extractorId === input.extractorId && (job.status === "queued" || job.status === "running"))
      .map((job) => job.id)
  );
  const sourcesByPath = groupSourcesByPath(
    input.sourceRecords.filter((source) => source.extractor.id === input.extractorId)
  );

  const jobs: SourceExtractionJobRecord[] = [];
  let reusableSourceCount = 0;
  let staleSourceCount = 0;
  let alreadyQueuedCount = 0;
  let failedSourceCount = 0;
  let skippedByLimitCount = 0;

  for (const candidate of input.candidates) {
    const jobId = createSourceExtractionJobId(
      input.extractorId,
      candidate.sourcePath,
      candidate.contentHash,
      candidate.extractionOptions
    );
    const existingSources = sourcesByPath.get(candidate.sourcePath) ?? [];
    const matchingSource = existingSources.find((source) => sourceSignature(source) === candidateSignature(candidate));

    if (matchingSource?.status === "extracted") {
      reusableSourceCount += 1;
      continue;
    }

    if (matchingSource?.status === "failed" && !input.retryFailedSources) {
      failedSourceCount += 1;
      continue;
    }

    if (existingSources.length > 0 && !matchingSource) {
      staleSourceCount += 1;
    }

    if (activeJobIds.has(jobId)) {
      alreadyQueuedCount += 1;
      continue;
    }

    if (jobs.length >= maxJobs) {
      skippedByLimitCount += 1;
      continue;
    }

    jobs.push({
      id: jobId,
      extractorId: input.extractorId,
      sourcePath: candidate.sourcePath,
      filename: candidate.filename,
      extension: candidate.extension,
      sizeBytes: candidate.sizeBytes,
      contentHash: candidate.contentHash,
      extractionOptions: cloneOptions(candidate.extractionOptions),
      status: "queued",
      attemptCount: 0,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lastError: null,
      nextAttemptAt: null
    });
  }

  return {
    jobs,
    reusableSourceCount,
    staleSourceCount,
    alreadyQueuedCount,
    failedSourceCount,
    skippedByLimitCount
  };
}

export function claimSourceExtractionJobs(input: ClaimSourceExtractionJobsInput): ClaimSourceExtractionJobsResult {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    return { jobs: cloneJobs(input.jobs), changedJobIds: [], claimedJobIds: [] };
  }

  const claimedJobIds: string[] = [];
  const jobs = input.jobs.map((job) => {
    if (claimedJobIds.length >= input.limit || !isClaimable(job, input.now)) return cloneJob(job);

    claimedJobIds.push(job.id);
    return {
      ...cloneJob(job),
      status: "running" as const,
      updatedAt: input.now
    };
  });

  return { jobs, changedJobIds: claimedJobIds, claimedJobIds };
}

export function completeSourceExtractionJob(
  input: CompleteSourceExtractionJobInput
): SourceExtractionQueueTransitionResult {
  return updateOneJob(input.jobs, input.jobId, (job) => ({
    ...job,
    status: "completed",
    updatedAt: input.now,
    lastError: null,
    nextAttemptAt: null
  }));
}

export function cancelSourceExtractionJobs(
  input: CancelSourceExtractionJobsInput
): SourceExtractionQueueTransitionResult {
  const idsToCancel = new Set(input.jobIds);
  const changedJobIds: string[] = [];
  const jobs = input.jobs.map((job) => {
    if (!idsToCancel.has(job.id) || job.status === "completed" || job.status === "cancelled") return cloneJob(job);
    changedJobIds.push(job.id);
    return {
      ...cloneJob(job),
      status: "cancelled" as const,
      updatedAt: input.now,
      nextAttemptAt: null
    };
  });

  return { jobs, changedJobIds };
}

export function failSourceExtractionJob(input: FailSourceExtractionJobInput): SourceExtractionQueueTransitionResult {
  return updateOneJob(input.jobs, input.jobId, (job) => {
    const attemptCount = job.attemptCount + 1;
    const retryable = attemptCount < input.maxAttempts;

    return {
      ...job,
      status: retryable ? "queued" : "failed",
      attemptCount,
      updatedAt: input.now,
      lastError: input.error,
      nextAttemptAt: retryable ? addMilliseconds(input.now, input.retryDelayMs) : null
    };
  });
}

export function recoverRunningSourceExtractionJobs(
  input: RecoverRunningSourceExtractionJobsInput
): SourceExtractionQueueTransitionResult {
  const changedJobIds: string[] = [];
  const jobs = input.jobs.map((job) => {
    if (job.status !== "running") return cloneJob(job);

    changedJobIds.push(job.id);
    return {
      ...cloneJob(job),
      status: "queued" as const,
      updatedAt: input.now,
      lastError: input.reason,
      nextAttemptAt: null
    };
  });

  return { jobs, changedJobIds };
}

function groupSourcesByPath(sources: SourceRecord[]): Map<string, SourceRecord[]> {
  const grouped = new Map<string, SourceRecord[]>();
  for (const source of sources) {
    grouped.set(source.sourcePath, [...(grouped.get(source.sourcePath) ?? []), source]);
  }
  return grouped;
}

function sourceSignature(source: SourceRecord): string {
  return `${source.contentHash}\n${stableStringify(source.extractionOptions)}`;
}

function candidateSignature(candidate: SourceExtractionCandidate): string {
  return `${candidate.contentHash}\n${stableStringify(candidate.extractionOptions)}`;
}

function isClaimable(job: SourceExtractionJobRecord, now: string): boolean {
  return job.status === "queued" && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= Date.parse(now));
}

function updateOneJob(
  jobs: SourceExtractionJobRecord[],
  jobId: string,
  update: (job: SourceExtractionJobRecord) => SourceExtractionJobRecord
): SourceExtractionQueueTransitionResult {
  let changed = false;
  const nextJobs = jobs.map((job) => {
    if (job.id !== jobId) return cloneJob(job);
    changed = true;
    return update(cloneJob(job));
  });

  return { jobs: nextJobs, changedJobIds: changed ? [jobId] : [] };
}

function addMilliseconds(isoTimestamp: string, milliseconds: number): string {
  return new Date(Date.parse(isoTimestamp) + Math.max(0, milliseconds)).toISOString();
}

function encodeJobIdSegment(value: string): string {
  return encodeURIComponent(value);
}

function cloneJobs(jobs: SourceExtractionJobRecord[]): SourceExtractionJobRecord[] {
  return jobs.map(cloneJob);
}

function cloneJob(job: SourceExtractionJobRecord): SourceExtractionJobRecord {
  return {
    ...job,
    extractionOptions: cloneOptions(job.extractionOptions)
  };
}

function cloneOptions(options: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(options);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stabilize(value));
}

function stabilize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stabilize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => typeof entryValue !== "undefined")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stabilize(entryValue)])
  );
}
