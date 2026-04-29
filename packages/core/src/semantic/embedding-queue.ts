import type { ChunkRecord, EmbeddingJobRecord, EmbeddingJobStatus, VectorRecord } from "../storage/types";

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
  const modelNamespace = buildVectorNamespace(input.modelProfile);
  const maxJobs = input.maxJobs ?? Number.POSITIVE_INFINITY;
  const vectorsByChunkId = groupVectorsByChunkId(input.vectors);
  const jobs: EmbeddingJobRecord[] = [];
  let reusableVectorCount = 0;
  let staleVectorCount = 0;
  let skippedByLimitCount = 0;

  for (const chunk of input.chunks) {
    const chunkVectors = vectorsByChunkId.get(chunk.id) ?? [];
    const namespaceVectors = chunkVectors.filter(
      (vector) => vector.model === modelNamespace && vector.dimensions === input.modelProfile.dimensions
    );
    const reusableVector = namespaceVectors.find((vector) => vector.contentHash === chunk.normalizedTextHash);

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

    jobs.push({
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
    });
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
