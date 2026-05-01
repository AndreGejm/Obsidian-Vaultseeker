import { describe, expect, it } from "vitest";
import {
  createSourceExtractionJobId,
  InMemoryVaultseerStore,
  runSourceExtractionWorkerBatch,
  type SourceChunkRecord,
  type SourceExtractionInput,
  type SourceExtractionResult,
  type SourceExtractorCapability,
  type SourceExtractorDependency,
  type SourceExtractorPort,
  type SourceRecord
} from "../src";

const createdAt = "2026-05-01T10:30:00.000Z";
const workerNow = "2026-05-01T10:35:00.000Z";

class FakeSourceExtractor implements SourceExtractorPort {
  readonly id = "marker";
  readonly displayName = "Marker";
  readonly inputs: SourceExtractionInput[] = [];

  constructor(private readonly result: SourceExtractionResult | Error) {}

  listCapabilities(): SourceExtractorCapability[] {
    return [];
  }

  async checkDependencies(): Promise<SourceExtractorDependency[]> {
    return [];
  }

  async extract(input: SourceExtractionInput): Promise<SourceExtractionResult> {
    this.inputs.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("runSourceExtractionWorkerBatch", () => {
  it("extracts claimed source jobs, stores the source workspace, and completes the job", async () => {
    const store = new InMemoryVaultseerStore();
    const oldSource = source({
      id: "source:old",
      sourcePath: "Sources/Papers/paper.pdf",
      contentHash: "vault-file:old"
    });
    await store.replaceSourceWorkspace([oldSource], [sourceChunk({ sourceId: oldSource.id })]);
    await store.replaceSourceExtractionQueue([
      job({
        sourcePath: "Sources/Papers/paper.pdf",
        contentHash: "vault-file:200:20",
        extractionOptions: { preserveImages: true, preserveTables: true }
      })
    ]);
    const extractedSource = source({
      id: "source:new",
      sourcePath: "Sources/Papers/paper.pdf",
      contentHash: "vault-file:200:20",
      extractionOptions: { preserveImages: true, preserveTables: true }
    });
    const extractedChunk = sourceChunk({
      id: "source-chunk:new",
      sourceId: extractedSource.id,
      sourcePath: extractedSource.sourcePath
    });
    const extractor = new FakeSourceExtractor({
      ok: true,
      source: extractedSource,
      chunks: [extractedChunk]
    });

    const summary = await runSourceExtractionWorkerBatch({
      store,
      extractor,
      now: workerNow,
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      sourceCount: 1,
      chunkCount: 1
    });
    expect(extractor.inputs).toEqual([
      {
        sourcePath: "Sources/Papers/paper.pdf",
        filename: "paper.pdf",
        extension: ".pdf",
        sizeBytes: 2048,
        contentHash: "vault-file:200:20",
        importedAt: workerNow,
        options: { preserveImages: true, preserveTables: true }
      }
    ]);
    await expect(store.getSourceRecords()).resolves.toEqual([extractedSource]);
    await expect(store.getSourceChunkRecords()).resolves.toEqual([extractedChunk]);
    await expect(store.getSourceExtractionJobRecords()).resolves.toEqual([
      expect.objectContaining({
        sourcePath: "Sources/Papers/paper.pdf",
        status: "completed",
        updatedAt: workerNow,
        lastError: null,
        nextAttemptAt: null
      })
    ]);
  });

  it("stores failed source diagnostics and records retryable extraction failure", async () => {
    const store = new InMemoryVaultseerStore();
    const failedSource = source({
      status: "failed",
      extractedMarkdown: "",
      diagnostics: [
        {
          severity: "error",
          code: "missing_dependency",
          message: "Marker is not available.",
          provenance: { kind: "unknown" }
        }
      ]
    });
    await store.replaceSourceExtractionQueue([
      job({
        sourcePath: failedSource.sourcePath,
        contentHash: failedSource.contentHash
      })
    ]);
    const extractor = new FakeSourceExtractor({
      ok: false,
      source: failedSource,
      failureMode: "missing_dependency"
    });

    const summary = await runSourceExtractionWorkerBatch({
      store,
      extractor,
      now: workerNow,
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      sourceCount: 1,
      chunkCount: 0
    });
    await expect(store.getSourceRecords()).resolves.toEqual([failedSource]);
    await expect(store.getSourceChunkRecords()).resolves.toEqual([]);
    await expect(store.getSourceExtractionJobRecords()).resolves.toEqual([
      expect.objectContaining({
        status: "queued",
        attemptCount: 1,
        lastError: "Source extraction failed: missing_dependency",
        nextAttemptAt: "2026-05-01T10:35:30.000Z"
      })
    ]);
  });

  it("does not claim jobs for other source extractors", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceExtractionQueue([
      job({ extractorId: "markitdown", sourcePath: "Sources/Docs/manual.docx", extension: ".docx" })
    ]);
    const extractor = new FakeSourceExtractor(new Error("should not run"));

    const summary = await runSourceExtractionWorkerBatch({
      store,
      extractor,
      now: workerNow,
      batchSize: 1,
      retryDelayMs: 30_000,
      maxAttempts: 3
    });

    expect(summary).toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      sourceCount: 0,
      chunkCount: 0
    });
    expect(extractor.inputs).toEqual([]);
    await expect(store.getSourceExtractionJobRecords()).resolves.toEqual([
      expect.objectContaining({
        extractorId: "markitdown",
        sourcePath: "Sources/Docs/manual.docx",
        status: "queued"
      })
    ]);
  });
});

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source:paper",
    status: "extracted",
    sourcePath: "Sources/Papers/paper.pdf",
    filename: "paper.pdf",
    extension: ".pdf",
    sizeBytes: 2048,
    contentHash: "vault-file:200:20",
    importedAt: workerNow,
    extractor: {
      id: "marker",
      name: "Marker",
      version: "pending"
    },
    extractionOptions: {},
    extractedMarkdown: "# Paper\n\nExtracted source text.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function sourceChunk(overrides: Partial<SourceChunkRecord> = {}): SourceChunkRecord {
  return {
    id: "source-chunk:paper",
    sourceId: "source:paper",
    sourcePath: "Sources/Papers/paper.pdf",
    sectionPath: ["Paper"],
    normalizedTextHash: "source-hash",
    ordinal: 0,
    text: "Extracted source text.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}

function job(overrides: Partial<ReturnType<typeof baseJob>> = {}): ReturnType<typeof baseJob> {
  const sourcePath = overrides.sourcePath ?? "Sources/Papers/paper.pdf";
  const contentHash = overrides.contentHash ?? "vault-file:200:20";
  const extractionOptions = overrides.extractionOptions ?? {};
  return {
    ...baseJob(sourcePath, contentHash, extractionOptions),
    ...overrides
  };
}

function baseJob(sourcePath: string, contentHash: string, extractionOptions: Record<string, unknown>) {
  const filename = sourcePath.split("/").pop() ?? sourcePath;
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  return {
    id: createSourceExtractionJobId("marker", sourcePath, contentHash, extractionOptions),
    extractorId: "marker",
    sourcePath,
    filename,
    extension,
    sizeBytes: 2048,
    contentHash,
    extractionOptions,
    status: "queued" as const,
    attemptCount: 0,
    createdAt,
    updatedAt: createdAt,
    lastError: null,
    nextAttemptAt: null
  };
}
