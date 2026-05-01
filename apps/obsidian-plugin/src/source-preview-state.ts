import type {
  NoteRecord,
  SourceNoteProposal,
  SourceAttachmentRecord,
  SourceChunkRecord,
  SourceExtractionDiagnostic,
  SourceProvenance,
  SourceRecord,
  SuggestionRecord
} from "@vaultseer/core";
import { createSourceNoteProposalSuggestionRecords, proposeSourceNote } from "@vaultseer/core";
import {
  buildSourceNoteWriteReviewState,
  type SourceNoteWriteReviewState
} from "./source-note-write-review-state";

export type SourcePreviewStatus = "ready" | "failed" | "missing";

export type SourcePreviewSourceSummary = {
  id: string;
  status: SourceRecord["status"];
  sourcePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  contentHash: string;
  importedAt: string;
  extractor: string;
};

export type SourcePreviewDiagnostic = {
  severity: SourceExtractionDiagnostic["severity"];
  code: string;
  message: string;
  location: string;
};

export type SourcePreviewAttachment = {
  id: string;
  kind: SourceAttachmentRecord["kind"];
  filename: string;
  stagedPath: string;
  mimeType?: string;
  location: string;
};

export type SourcePreviewChunk = {
  id: string;
  ordinal: number;
  text: string;
  location: string;
};

export type SourcePreviewChunkGroup = {
  label: string;
  chunks: SourcePreviewChunk[];
};

export type SourcePreviewState = {
  status: SourcePreviewStatus;
  title: string;
  message: string;
  source: SourcePreviewSourceSummary | null;
  diagnostics: SourcePreviewDiagnostic[];
  attachments: SourcePreviewAttachment[];
  markdownPreview: string;
  noteProposal: SourceNoteProposal | null;
  suggestionRecords: SuggestionRecord[];
  noteWriteReview: SourceNoteWriteReviewState | null;
  chunkGroups: SourcePreviewChunkGroup[];
};

export type BuildSourcePreviewStateInput = {
  sourceId: string;
  sources: SourceRecord[];
  chunks: SourceChunkRecord[];
  notes?: NoteRecord[];
  createdAt?: string;
};

export function buildSourcePreviewState(input: BuildSourcePreviewStateInput): SourcePreviewState {
  const source = input.sources.find((candidate) => candidate.id === input.sourceId);

  if (!source) {
    return {
      status: "missing",
      title: "Source not found",
      message: "The selected source workspace is no longer stored.",
      source: null,
      diagnostics: [],
      attachments: [],
      markdownPreview: "",
      noteProposal: null,
      suggestionRecords: [],
      noteWriteReview: null,
      chunkGroups: []
    };
  }

  const status: SourcePreviewStatus = source.status === "failed" ? "failed" : "ready";
  const noteProposal =
    status === "failed" || !input.notes
      ? null
      : proposeSourceNote({
          source,
          sourceChunks: input.chunks,
          notes: input.notes
        });
  const suggestionRecords = noteProposal
    ? createSourceNoteProposalSuggestionRecords(noteProposal, input.createdAt ?? source.importedAt)
    : [];

  return {
    status,
    title: source.filename,
    message:
      status === "failed"
        ? "Source extraction failed. Review diagnostics before retrying extraction."
        : "Source workspace is extracted and ready for review.",
    source: toSourceSummary(source),
    diagnostics: source.diagnostics.map(toPreviewDiagnostic),
    attachments: source.attachments.map(toPreviewAttachment),
    markdownPreview: source.extractedMarkdown,
    noteProposal,
    suggestionRecords,
    noteWriteReview:
      noteProposal && input.notes
        ? buildSourceNoteWriteReviewState({
            proposal: noteProposal,
            notes: input.notes,
            suggestionRecords,
            createdAt: input.createdAt ?? source.importedAt
          })
        : null,
    chunkGroups:
      status === "failed"
        ? []
        : groupChunks(input.chunks.filter((chunk) => chunk.sourceId === source.id))
  };
}

function toSourceSummary(source: SourceRecord): SourcePreviewSourceSummary {
  return {
    id: source.id,
    status: source.status,
    sourcePath: source.sourcePath,
    filename: source.filename,
    extension: source.extension,
    sizeBytes: source.sizeBytes,
    contentHash: source.contentHash,
    importedAt: source.importedAt,
    extractor: formatExtractor(source)
  };
}

function toPreviewDiagnostic(diagnostic: SourceExtractionDiagnostic): SourcePreviewDiagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    location: formatProvenance(diagnostic.provenance)
  };
}

function toPreviewAttachment(attachment: SourceAttachmentRecord): SourcePreviewAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    filename: attachment.filename,
    stagedPath: attachment.stagedPath,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    location: formatProvenance(attachment.provenance)
  };
}

function groupChunks(chunks: SourceChunkRecord[]): SourcePreviewChunkGroup[] {
  const groups = new Map<string, SourcePreviewChunkGroup>();

  for (const chunk of chunks) {
    const label = formatSectionPath(chunk.sectionPath);
    const group = groups.get(label) ?? { label, chunks: [] };
    group.chunks.push({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      location: formatProvenance(chunk.provenance)
    });
    groups.set(label, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    chunks: group.chunks.sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id))
  }));
}

function formatExtractor(source: SourceRecord): string {
  return source.extractor.version ? `${source.extractor.name} ${source.extractor.version}` : source.extractor.name;
}

function formatSectionPath(sectionPath: string[]): string {
  return sectionPath.length > 0 ? sectionPath.join(" > ") : "Source body";
}

function formatProvenance(provenance: SourceProvenance | undefined): string {
  if (!provenance) return "unknown";

  switch (provenance.kind) {
    case "page":
      return `page ${provenance.page}`;
    case "section":
      return formatSectionPath(provenance.sectionPath);
    case "line_range":
      return provenance.startLine === provenance.endLine
        ? `line ${provenance.startLine}`
        : `lines ${provenance.startLine}-${provenance.endLine}`;
    case "unknown":
      return "unknown";
  }
}
