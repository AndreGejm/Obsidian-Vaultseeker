export type SourceWorkspaceStatus = "extracted" | "failed";

export type SourceExtractorFailureMode =
  | "missing_dependency"
  | "unsupported_file_type"
  | "read_failed"
  | "extraction_failed"
  | "cancelled";

export type SourceExtractorDependency = {
  name: string;
  kind: "command" | "python_package" | "service" | "library" | "unknown";
  required: boolean;
  status: "available" | "missing" | "unknown";
  message?: string;
};

export type SourceExtractorCapability = {
  extensions: string[];
  mimeTypes: string[];
  requiresExternalProcess: boolean;
  preservesImages: boolean;
  preservesTables: boolean;
};

export type SourceExtractionInput = {
  sourcePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
  importedAt?: string;
  textContent?: string;
  options: Record<string, unknown>;
};

export type SourceExtractionResult =
  | {
      ok: true;
      source: SourceRecord;
      chunks: SourceChunkRecord[];
    }
  | {
      ok: false;
      source: SourceRecord;
      failureMode: SourceExtractorFailureMode;
    };

export interface SourceExtractorPort {
  readonly id: string;
  readonly displayName: string;
  listCapabilities(): SourceExtractorCapability[];
  checkDependencies(): Promise<SourceExtractorDependency[]>;
  extract(input: SourceExtractionInput): Promise<SourceExtractionResult>;
}

export type SourceExtractorIdentity = {
  id: string;
  name: string;
  version: string | null;
};

export type SourceProvenance =
  | {
      kind: "page";
      page: number;
    }
  | {
      kind: "section";
      sectionPath: string[];
    }
  | {
      kind: "line_range";
      startLine: number;
      endLine: number;
    }
  | {
      kind: "unknown";
    };

export type SourceExtractionDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  provenance?: SourceProvenance;
};

export type SourceAttachmentRecord = {
  id: string;
  sourceId: string;
  kind: "image" | "table" | "attachment";
  filename: string;
  contentHash: string;
  stagedPath: string;
  mimeType?: string;
  provenance?: SourceProvenance;
};

export type SourceRecord = {
  id: string;
  status: SourceWorkspaceStatus;
  sourcePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
  importedAt: string;
  extractor: SourceExtractorIdentity;
  extractionOptions: Record<string, unknown>;
  extractedMarkdown: string;
  diagnostics: SourceExtractionDiagnostic[];
  attachments: SourceAttachmentRecord[];
};

export type SourceChunkRecord = {
  id: string;
  sourceId: string;
  sourcePath: string;
  sectionPath: string[];
  normalizedTextHash: string;
  ordinal: number;
  text: string;
  provenance: SourceProvenance;
};

export type SourceExtractionJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type SourceExtractionCandidate = {
  sourcePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
  extractionOptions: Record<string, unknown>;
};

export type SourceExtractionJobRecord = SourceExtractionCandidate & {
  id: string;
  extractorId: string;
  status: SourceExtractionJobStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  nextAttemptAt: string | null;
};
