import type { ChunkRecord, EmbeddingJobRecord, VaultseerStore, VectorRecord } from "../storage/types";
import {
  buildVectorNamespace,
  claimEmbeddingJobs,
  completeEmbeddingJob,
  failEmbeddingJob,
  type EmbeddingModelProfile
} from "./embedding-queue";

export interface EmbeddingProviderPort {
  embedTexts(texts: string[]): Promise<number[][]>;
}

export type RunEmbeddingWorkerBatchInput = {
  store: VaultseerStore;
  provider: EmbeddingProviderPort;
  modelProfile: EmbeddingModelProfile;
  now: string;
  batchSize: number;
  retryDelayMs: number;
  maxAttempts: number;
};

export type EmbeddingWorkerBatchSummary = {
  claimed: number;
  completed: number;
  failed: number;
  vectorCount: number;
};

type ClaimableJob = {
  job: EmbeddingJobRecord;
  chunk: ChunkRecord;
};

export async function runEmbeddingWorkerBatch(input: RunEmbeddingWorkerBatchInput): Promise<EmbeddingWorkerBatchSummary> {
  const [storedJobs, chunks, storedVectors] = await Promise.all([
    input.store.getEmbeddingJobRecords(),
    input.store.getChunkRecords(),
    input.store.getVectorRecords()
  ]);
  const claim = claimEmbeddingJobs({
    jobs: storedJobs,
    now: input.now,
    limit: input.batchSize
  });
  let jobs = claim.jobs;
  let vectors = storedVectors;
  let completed = 0;
  let failed = 0;

  if (claim.claimedJobIds.length === 0) {
    return { claimed: 0, completed: 0, failed: 0, vectorCount: vectors.length };
  }

  await input.store.replaceEmbeddingQueue(jobs);

  const claimedJobs = jobs.filter((job) => claim.claimedJobIds.includes(job.id));
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const claimableJobs: ClaimableJob[] = [];

  for (const job of claimedJobs) {
    const chunk = chunkById.get(job.chunkId);
    if (!chunk) {
      jobs = failEmbeddingJob({
        jobs,
        jobId: job.id,
        error: `Chunk '${job.chunkId}' is no longer indexed.`,
        now: input.now,
        retryDelayMs: input.retryDelayMs,
        maxAttempts: input.maxAttempts
      }).jobs;
      failed += 1;
      continue;
    }
    claimableJobs.push({ job, chunk });
  }

  if (claimableJobs.length > 0) {
    try {
      const newVectors = await embedClaimedChunks(input, claimableJobs);
      vectors = mergeVectorRecords(vectors, newVectors);

      for (const { job } of claimableJobs) {
        jobs = completeEmbeddingJob({ jobs, jobId: job.id, now: input.now }).jobs;
      }
      completed += claimableJobs.length;
    } catch (error) {
      for (const { job } of claimableJobs) {
        jobs = failEmbeddingJob({
          jobs,
          jobId: job.id,
          error: getErrorMessage(error),
          now: input.now,
          retryDelayMs: input.retryDelayMs,
          maxAttempts: input.maxAttempts
        }).jobs;
      }
      failed += claimableJobs.length;
    }
  }

  await input.store.replaceVectorRecords(vectors);
  await input.store.replaceEmbeddingQueue(jobs);

  return {
    claimed: claim.claimedJobIds.length,
    completed,
    failed,
    vectorCount: vectors.length
  };
}

async function embedClaimedChunks(input: RunEmbeddingWorkerBatchInput, claimedJobs: ClaimableJob[]): Promise<VectorRecord[]> {
  const modelNamespace = buildVectorNamespace(input.modelProfile);
  const embeddings = await input.provider.embedTexts(claimedJobs.map(({ chunk }) => chunk.text));

  if (embeddings.length !== claimedJobs.length) {
    throw new Error(`Embedding provider returned ${embeddings.length} vectors for ${claimedJobs.length} chunks.`);
  }

  return embeddings.map((embedding, index) => {
    if (embedding.length !== input.modelProfile.dimensions) {
      throw new Error(
        `Embedding for chunk ${index} returned ${embedding.length} dimensions; expected ${input.modelProfile.dimensions}.`
      );
    }

    const { chunk } = claimedJobs[index]!;
    return {
      chunkId: chunk.id,
      model: modelNamespace,
      dimensions: input.modelProfile.dimensions,
      contentHash: chunk.normalizedTextHash,
      vector: [...embedding],
      embeddedAt: input.now
    };
  });
}

function mergeVectorRecords(existingVectors: VectorRecord[], newVectors: VectorRecord[]): VectorRecord[] {
  const replacementKeys = new Set(newVectors.map((vector) => vectorKey(vector)));
  return [
    ...existingVectors.filter((vector) => !replacementKeys.has(vectorKey(vector))),
    ...newVectors
  ];
}

function vectorKey(vector: Pick<VectorRecord, "chunkId" | "model">): string {
  return `${vector.model}:${vector.chunkId}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
