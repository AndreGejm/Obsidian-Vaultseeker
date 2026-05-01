import {
  cancelEmbeddingJobs,
  getEmbeddingJobTargetKind,
  planEmbeddingQueue,
  planSourceEmbeddingQueue,
  recoverRunningEmbeddingJobs,
  runEmbeddingWorkerBatch,
  runSourceEmbeddingWorkerBatch,
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
  const [chunks, vectors, jobs] = await Promise.all([
    options.store.getChunkRecords(),
    options.store.getVectorRecords(),
    options.store.getEmbeddingJobRecords()
  ]);
  const plan = planEmbeddingQueue({
    chunks,
    vectors,
    modelProfile: options.modelProfile,
    createdAt: options.now,
    maxJobs: options.maxJobs
  });

  await options.store.replaceEmbeddingQueue([
    ...jobs.filter((job) => !isNoteJob(job)),
    ...plan.jobs
  ]);

  return {
    modelNamespace: plan.modelNamespace,
    queuedJobCount: plan.jobs.length,
    reusableVectorCount: plan.reusableVectorCount,
    staleVectorCount: plan.staleVectorCount,
    skippedByLimitCount: plan.skippedByLimitCount
  };
}

export async function planSourceSemanticIndexQueue(
  options: PlanSemanticIndexQueueOptions
): Promise<SemanticIndexQueueSummary> {
  const [sources, sourceChunks, vectors, jobs] = await Promise.all([
    options.store.getSourceRecords(),
    options.store.getSourceChunkRecords(),
    options.store.getVectorRecords(),
    options.store.getEmbeddingJobRecords()
  ]);
  const plan = planSourceEmbeddingQueue({
    sources,
    sourceChunks,
    vectors,
    modelProfile: options.modelProfile,
    createdAt: options.now,
    maxJobs: options.maxJobs
  });

  await options.store.replaceEmbeddingQueue([
    ...jobs.filter((job) => !isSourceJob(job)),
    ...plan.jobs
  ]);

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

export async function runSourceSemanticIndexBatch(
  options: RunSemanticIndexBatchOptions
): Promise<EmbeddingWorkerBatchSummary> {
  return runSourceEmbeddingWorkerBatch({
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
  const activeJobIds = jobs.filter(isNoteJob).filter(isActiveJob).map((job) => job.id);
  const result = cancelEmbeddingJobs({
    jobs,
    jobIds: activeJobIds,
    now: options.now
  });
  const persistedJobs = await options.store.replaceEmbeddingQueue(result.jobs);
  const persistedNoteJobs = persistedJobs.filter(isNoteJob);

  return {
    cancelledJobCount: result.changedJobIds.length,
    totalJobCount: persistedNoteJobs.length,
    remainingQueuedJobCount: persistedNoteJobs.filter((job) => job.status === "queued").length,
    remainingRunningJobCount: persistedNoteJobs.filter((job) => job.status === "running").length
  };
}

export async function cancelSourceSemanticIndexQueue(
  options: CancelSemanticIndexQueueOptions
): Promise<CancelSemanticIndexQueueSummary> {
  const jobs = await options.store.getEmbeddingJobRecords();
  const activeJobIds = jobs.filter(isSourceJob).filter(isActiveJob).map((job) => job.id);
  const result = cancelEmbeddingJobs({
    jobs,
    jobIds: activeJobIds,
    now: options.now
  });
  const persistedJobs = await options.store.replaceEmbeddingQueue(result.jobs);
  const persistedSourceJobs = persistedJobs.filter(isSourceJob);

  return {
    cancelledJobCount: result.changedJobIds.length,
    totalJobCount: persistedSourceJobs.length,
    remainingQueuedJobCount: persistedSourceJobs.filter((job) => job.status === "queued").length,
    remainingRunningJobCount: persistedSourceJobs.filter((job) => job.status === "running").length
  };
}

function isActiveJob(job: EmbeddingJobRecord): boolean {
  return job.status === "queued" || job.status === "running";
}

function isNoteJob(job: EmbeddingJobRecord): boolean {
  return getEmbeddingJobTargetKind(job) === "note";
}

function isSourceJob(job: EmbeddingJobRecord): boolean {
  return getEmbeddingJobTargetKind(job) === "source";
}

export async function recoverSemanticIndexQueue(
  options: RecoverSemanticIndexQueueOptions
): Promise<RecoverSemanticIndexQueueSummary> {
  const jobs = await options.store.getEmbeddingJobRecords();
  const preservedJobs = jobs.filter((job) => !isNoteJob(job));
  const noteJobs = jobs.filter(isNoteJob);
  const result = recoverRunningEmbeddingJobs({
    jobs: noteJobs,
    now: options.now,
    reason: RUNNING_JOB_RECOVERY_REASON
  });
  const persistedJobs = result.changedJobIds.length > 0
    ? await options.store.replaceEmbeddingQueue([...preservedJobs, ...result.jobs])
    : jobs;
  const persistedNoteJobs = persistedJobs.filter(isNoteJob);

  return {
    recoveredJobCount: result.changedJobIds.length,
    totalJobCount: persistedNoteJobs.length,
    remainingRunningJobCount: persistedNoteJobs.filter((job) => job.status === "running").length
  };
}

export async function recoverSourceSemanticIndexQueue(
  options: RecoverSemanticIndexQueueOptions
): Promise<RecoverSemanticIndexQueueSummary> {
  const jobs = await options.store.getEmbeddingJobRecords();
  const preservedJobs = jobs.filter((job) => !isSourceJob(job));
  const sourceJobs = jobs.filter(isSourceJob);
  const result = recoverRunningEmbeddingJobs({
    jobs: sourceJobs,
    now: options.now,
    reason: RUNNING_JOB_RECOVERY_REASON
  });
  const persistedJobs = result.changedJobIds.length > 0
    ? await options.store.replaceEmbeddingQueue([...preservedJobs, ...result.jobs])
    : jobs;
  const persistedSourceJobs = persistedJobs.filter(isSourceJob);

  return {
    recoveredJobCount: result.changedJobIds.length,
    totalJobCount: persistedSourceJobs.length,
    remainingRunningJobCount: persistedSourceJobs.filter((job) => job.status === "running").length
  };
}
