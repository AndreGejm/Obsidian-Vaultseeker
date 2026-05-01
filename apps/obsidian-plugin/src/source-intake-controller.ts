import {
  BuiltInTextSourceExtractor,
  hashString,
  isBuiltInTextSourceExtension,
  type SourceChunkRecord,
  type SourceExtractorFailureMode,
  type SourceRecord,
  type VaultseerStore
} from "@vaultseer/core";

export type ImportVaultTextSourceWorkspaceInput = {
  store: VaultseerStore;
  sourcePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  readText: () => Promise<string>;
  now: () => string;
};

export type ImportVaultTextSourceWorkspaceSummary =
  | {
      status: "extracted";
      sourceId: string;
      sourcePath: string;
      chunkCount: number;
      message: string;
    }
  | {
      status: "failed";
      sourceId: string;
      sourcePath: string;
      chunkCount: 0;
      failureMode: SourceExtractorFailureMode;
      message: string;
    };

export async function importVaultTextSourceWorkspace(
  input: ImportVaultTextSourceWorkspaceInput
): Promise<ImportVaultTextSourceWorkspaceSummary> {
  const extractor = new BuiltInTextSourceExtractor();
  const extension = normalizeExtension(input.extension);
  let textContent: string | undefined;
  let contentHash = `unread:${hashString(input.sourcePath)}`;

  if (isBuiltInTextSourceExtension(extension)) {
    try {
      textContent = await input.readText();
      contentHash = `fnv1a:${hashString(textContent)}`;
    } catch {
      contentHash = `read_failed:${hashString(input.sourcePath)}`;
    }
  }

  const result = await extractor.extract({
    sourcePath: input.sourcePath,
    filename: input.filename,
    extension,
    sizeBytes: input.sizeBytes,
    contentHash,
    importedAt: input.now(),
    ...(typeof textContent === "string" ? { textContent } : {}),
    options: {
      intake: "obsidian-active-file"
    }
  });
  const source = result.source;
  const chunks = result.ok ? result.chunks : [];

  await replaceStoredSourceWorkspace(input.store, source, chunks);

  if (result.ok) {
    return {
      status: "extracted",
      sourceId: source.id,
      sourcePath: source.sourcePath,
      chunkCount: chunks.length,
      message: `Imported ${source.filename} as a searchable source workspace.`
    };
  }

  return {
    status: "failed",
    sourceId: source.id,
    sourcePath: source.sourcePath,
    chunkCount: 0,
    failureMode: result.failureMode,
    message: `Could not import ${source.filename}: ${result.failureMode}.`
  };
}

async function replaceStoredSourceWorkspace(
  store: VaultseerStore,
  source: SourceRecord,
  chunks: SourceChunkRecord[]
): Promise<void> {
  const [existingSources, existingChunks] = await Promise.all([
    store.getSourceRecords(),
    store.getSourceChunkRecords()
  ]);
  const nextSources = [
    ...existingSources.filter((existing) => existing.id !== source.id && existing.sourcePath !== source.sourcePath),
    source
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const nextChunks = [
    ...existingChunks.filter((existing) => existing.sourceId !== source.id && existing.sourcePath !== source.sourcePath),
    ...chunks
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.ordinal - right.ordinal);

  await store.replaceSourceWorkspace(nextSources, nextChunks);
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}
