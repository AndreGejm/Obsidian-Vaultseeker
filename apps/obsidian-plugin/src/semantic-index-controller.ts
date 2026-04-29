import {
  planEmbeddingQueue,
  runEmbeddingWorkerBatch,
  type EmbeddingProviderPort,
  type EmbeddingModelProfile,
  type EmbeddingWorkerBatchSummary,
  type VaultseerStore
} from "@vaultseer/core";

export type PlanSemanticIndexQueueOptions = {
  store: VaultseerStore;
  modelProfile: EmbeddingModelProfile;
  now: string;
  maxJobs: number;
};

export type SemanticIndexQueueSummary = {
  modelNamespace: string;
  queuedJobCount: number;
  reusableVectorCount: number;
  staleVectorCount: number;
  skippedByLimitCount: number;
};

export type RunSemanticIndexBatchOptions = {
  store: VaultseerStore;
  provider: EmbeddingProviderPort;
  modelProfile: EmbeddingModelProfile;
  now: string;
  batchSize: number;
  retryDelayMs: number;
  maxAttempts: number;
};

export async function planSemanticIndexQueue(options: PlanSemanticIndexQueueOptions): Promise<SemanticIndexQueueSummary> {
  const [chunks, vectors] = await Promise.all([
    options.store.getChunkRecords(),
    options.store.getVectorRecords()
  ]);
  const plan = planEmbeddingQueue({
    chunks,
    vectors,
    modelProfile: options.modelProfile,
    createdAt: options.now,
    maxJobs: options.maxJobs
  });

  await options.store.replaceEmbeddingQueue(plan.jobs);

  return {
    modelNamespace: plan.modelNamespace,
    queuedJobCount: plan.jobs.length,
    reusableVectorCount: plan.reusableVectorCount,
    staleVectorCount: plan.staleVectorCount,
    skippedByLimitCount: plan.skippedByLimitCount
  };
}

export async function runSemanticIndexBatch(options: RunSemanticIndexBatchOptions): Promise<EmbeddingWorkerBatchSummary> {
  return runEmbeddingWorkerBatch({
    store: options.store,
    provider: options.provider,
    modelProfile: options.modelProfile,
    now: options.now,
    batchSize: options.batchSize,
    retryDelayMs: options.retryDelayMs,
    maxAttempts: options.maxAttempts
  });
}
