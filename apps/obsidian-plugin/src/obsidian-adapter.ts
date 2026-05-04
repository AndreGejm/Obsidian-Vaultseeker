import type { NoteRecordInput } from "@vaultseer/core";
import { mapObsidianFileToNoteInput, type ObsidianLikeCache, type ObsidianLikeFile } from "./metadata-mapper";
import { validateVaultRelativePath, VaultPathPolicyError } from "./vault-path-policy";

export type VaultReaderApp = {
  vault: {
    getMarkdownFiles(): ObsidianLikeFile[];
    cachedRead(file: ObsidianLikeFile): Promise<string>;
  };
  metadataCache: {
    getFileCache(file: ObsidianLikeFile): ObsidianLikeCache | null | undefined;
  };
};

export type ObsidianLikeVaultFile = ObsidianLikeFile & {
  name: string;
  extension?: string;
};

export type VaultAssetRecord = {
  path: string;
  filename: string;
  basename: string;
  extension: string;
  mimeType: string | null;
  sizeBytes: number;
  modifiedTime: number;
  contentHash: string;
};

export type VaultAssetReaderApp = {
  vault: {
    getFiles(): ObsidianLikeVaultFile[];
  };
};

export type ReadVaultAssetRecordsOptions = {
  extensions?: string[];
};

const MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

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

export function readVaultAssetRecords(
  app: VaultAssetReaderApp,
  options: ReadVaultAssetRecordsOptions = {}
): VaultAssetRecord[] {
  const allowedExtensions = normalizeExtensionSet(options.extensions);

  return app.vault
    .getFiles()
    .flatMap((file) => {
      const extension = normalizeExtension(file.extension || getFileExtension(file.name || file.path));
      if (extension.length === 0 || extension === ".md" || extension === ".markdown") {
        return [];
      }
      if (allowedExtensions && !allowedExtensions.has(extension)) {
        return [];
      }

      let path: string;
      try {
        path = validateVaultRelativePath(file.path);
      } catch (error) {
        if (error instanceof VaultPathPolicyError) {
          return [];
        }
        throw error;
      }

      return [
        {
          path,
          filename: file.name || getFilename(path),
          basename: file.basename,
          extension,
          mimeType: MIME_TYPE_BY_EXTENSION.get(extension) ?? null,
          sizeBytes: file.stat.size,
          modifiedTime: file.stat.mtime,
          contentHash: `vault-file:${file.stat.size}:${file.stat.mtime}`
        }
      ];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeExtensionSet(value: string[] | undefined): Set<string> | null {
  if (!value || value.length === 0) {
    return null;
  }

  return new Set(value.map(normalizeExtension).filter((extension) => extension.length > 0));
}

function normalizeExtension(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function getFileExtension(path: string): string {
  const filename = getFilename(path);
  const index = filename.lastIndexOf(".");
  return index <= 0 ? "" : filename.slice(index);
}

function getFilename(path: string): string {
  return path.split("/").pop() || path;
}

