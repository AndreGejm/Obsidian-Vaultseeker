import { buildVaultSnapshot, compareFileVersions, type IndexHealth, type NoteRecordInput, type VaultseerStore } from "@vaultseer/core";

export type RebuildReadOnlyIndexOptions = {
  readNoteInputs: () => Promise<NoteRecordInput[]>;
  store: VaultseerStore;
  excludedFolders: string[];
  now: () => string;
};

export type CheckReadOnlyIndexStalenessOptions = Omit<RebuildReadOnlyIndexOptions, "now">;

export async function rebuildReadOnlyIndex(options: RebuildReadOnlyIndexOptions): Promise<IndexHealth> {
  await options.store.beginIndexing(options.now());

  try {
    const inputs = await options.readNoteInputs();
    const includedInputs = inputs.filter((input) => !isExcluded(input.path, options.excludedFolders));
    const snapshot = buildVaultSnapshot(includedInputs);
    return options.store.replaceNoteIndex(snapshot, options.now());
  } catch (error) {
    await options.store.markError(`Rebuild failed: ${getErrorMessage(error)}`);
    throw error;
  }
}

export async function clearReadOnlyIndex(store: VaultseerStore): Promise<IndexHealth> {
  return store.clear();
}

export async function checkReadOnlyIndexStaleness(options: CheckReadOnlyIndexStalenessOptions): Promise<IndexHealth> {
  const currentHealth = await options.store.getHealth();
  if (currentHealth.status === "empty") return currentHealth;

  const inputs = await options.readNoteInputs();
  const includedInputs = inputs.filter((input) => !isExcluded(input.path, options.excludedFolders));
  const snapshot = buildVaultSnapshot(includedInputs);
  const previousVersions = await options.store.getFileVersions();
  const currentVersions = snapshot.notes.map((note) => ({
    path: note.path,
    mtime: note.stat.mtime,
    size: note.stat.size,
    contentHash: note.contentHash
  }));
  const diff = compareFileVersions(previousVersions, currentVersions);

  if (!diff.isChanged) return currentHealth;
  return options.store.markStale(`Vault changed since last index: ${diff.summary}.`);
}

function isExcluded(path: string, excludedFolders: string[]): boolean {
  return excludedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
