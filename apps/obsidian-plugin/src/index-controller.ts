import { buildVaultSnapshot, type IndexHealth, type NoteRecordInput, type VaultseerStore } from "@vaultseer/core";

export type RebuildReadOnlyIndexOptions = {
  readNoteInputs: () => Promise<NoteRecordInput[]>;
  store: VaultseerStore;
  excludedFolders: string[];
  now: () => string;
};

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

function isExcluded(path: string, excludedFolders: string[]): boolean {
  return excludedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
