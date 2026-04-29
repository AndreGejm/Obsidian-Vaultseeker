import {
  cancelEmbeddingJobs,
  planEmbeddingQueue,
  recoverRunningEmbeddingJobs,
  runEmbeddingWorkerBatch,
  type EmbeddingProviderPort,
  type EmbeddingJobRecord,
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

export type CancelSemanticIndexQueueOptions = {
  store: VaultseerStore;
  now: string;
};

export type CancelSemanticIndexQueueSummary = {
  cancelledJobCount: number;
  totalJobCount: number;
  remainingQueuedJobCount: number;
  remainingRunningJobCount: number;
};

export type RecoverSemanticIndexQueueOptions = {
  store: VaultseerStore;
  now: string;
};

export type RecoverSemanticIndexQueueSummary = {
  recoveredJobCount: number;
  totalJobCount: number;
  remainingRunningJobCount: number;
};

const RUNNING_JOB_RECOVERY_REASON = "Recovered after plugin restart before completion.";

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

export async function cancelSemanticIndexQueue(
  options: CancelSemanticIndexQueueOptions
): Promise<CancelSemanticIndexQueueSummary> {
  const jobs = await options.store.getEmbeddingJobRecords();
  const activeJobIds = jobs.filter(isActiveJob).map((job) => job.id);
  const result = cancelEmbeddingJobs({
    jobs,
    jobIds: activeJobIds,
    now: options.now
  });
  const persistedJobs = await options.store.replaceEmbeddingQueue(result.jobs);

  return {
    cancelledJobCount: result.changedJobIds.length,
    totalJobCount: persistedJobs.length,
    remainingQueuedJobCount: persistedJobs.filter((job) => job.status === "queued").length,
    remainingRunningJobCount: persistedJobs.filter((job) => job.status === "running").length
  };
}

function isActiveJob(job: EmbeddingJobRecord): boolean {
  return job.status === "queued" || job.status === "running";
}

export async function recoverSemanticIndexQueue(
  options: RecoverSemanticIndexQueueOptions
): Promise<RecoverSemanticIndexQueueSummary> {
  const jobs = await options.store.getEmbeddingJobRecords();
  const result = recoverRunningEmbeddingJobs({
    jobs,
    now: options.now,
    reason: RUNNING_JOB_RECOVERY_REASON
  });
  const persistedJobs = result.changedJobIds.length > 0
    ? await options.store.replaceEmbeddingQueue(result.jobs)
    : jobs;

  return {
    recoveredJobCount: result.changedJobIds.length,
    totalJobCount: persistedJobs.length,
    remainingRunningJobCount: persistedJobs.filter((job) => job.status === "running").length
  };
}
