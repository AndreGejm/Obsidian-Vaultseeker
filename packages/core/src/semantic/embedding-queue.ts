import type { ChunkRecord, EmbeddingJobRecord, EmbeddingJobStatus, VectorRecord } from "../storage/types";
import type { SourceChunkRecord, SourceRecord } from "../source/types";

export type EmbeddingModelProfile = {
  providerId: string;
  modelId: string;
  dimensions: number;
};

export type { EmbeddingJobRecord, EmbeddingJobStatus };

export type EmbeddingQueuePlan = {
  modelNamespace: string;
  jobs: EmbeddingJobRecord[];
  reusableVectorCount: number;
  staleVectorCount: number;
  skippedByLimitCount: number;
};

export type PlanEmbeddingQueueInput = {
  chunks: ChunkRecord[];
  vectors: VectorRecord[];
  modelProfile: EmbeddingModelProfile;
  createdAt: string;
  maxJobs?: number;
};

export type PlanSourceEmbeddingQueueInput = {
  sources: SourceRecord[];
  sourceChunks: SourceChunkRecord[];
  vectors: VectorRecord[];
  modelProfile: EmbeddingModelProfile;
  createdAt: string;
  maxJobs?: number;
};

export type EmbeddingQueueTransitionResult = {
  jobs: EmbeddingJobRecord[];
  changedJobIds: string[];
};

export type ClaimEmbeddingJobsInput = {
  jobs: EmbeddingJobRecord[];
  now: string;
  limit: number;
};

export type ClaimEmbeddingJobsResult = EmbeddingQueueTransitionResult & {
  claimedJobIds: string[];
};

export type CompleteEmbeddingJobInput = {
  jobs: EmbeddingJobRecord[];
  jobId: string;
  now: string;
};

export type CancelEmbeddingJobsInput = {
  jobs: EmbeddingJobRecord[];
  jobIds: string[];
  now: string;
};

export type FailEmbeddingJobInput = {
  jobs: EmbeddingJobRecord[];
  jobId: string;
  error: string;
  now: string;
  retryDelayMs: number;
  maxAttempts: number;
};

export type RecoverRunningEmbeddingJobsInput = {
  jobs: EmbeddingJobRecord[];
  now: string;
  reason: string;
};

export function buildVectorNamespace(profile: EmbeddingModelProfile): string {
  const providerId = profile.providerId.trim();
  const modelId = profile.modelId.trim();

  if (!providerId) throw new Error("Embedding provider id is required.");
  if (!modelId) throw new Error("Embedding model id is required.");
  if (!Number.isInteger(profile.dimensions) || profile.dimensions <= 0) {
    throw new Error("Embedding dimensions must be a positive integer.");
  }

  return `${providerId}/${modelId}:${profile.dimensions}`;
}

export function createEmbeddingJobId(modelNamespace: string, chunkId: string, contentHash: string): string {
  return `embedding-job:${encodeJobIdSegment(modelNamespace)}:${encodeJobIdSegment(chunkId)}:${encodeJobIdSegment(contentHash)}`;
}

export function planEmbeddingQueue(input: PlanEmbeddingQueueInput): EmbeddingQueuePlan {
  return planCandidateEmbeddingQueue({
    candidates: input.chunks.map((chunk) => ({
      id: chunk.id,
      contentHash: chunk.normalizedTextHash,
      createJob: (modelNamespace) => ({
        id: createEmbeddingJobId(modelNamespace, chunk.id, chunk.normalizedTextHash),
        chunkId: chunk.id,
        notePath: chunk.notePath,
        modelNamespace,
        contentHash: chunk.normalizedTextHash,
        status: "queued",
        attemptCount: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        lastError: null,
        nextAttemptAt: null
      })
    })),
    vectors: input.vectors,
    modelProfile: input.modelProfile,
    maxJobs: input.maxJobs
  });
}

export function planSourceEmbeddingQueue(input: PlanSourceEmbeddingQueueInput): EmbeddingQueuePlan {
  const extractedSourceIds = new Set(
    input.sources.filter((source) => source.status === "extracted").map((source) => source.id)
  );

  return planCandidateEmbeddingQueue({
    candidates: input.sourceChunks
      .filter((chunk) => extractedSourceIds.has(chunk.sourceId))
      .map((chunk) => ({
        id: chunk.id,
        contentHash: chunk.normalizedTextHash,
        createJob: (modelNamespace) => ({
          id: createEmbeddingJobId(modelNamespace, chunk.id, chunk.normalizedTextHash),
          targetKind: "source" as const,
          chunkId: chunk.id,
          sourceId: chunk.sourceId,
          sourcePath: chunk.sourcePath,
          modelNamespace,
          contentHash: chunk.normalizedTextHash,
          status: "queued",
          attemptCount: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
          lastError: null,
          nextAttemptAt: null
        })
      })),
    vectors: input.vectors,
    modelProfile: input.modelProfile,
    maxJobs: input.maxJobs
  });
}

type EmbeddingQueueCandidate = {
  id: string;
  contentHash: string;
  createJob: (modelNamespace: string) => EmbeddingJobRecord;
};

type PlanCandidateEmbeddingQueueInput = {
  candidates: EmbeddingQueueCandidate[];
  vectors: VectorRecord[];
  modelProfile: EmbeddingModelProfile;
  maxJobs: number | undefined;
};

function planCandidateEmbeddingQueue(input: PlanCandidateEmbeddingQueueInput): EmbeddingQueuePlan {
  const modelNamespace = buildVectorNamespace(input.modelProfile);
  const maxJobs = input.maxJobs ?? Number.POSITIVE_INFINITY;
  const vectorsByChunkId = groupVectorsByChunkId(input.vectors);
  const jobs: EmbeddingJobRecord[] = [];
  let reusableVectorCount = 0;
  let staleVectorCount = 0;
  let skippedByLimitCount = 0;

  for (const candidate of input.candidates) {
    const chunkVectors = vectorsByChunkId.get(candidate.id) ?? [];
    const namespaceVectors = chunkVectors.filter(
      (vector) => vector.model === modelNamespace && vector.dimensions === input.modelProfile.dimensions
    );
    const reusableVector = namespaceVectors.find((vector) => vector.contentHash === candidate.contentHash);

    if (reusableVector) {
      reusableVectorCount += 1;
      continue;
    }

    if (namespaceVectors.length > 0) {
      staleVectorCount += 1;
    }

    if (jobs.length >= maxJobs) {
      skippedByLimitCount += 1;
      continue;
    }

    jobs.push(candidate.createJob(modelNamespace));
  }

  return {
    modelNamespace,
    jobs,
    reusableVectorCount,
    staleVectorCount,
    skippedByLimitCount
  };
}

export function claimEmbeddingJobs(input: ClaimEmbeddingJobsInput): ClaimEmbeddingJobsResult {
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

export function completeEmbeddingJob(input: CompleteEmbeddingJobInput): EmbeddingQueueTransitionResult {
  return updateOneJob(input.jobs, input.jobId, (job) => ({
    ...job,
    status: "completed",
    updatedAt: input.now,
    lastError: null,
    nextAttemptAt: null
  }));
}

export function cancelEmbeddingJobs(input: CancelEmbeddingJobsInput): EmbeddingQueueTransitionResult {
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

export function failEmbeddingJob(input: FailEmbeddingJobInput): EmbeddingQueueTransitionResult {
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

export function recoverRunningEmbeddingJobs(input: RecoverRunningEmbeddingJobsInput): EmbeddingQueueTransitionResult {
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

function groupVectorsByChunkId(vectors: VectorRecord[]): Map<string, VectorRecord[]> {
  const grouped = new Map<string, VectorRecord[]>();

  for (const vector of vectors) {
    grouped.set(vector.chunkId, [...(grouped.get(vector.chunkId) ?? []), vector]);
  }

  return grouped;
}

function encodeJobIdSegment(value: string): string {
  return encodeURIComponent(value);
}

function updateOneJob(
  jobs: EmbeddingJobRecord[],
  jobId: string,
  update: (job: EmbeddingJobRecord) => EmbeddingJobRecord
): EmbeddingQueueTransitionResult {
  let changed = false;
  const nextJobs = jobs.map((job) => {
    if (job.id !== jobId) return cloneJob(job);
    changed = true;
    return update(cloneJob(job));
  });

  return { jobs: nextJobs, changedJobIds: changed ? [jobId] : [] };
}

function isClaimable(job: EmbeddingJobRecord, now: string): boolean {
  return job.status === "queued" && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= Date.parse(now));
}

function addMilliseconds(isoTimestamp: string, milliseconds: number): string {
  return new Date(Date.parse(isoTimestamp) + Math.max(0, milliseconds)).toISOString();
}

function cloneJobs(jobs: EmbeddingJobRecord[]): EmbeddingJobRecord[] {
  return jobs.map(cloneJob);
}

function cloneJob(job: EmbeddingJobRecord): EmbeddingJobRecord {
  return { ...job };
}
