import type { ChunkRecord, VectorRecord } from "../storage/types";

export type EmbeddingModelProfile = {
  providerId: string;
  modelId: string;
  dimensions: number;
};

export type EmbeddingJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type EmbeddingJobRecord = {
  id: string;
  chunkId: string;
  notePath: string;
  modelNamespace: string;
  contentHash: string;
  status: EmbeddingJobStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

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
      lastError: null
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
