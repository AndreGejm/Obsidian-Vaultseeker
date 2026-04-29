import {
  planEmbeddingQueue,
  type EmbeddingModelProfile,
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
