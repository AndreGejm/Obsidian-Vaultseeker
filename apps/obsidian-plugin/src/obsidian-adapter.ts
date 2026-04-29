import type { NoteRecordInput } from "@vaultseer/core";
import { mapObsidianFileToNoteInput, type ObsidianLikeCache, type ObsidianLikeFile } from "./metadata-mapper";

export type VaultReaderApp = {
  vault: {
    getMarkdownFiles(): ObsidianLikeFile[];
    cachedRead(file: ObsidianLikeFile): Promise<string>;
  };
  metadataCache: {
    getFileCache(file: ObsidianLikeFile): ObsidianLikeCache | null | undefined;
  };
};

export async function readVaultNoteInputs(app: VaultReaderApp): Promise<NoteRecordInput[]> {
  const files = app.vault.getMarkdownFiles();

  return Promise.all(
    files.map(async (file) => {
      const content = await app.vault.cachedRead(file);
      const cache = app.metadataCache.getFileCache(file);
      return mapObsidianFileToNoteInput(file, content, cache);
    })
  );
}

