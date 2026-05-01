import {
  cancelSourceExtractionJobs,
  planSourceExtractionQueue,
  recoverRunningSourceExtractionJobs,
  type SourceExtractionCandidate,
  type SourceExtractionJobRecord,
  type SourceExtractionJobStatus,
  type VaultseerStore
} from "@vaultseer/core";

export const MARKER_EXTRACTOR_ID = "marker";

export type SourceExtractionPlanFile = {
  path: string;
  name: string;
  extension: string;
  stat: {
    size: number;
    mtime: number;
  };
};

export type SourceExtractionQueueStatusSummary = {
  totalJobCount: number;
  queuedJobCount: number;
  runningJobCount: number;
  completedJobCount: number;
  failedJobCount: number;
  cancelledJobCount: number;
};

export type PlanMarkerSourceExtractionQueueOptions = {
  store: VaultseerStore;
  files: SourceExtractionPlanFile[];
  excludedFolders: string[];
  now: string;
  maxJobs: number;
};

export type PlanMarkerSourceExtractionQueueSummary = SourceExtractionQueueStatusSummary & {
  candidateCount: number;
  plannedJobCount: number;
  reusableSourceCount: number;
  staleSourceCount: number;
  alreadyQueuedCount: number;
  failedSourceCount: number;
  skippedByLimitCount: number;
};

export type SourceExtractionQueueControlOptions = {
  store: VaultseerStore;
  now: string;
};

export type CancelSourceExtractionQueueSummary = SourceExtractionQueueStatusSummary & {
  newlyCancelledJobCount: number;
};

export type RecoverSourceExtractionQueueSummary = SourceExtractionQueueStatusSummary & {
  recoveredJobCount: number;
};

const MARKER_EXTRACTION_OPTIONS = {
  preserveImages: true,
  preserveTables: true
};

const RUNNING_SOURCE_EXTRACTION_RECOVERY_REASON =
  "Recovered after plugin restart before source extraction completed.";

export async function planMarkerSourceExtractionQueue(
  options: PlanMarkerSourceExtractionQueueOptions
): Promise<PlanMarkerSourceExtractionQueueSummary> {
  const [sources, jobs] = await Promise.all([
    options.store.getSourceRecords(),
    options.store.getSourceExtractionJobRecords()
  ]);
  const candidates = buildMarkerSourceExtractionCandidates(options.files, options.excludedFolders);
  const plan = planSourceExtractionQueue({
    extractorId: MARKER_EXTRACTOR_ID,
    candidates,
    sourceRecords: sources,
    jobs,
    createdAt: options.now,
    maxJobs: options.maxJobs
  });
  const persistedJobs = await options.store.replaceSourceExtractionQueue(mergeSourceExtractionJobs(jobs, plan.jobs));

  return {
    candidateCount: candidates.length,
    plannedJobCount: plan.jobs.length,
    reusableSourceCount: plan.reusableSourceCount,
    staleSourceCount: plan.staleSourceCount,
    alreadyQueuedCount: plan.alreadyQueuedCount,
    failedSourceCount: plan.failedSourceCount,
    skippedByLimitCount: plan.skippedByLimitCount,
    ...summarizeJobs(persistedJobs)
  };
}

export async function summarizeSourceExtractionQueue(options: {
  store: VaultseerStore;
}): Promise<SourceExtractionQueueStatusSummary> {
  return summarizeJobs(await options.store.getSourceExtractionJobRecords());
}

export async function cancelSourceExtractionQueue(
  options: SourceExtractionQueueControlOptions
): Promise<CancelSourceExtractionQueueSummary> {
  const jobs = await options.store.getSourceExtractionJobRecords();
  const activeJobIds = jobs.filter(isActiveJob).map((job) => job.id);
  const result = cancelSourceExtractionJobs({
    jobs,
    jobIds: activeJobIds,
    now: options.now
  });
  const persistedJobs = result.changedJobIds.length > 0
    ? await options.store.replaceSourceExtractionQueue(result.jobs)
    : jobs;

  return {
    newlyCancelledJobCount: result.changedJobIds.length,
    ...summarizeJobs(persistedJobs)
  };
}

export async function recoverSourceExtractionQueue(
  options: SourceExtractionQueueControlOptions
): Promise<RecoverSourceExtractionQueueSummary> {
  const jobs = await options.store.getSourceExtractionJobRecords();
  const result = recoverRunningSourceExtractionJobs({
    jobs,
    now: options.now,
    reason: RUNNING_SOURCE_EXTRACTION_RECOVERY_REASON
  });
  const persistedJobs = result.changedJobIds.length > 0
    ? await options.store.replaceSourceExtractionQueue(result.jobs)
    : jobs;

  return {
    recoveredJobCount: result.changedJobIds.length,
    ...summarizeJobs(persistedJobs)
  };
}

function buildMarkerSourceExtractionCandidates(
  files: SourceExtractionPlanFile[],
  excludedFolders: string[]
): SourceExtractionCandidate[] {
  return files
    .filter((file) => normalizeExtension(file.extension || getFileExtension(file.name)) === ".pdf")
    .filter((file) => !isExcludedPath(file.path, excludedFolders))
    .map((file) => ({
      sourcePath: normalizeVaultPath(file.path),
      filename: file.name,
      extension: ".pdf",
      sizeBytes: file.stat.size,
      contentHash: createVaultFileFingerprint(file.stat.size, file.stat.mtime),
      extractionOptions: { ...MARKER_EXTRACTION_OPTIONS }
    }));
}

function mergeSourceExtractionJobs(
  existingJobs: SourceExtractionJobRecord[],
  plannedJobs: SourceExtractionJobRecord[]
): SourceExtractionJobRecord[] {
  const merged = new Map<string, SourceExtractionJobRecord>();
  for (const job of existingJobs) {
    merged.set(job.id, cloneJob(job));
  }
  for (const job of plannedJobs) {
    merged.set(job.id, cloneJob(job));
  }
  return [...merged.values()];
}

function summarizeJobs(jobs: SourceExtractionJobRecord[]): SourceExtractionQueueStatusSummary {
  return {
    totalJobCount: jobs.length,
    queuedJobCount: countStatus(jobs, "queued"),
    runningJobCount: countStatus(jobs, "running"),
    completedJobCount: countStatus(jobs, "completed"),
    failedJobCount: countStatus(jobs, "failed"),
    cancelledJobCount: countStatus(jobs, "cancelled")
  };
}

function countStatus(jobs: SourceExtractionJobRecord[], status: SourceExtractionJobStatus): number {
  return jobs.filter((job) => job.status === status).length;
}

function isActiveJob(job: SourceExtractionJobRecord): boolean {
  return job.status === "queued" || job.status === "running";
}

function createVaultFileFingerprint(size: number, mtime: number): string {
  return `vault-file:${size}:${mtime}`;
}

function isExcludedPath(path: string, excludedFolders: string[]): boolean {
  const normalizedPath = normalizeVaultPath(path).toLowerCase();
  return excludedFolders
    .map(normalizeVaultPath)
    .map((folder) => folder.toLowerCase())
    .filter(Boolean)
    .some((folder) => normalizedPath === folder || normalizedPath.startsWith(`${folder}/`));
}

function normalizeExtension(extension: string): string {
  if (!extension) return "";
  const trimmed = extension.trim().toLowerCase();
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot);
}

function normalizeVaultPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function cloneJob(job: SourceExtractionJobRecord): SourceExtractionJobRecord {
  return {
    ...job,
    extractionOptions: structuredClone(job.extractionOptions)
  };
}
