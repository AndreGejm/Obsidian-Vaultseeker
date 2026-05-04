import {
  buildRelationshipGraph,
  buildVaultSnapshot,
  detectNoteQualityIssues,
  normalizeNoteRecord,
  suggestLinksForNote,
  suggestTagsForNote,
  type LinkSuggestion,
  type NoteRecord,
  type NoteRecordInput,
  type TagSuggestion,
  type VaultseerStore,
  type VaultWriteDecision,
  type VaultWriteDecisionRecord,
  type VaultWritePort
} from "@vaultseer/core";
import { buildActiveNoteContextFromStore } from "./active-note-context-controller";
import type { SearchModalSemanticSearch } from "./search-modal-query";
import { buildSearchModalQueryState } from "./search-modal-query";
import type { SourceSearchModalSemanticSearch } from "./source-search-modal-query";
import { buildSourceSearchModalQueryState } from "./source-search-modal-query";
import type { ApprovedScriptRegistry, ApprovedScriptRunRequest } from "./approved-script-registry";
import type { CodexProposalToolExecutionContext, CodexToolImplementations } from "./codex-tool-dispatcher";
import { stageNoteLinkUpdateProposal } from "./link-write-proposal-controller";
import { stageNoteRewriteProposal } from "./note-rewrite-proposal-controller";
import { stageNoteTagUpdateProposal } from "./tag-write-proposal-controller";
import { buildStudioNoteProposalCards, type StudioNoteProposalCardState } from "./studio-note-proposal-cards";
import type { VaultAssetRecord } from "./obsidian-adapter";
import type { VaultseerAgentContentPart } from "./vaultseer-agent-runtime";
import { validateVaultRelativePath } from "./vault-path-policy";
import { applyApprovedVaultWriteOperation } from "./write-apply-controller";
import { recordWriteReviewQueueDecision } from "./write-review-queue-controller";

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const MAX_AGENT_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export type CodexSearchToolInput = {
  query: string;
  limit: number;
};

export type CreateCodexReadOnlyToolImplementationsInput = {
  store: VaultseerStore;
  getActivePath: () => string | null;
  readActiveNoteInput?: (path: string) => Promise<NoteRecordInput | null>;
  readActiveNoteContent?: (path: string) => Promise<string>;
  now?: () => string;
  searchNotesSemanticSearch?: SearchModalSemanticSearch | undefined;
  searchSourcesSemanticSearch?: SourceSearchModalSemanticSearch | undefined;
  runVaultseerCommand?: (input: unknown) => Promise<unknown>;
  rebuildNoteIndex?: () => Promise<unknown>;
  planSemanticIndex?: () => Promise<unknown>;
  runSemanticIndexBatch?: () => Promise<unknown>;
  inspectPdfSourceExtractionQueue?: () => Promise<unknown>;
  planPdfSourceExtraction?: () => Promise<unknown>;
  runPdfSourceExtractionBatch?: () => Promise<unknown>;
  planSourceSemanticIndex?: () => Promise<unknown>;
  runSourceSemanticIndexBatch?: () => Promise<unknown>;
  importVaultTextSource?: (input: unknown) => Promise<unknown>;
  writePort?: VaultWritePort;
  approvedScriptRegistry?: ApprovedScriptRegistry;
  readVaultBinaryFile?: (path: string) => Promise<Uint8Array | ArrayBuffer>;
  readVaultAssetRecords?: () => VaultAssetRecord[] | Promise<VaultAssetRecord[]>;
};

type ParsedCodexStageSuggestionInput =
  | {
      kind: "tag";
      targetPath: string;
      tagSuggestions: TagSuggestion[];
    }
  | {
      kind: "link";
      targetPath: string;
      linkSuggestions: LinkSuggestion[];
    }
  | {
      kind: "rewrite";
      targetPath: string;
      proposedContent: string;
      reason: string | null;
    };

type ParsedCodexReviewCurrentNoteProposalInput = {
  operationId: string | null;
  decision: VaultWriteDecision;
  apply: boolean;
};

type ParsedCodexListVaultImagesInput = {
  query: string | null;
  limit: number;
};

export function parseCodexSearchToolInput(input: unknown): CodexSearchToolInput {
  const rawQuery = typeof input === "string" ? input : isRecord(input) ? input["query"] : undefined;
  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
    throw new Error("Codex search tool input must include a nonblank query.");
  }

  const rawLimit = isRecord(input) ? input["limit"] : undefined;
  return {
    query: rawQuery.trim(),
    limit: normalizeLimit(rawLimit)
  };
}

async function readVaultImageForAgent(input: CreateCodexReadOnlyToolImplementationsInput, toolInput: unknown): Promise<unknown> {
  const request = parseReadVaultImageInput(toolInput);
  const directAsset = await findVaultImageAsset(input, request.path);
  if (directAsset !== null) {
    const assetReadRequest: {
      path: string;
      mimeType: string;
      sizeBytes: number;
      detail?: "auto" | "low" | "high";
    } = {
      path: request.path,
      mimeType: directAsset.mimeType ?? request.mimeType,
      sizeBytes: directAsset.sizeBytes
    };
    if (request.detail !== undefined) {
      assetReadRequest.detail = request.detail;
    }
    return readVaultImageAssetForAgent(input, assetReadRequest);
  }

  const sources = await input.store.getSourceRecords();
  const attachment = sources
    .flatMap((source) => source.attachments.map((candidate) => ({ source, attachment: candidate })))
    .find(({ source, attachment }) => source.status === "extracted" && attachment.kind === "image" && attachment.stagedPath === request.path);

  if (!attachment) {
    return {
      status: "not_indexed",
      path: request.path,
      message: "Index this vault image before Vaultseer can attach it to the agent turn."
    };
  }

  if (attachment.source.sizeBytes > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: attachment.source.sizeBytes,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  if (!input.readVaultBinaryFile) {
    return {
      status: "unavailable",
      path: request.path,
      message: "Vault image reading is not available in this Vaultseer session."
    };
  }

  const bytes = toUint8Array(await input.readVaultBinaryFile(request.path));
  if (bytes.byteLength > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: bytes.byteLength,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  const contentPart: VaultseerAgentContentPart = {
    type: "image_url",
    imageUrl: `data:${attachment.attachment.mimeType ?? request.mimeType};base64,${bytesToBase64(bytes)}`
  };
  if (request.detail) {
    contentPart.detail = request.detail;
  }

  return {
    status: "ready",
    path: request.path,
    mimeType: attachment.attachment.mimeType ?? request.mimeType,
    sizeBytes: bytes.byteLength,
    contentPart
  };
}

async function listVaultImagesForAgent(
  input: CreateCodexReadOnlyToolImplementationsInput,
  toolInput: unknown
): Promise<unknown> {
  if (!input.readVaultAssetRecords) {
    return {
      status: "unavailable",
      message: "Vault image listing is not available in this Vaultseer session.",
      images: []
    };
  }

  const request = parseListVaultImagesInput(toolInput);
  const query = request.query?.toLowerCase() ?? null;
  const assets = (await input.readVaultAssetRecords())
    .filter(isAgentImageAsset)
    .filter((asset) => query === null || asset.path.toLowerCase().includes(query) || asset.filename.toLowerCase().includes(query))
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, request.limit)
    .map((asset) => ({
      path: asset.path,
      filename: asset.filename,
      mimeType: asset.mimeType ?? IMAGE_MIME_TYPE_BY_EXTENSION.get(getExtension(asset.path)) ?? "application/octet-stream",
      sizeBytes: asset.sizeBytes,
      modifiedTime: asset.modifiedTime,
      contentHash: asset.contentHash
    }));

  return {
    status: "ready",
    message: `${assets.length} vault image${assets.length === 1 ? "" : "s"} found.`,
    images: assets
  };
}

async function findVaultImageAsset(
  input: CreateCodexReadOnlyToolImplementationsInput,
  path: string
): Promise<VaultAssetRecord | null> {
  if (!input.readVaultAssetRecords) {
    return null;
  }

  const assets = await input.readVaultAssetRecords();
  return assets.find((asset) => asset.path === path && isAgentImageAsset(asset)) ?? null;
}

async function readVaultImageAssetForAgent(
  input: CreateCodexReadOnlyToolImplementationsInput,
  request: {
    path: string;
    mimeType: string;
    sizeBytes: number;
    detail?: "auto" | "low" | "high";
  }
): Promise<unknown> {
  if (request.sizeBytes > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: request.sizeBytes,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  if (!input.readVaultBinaryFile) {
    return {
      status: "unavailable",
      path: request.path,
      message: "Vault image reading is not available in this Vaultseer session."
    };
  }

  const bytes = toUint8Array(await input.readVaultBinaryFile(request.path));
  if (bytes.byteLength > MAX_AGENT_IMAGE_BYTES) {
    return {
      status: "too_large",
      path: request.path,
      sizeBytes: bytes.byteLength,
      maxBytes: MAX_AGENT_IMAGE_BYTES
    };
  }

  const contentPart: VaultseerAgentContentPart = {
    type: "image_url",
    imageUrl: `data:${request.mimeType};base64,${bytesToBase64(bytes)}`
  };
  if (request.detail) {
    contentPart.detail = request.detail;
  }

  return {
    status: "ready",
    path: request.path,
    mimeType: request.mimeType,
    sizeBytes: bytes.byteLength,
    contentPart
  };
}

function parseReadVaultImageInput(input: unknown): {
  path: string;
  mimeType: string;
  detail?: "auto" | "low" | "high";
} {
  if (!isRecord(input)) {
    throw new Error("read_vault_image input must include a vault-relative image path.");
  }

  const rawPath = input["path"];
  if (typeof rawPath !== "string") {
    throw new Error("read_vault_image input must include a vault-relative image path.");
  }

  const path = validateVaultRelativePath(rawPath);
  const mimeType = IMAGE_MIME_TYPE_BY_EXTENSION.get(getExtension(path));
  if (!mimeType) {
    throw new Error("read_vault_image only accepts indexed PNG, JPEG, WEBP, or non-animated GIF images.");
  }

  const detail = normalizeImageDetail(input["detail"]);
  return detail ? { path, mimeType, detail } : { path, mimeType };
}

function normalizeImageDetail(value: unknown): "auto" | "low" | "high" | null {
  return value === "auto" || value === "low" || value === "high" ? value : null;
}

function parseListVaultImagesInput(input: unknown): ParsedCodexListVaultImagesInput {
  const rawQuery = typeof input === "string" ? input : isRecord(input) ? input["query"] : undefined;
  return {
    query: typeof rawQuery === "string" && rawQuery.trim().length > 0 ? rawQuery.trim() : null,
    limit: normalizeLimit(isRecord(input) ? input["limit"] : undefined)
  };
}

function isAgentImageAsset(asset: VaultAssetRecord): boolean {
  const extension = getExtension(asset.path);
  const mimeType = asset.mimeType ?? IMAGE_MIME_TYPE_BY_EXTENSION.get(extension) ?? "";
  return mimeType.startsWith("image/") && IMAGE_MIME_TYPE_BY_EXTENSION.has(extension);
}

function getExtension(path: string): string {
  const filename = path.split("/").pop() ?? path;
  const index = filename.lastIndexOf(".");
  return index <= 0 ? "" : filename.slice(index).toLowerCase();
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function createCodexReadOnlyToolImplementations(
  input: CreateCodexReadOnlyToolImplementationsInput
): CodexToolImplementations {
  return {
    inspectCurrentNote: async () =>
      buildActiveNoteContextFromStore(
        input.readActiveNoteInput === undefined
          ? {
              store: input.store,
              activePath: input.getActivePath()
            }
          : {
              store: input.store,
              activePath: input.getActivePath(),
              readActiveNoteInput: input.readActiveNoteInput
            }
      ),
    inspectIndexHealth: async () => {
      const [health, chunks, vectors, embeddingJobs, sources, sourceChunks, suggestions, writeOperations] =
        await Promise.all([
          input.store.getHealth(),
          input.store.getChunkRecords(),
          input.store.getVectorRecords(),
          input.store.getEmbeddingJobRecords(),
          input.store.getSourceRecords(),
          input.store.getSourceChunkRecords(),
          input.store.getSuggestionRecords(),
          input.store.getVaultWriteOperations()
        ]);

      return {
        status: health.status,
        message: health.statusMessage ?? "Vaultseer index health is available.",
        health,
        counts: {
          notes: health.noteCount,
          chunks: chunks.length,
          vectors: vectors.length,
          sources: sources.length,
          sourceChunks: sourceChunks.length,
          suggestions: suggestions.length,
          writeOperations: writeOperations.length
        },
        embeddingJobs: countEmbeddingJobs(embeddingJobs.map((job) => job.status))
      };
    },
    inspectCurrentNoteChunks: async (toolInput) => {
      const query = parseLimitOnlyInput(toolInput);
      const context = await buildActiveNoteContextFromStore(
        input.readActiveNoteInput === undefined
          ? {
              store: input.store,
              activePath: input.getActivePath()
            }
          : {
              store: input.store,
              activePath: input.getActivePath(),
              readActiveNoteInput: input.readActiveNoteInput
            }
      );
      if (context.status !== "ready" || context.note === null) {
        return {
          status: context.status,
          message: context.message,
          targetPath: input.getActivePath(),
          liveNoteAvailable: false,
          chunkCount: 0,
          chunks: []
        };
      }

      return {
        status: "ready",
        message: `${context.noteChunks.length} current-note chunk${context.noteChunks.length === 1 ? "" : "s"} available.`,
        targetPath: context.note.path,
        title: context.note.title,
        liveNoteAvailable: Boolean(context.liveNote?.text.trim()),
        chunkCount: context.noteChunks.length,
        chunks: context.noteChunks.slice(0, query.limit)
      };
    },
    searchNotes: async (toolInput) => {
      const query = parseCodexSearchToolInput(toolInput);
      const [health, notes, chunks, lexicalIndex] = await Promise.all([
        input.store.getHealth(),
        input.store.getNoteRecords(),
        input.store.getChunkRecords(),
        input.store.getLexicalIndexRecords()
      ]);

      const queryInput = {
        query: query.query,
        limit: query.limit,
        health,
        notes,
        chunks,
        lexicalIndex
      };

      return buildSearchModalQueryState(
        input.searchNotesSemanticSearch
          ? { ...queryInput, semanticSearch: input.searchNotesSemanticSearch }
          : queryInput
      );
    },
    semanticSearchNotes: async (toolInput) => {
      const query = parseCodexSearchToolInput(toolInput);
      if (!input.searchNotesSemanticSearch) {
        return {
          status: "disabled",
          message: "Semantic note search is not configured for this Vaultseer session.",
          results: []
        };
      }

      const result = await input.searchNotesSemanticSearch(query.query);
      return {
        ...result,
        results: result.results.slice(0, query.limit)
      };
    },
    searchSources: async (toolInput) => {
      const query = parseCodexSearchToolInput(toolInput);
      const [sources, chunks] = await Promise.all([
        input.store.getSourceRecords(),
        input.store.getSourceChunkRecords()
      ]);

      const queryInput = {
        query: query.query,
        limit: query.limit,
        sources,
        chunks
      };

      return buildSourceSearchModalQueryState(
        input.searchSourcesSemanticSearch
          ? { ...queryInput, semanticSearch: input.searchSourcesSemanticSearch }
          : queryInput
      );
    },
    listVaultImages: async (toolInput) => listVaultImagesForAgent(input, toolInput),
    readVaultImage: async (toolInput) => readVaultImageForAgent(input, toolInput),
    ...(input.inspectPdfSourceExtractionQueue === undefined
      ? {}
      : { inspectPdfSourceExtractionQueue: input.inspectPdfSourceExtractionQueue }),
    ...(input.runVaultseerCommand === undefined ? {} : { runVaultseerCommand: input.runVaultseerCommand }),
    ...(input.rebuildNoteIndex === undefined ? {} : { rebuildNoteIndex: input.rebuildNoteIndex }),
    ...(input.planSemanticIndex === undefined ? {} : { planSemanticIndex: input.planSemanticIndex }),
    ...(input.runSemanticIndexBatch === undefined ? {} : { runSemanticIndexBatch: input.runSemanticIndexBatch }),
    ...(input.planPdfSourceExtraction === undefined ? {} : { planPdfSourceExtraction: input.planPdfSourceExtraction }),
    ...(input.runPdfSourceExtractionBatch === undefined
      ? {}
      : { runPdfSourceExtractionBatch: input.runPdfSourceExtractionBatch }),
    ...(input.planSourceSemanticIndex === undefined ? {} : { planSourceSemanticIndex: input.planSourceSemanticIndex }),
    ...(input.runSourceSemanticIndexBatch === undefined
      ? {}
      : { runSourceSemanticIndexBatch: input.runSourceSemanticIndexBatch }),
    ...(input.importVaultTextSource === undefined ? {} : { importVaultTextSource: input.importVaultTextSource }),
    suggestCurrentNoteTags: async () => {
      const current = await loadCurrentNoteEvidence(input);
      const suggestions = suggestTagsForNote({
        currentNote: current.currentNote,
        notes: current.notes
      });
      return {
        status: "ready",
        message: `${suggestions.length} tag suggestion${suggestions.length === 1 ? "" : "s"} found.`,
        targetPath: current.currentNote.path,
        suggestions
      };
    },
    suggestCurrentNoteLinks: async () => {
      const current = await loadCurrentNoteEvidence(input);
      const suggestions = suggestLinksForNote({
        currentNote: current.currentNote,
        notes: current.notes
      });
      return {
        status: "ready",
        message: `${suggestions.length} link suggestion${suggestions.length === 1 ? "" : "s"} found.`,
        targetPath: current.currentNote.path,
        suggestions
      };
    },
    inspectNoteQuality: async () => {
      const current = await loadCurrentNoteEvidence(input);
      const graph = buildRelationshipGraph(buildVaultSnapshot(noteRecordsToInputs(current.notes)));
      const issues = detectNoteQualityIssues({
        currentNote: current.currentNote,
        graph
      });
      return {
        status: "ready",
        message: `${issues.length} note quality issue${issues.length === 1 ? "" : "s"} found.`,
        targetPath: current.currentNote.path,
        issueCount: issues.length,
        issues
      };
    },
    listCurrentNoteProposals: async () => loadCurrentNoteProposalCards(input),
    ...(input.approvedScriptRegistry === undefined
      ? {}
      : {
          listApprovedScripts: async () => input.approvedScriptRegistry!.list(),
          runApprovedScript: async (toolInput) => input.approvedScriptRegistry!.run(parseApprovedScriptRunInput(toolInput))
        }),
    stageSuggestion: async (toolInput, context?: CodexProposalToolExecutionContext) => {
      const activePath = input.getActivePath();
      if (!activePath) {
        throw new Error("Open a note before staging a Codex proposal.");
      }

      if (!input.readActiveNoteContent) {
        throw new Error("Proposal tools are not available from Vaultseer Studio.");
      }

      const proposal = parseCodexStageSuggestionInput(toolInput, activePath);
      const currentContent = await input.readActiveNoteContent(proposal.targetPath);
      const now = input.now ?? (() => new Date().toISOString());

      if (proposal.kind === "tag") {
        return stageNoteTagUpdateProposal({
          store: input.store,
          targetPath: proposal.targetPath,
          currentContent,
          tagSuggestions: proposal.tagSuggestions,
          now,
          beforeCommit: () => input.getActivePath() === proposal.targetPath && isProposalCommitFresh(context)
        });
      }

      if (proposal.kind === "link") {
        return stageNoteLinkUpdateProposal({
          store: input.store,
          targetPath: proposal.targetPath,
          currentContent,
          linkSuggestions: proposal.linkSuggestions,
          now,
          beforeCommit: () => input.getActivePath() === proposal.targetPath && isProposalCommitFresh(context)
        });
      }

      return stageNoteRewriteProposal({
        store: input.store,
        targetPath: proposal.targetPath,
        currentContent,
        proposedContent: proposal.proposedContent,
        reason: proposal.reason,
        now,
        beforeCommit: () => input.getActivePath() === proposal.targetPath && isProposalCommitFresh(context)
      });
    },
    reviewCurrentNoteProposal: async (toolInput, context?: CodexProposalToolExecutionContext) => {
      const activePath = input.getActivePath();
      if (!activePath) {
        return {
          status: "blocked",
          message: "Open a Markdown note before reviewing current-note proposals.",
          targetPath: null
        };
      }

      validateVaultRelativePath(activePath, { requireMarkdown: true });
      if (!(await isCurrentProposalActionFresh(input, context, activePath))) {
        return staleCurrentProposalActionResult(activePath);
      }

      const request = parseCodexReviewCurrentNoteProposalInput(toolInput);
      const [operations, decisions] = await Promise.all([
        input.store.getVaultWriteOperations(),
        input.store.getVaultWriteDecisionRecords()
      ]);
      const applyResults = await input.store.getVaultWriteApplyResultRecords();
      const cards = buildStudioNoteProposalCards({
        activePath,
        writeOperations: operations,
        decisions,
        applyResults
      });
      if (cards.status !== "ready") {
        return {
          status: "blocked",
          message: cards.message,
          targetPath: activePath
        };
      }

      const selectedCard =
        request.operationId === null
          ? cards.cards.find((card) => card.queueSection === "active") ?? null
          : cards.cards.find((card) => card.id === request.operationId) ?? null;
      if (selectedCard === null) {
        return {
          status: "blocked",
          message: request.operationId
            ? `No active-note proposal '${request.operationId}' is available for ${activePath}.`
            : `No active proposal is available for ${activePath}.`,
          targetPath: activePath,
          operationId: request.operationId
        };
      }

      if (selectedCard.queueSection !== "active") {
        return {
          status: "blocked",
          message: `${selectedCard.targetPath} proposal '${selectedCard.id}' is already in history.`,
          targetPath: activePath,
          operationId: selectedCard.id
        };
      }

      const operation = operations.find((candidate) => candidate.id === selectedCard.id);
      if (operation === undefined || operation.targetPath !== activePath) {
        return {
          status: "blocked",
          message: `No current-note write operation is available for ${selectedCard.id}.`,
          targetPath: activePath,
          operationId: selectedCard.id
        };
      }

      if (request.apply && request.decision !== "approved") {
        return {
          status: "blocked",
          message: "Only approved current-note proposals can be applied.",
          targetPath: activePath,
          operationId: operation.id,
          decision: request.decision
        };
      }

      const writePort = input.writePort;
      if (request.apply && writePort === undefined) {
        return {
          status: "blocked",
          message: "Vaultseer write apply tools are not available in this session.",
          targetPath: activePath,
          operationId: operation.id,
          decision: request.decision
        };
      }

      if (!(await isCurrentProposalActionFresh(input, context, activePath))) {
        return staleCurrentProposalActionResult(activePath, operation.id);
      }

      const now = input.now ?? (() => new Date().toISOString());
      const decisionSummary = await recordWriteReviewQueueDecision({
        store: input.store,
        operation,
        decision: request.decision,
        now
      });

      if (!request.apply) {
        return {
          status: "reviewed",
          operationId: operation.id,
          targetPath: operation.targetPath,
          decision: request.decision,
          message: decisionSummary.message,
          decisionRecord: decisionSummary.decisionRecord
        };
      }

      if (writePort === undefined) {
        return {
          status: "blocked",
          message: "Vaultseer write apply tools are not available in this session.",
          targetPath: activePath,
          operationId: operation.id,
          decision: request.decision
        };
      }

      if (!(await isCurrentProposalActionFresh(input, context, activePath))) {
        return staleCurrentProposalActionResult(activePath, operation.id, decisionSummary.decisionRecord);
      }

      const applySummary = await applyApprovedVaultWriteOperation({
        store: input.store,
        writePort,
        operation,
        decision: decisionSummary.decisionRecord,
        now
      });

      return {
        status: applySummary.status,
        operationId: operation.id,
        targetPath: operation.targetPath,
        decision: request.decision,
        message: applySummary.message,
        decisionRecord: decisionSummary.decisionRecord,
        applyResult: applySummary
      };
    }
  };
}

async function loadCurrentNoteProposalCards(
  input: CreateCodexReadOnlyToolImplementationsInput
): Promise<StudioNoteProposalCardState> {
  const [writeOperations, decisions, applyResults] = await Promise.all([
    input.store.getVaultWriteOperations(),
    input.store.getVaultWriteDecisionRecords(),
    input.store.getVaultWriteApplyResultRecords()
  ]);
  return buildStudioNoteProposalCards({
    activePath: input.getActivePath(),
    writeOperations,
    decisions,
    applyResults
  });
}

async function loadCurrentNoteEvidence(input: CreateCodexReadOnlyToolImplementationsInput): Promise<{
  currentNote: NoteRecord;
  notes: NoteRecord[];
}> {
  const activePath = input.getActivePath();
  if (!activePath) {
    throw new Error("Open a note before using current-note Vaultseer tools.");
  }

  const storedNotes = await input.store.getNoteRecords();
  if (input.readActiveNoteInput !== undefined) {
    const liveInput = await input.readActiveNoteInput(activePath);
    if (liveInput !== null && liveInput.path === activePath) {
      const currentNote = normalizeNoteRecord(liveInput);
      return {
        currentNote,
        notes: upsertNote(storedNotes, currentNote)
      };
    }
  }

  const currentNote = storedNotes.find((note) => note.path === activePath);
  if (!currentNote) {
    throw new Error("The active note is not available in the Vaultseer index.");
  }

  return {
    currentNote,
    notes: storedNotes
  };
}

function upsertNote(notes: NoteRecord[], currentNote: NoteRecord): NoteRecord[] {
  return [...notes.filter((note) => note.path !== currentNote.path), currentNote];
}

function noteRecordsToInputs(notes: NoteRecord[]): NoteRecordInput[] {
  return notes.map((note) => ({
    path: note.path,
    basename: note.basename,
    content: "",
    stat: note.stat,
    metadata: {
      frontmatter: note.frontmatter,
      tags: note.tags,
      aliases: note.aliases,
      links: note.links,
      headings: note.headings
    }
  }));
}

function parseLimitOnlyInput(input: unknown): { limit: number } {
  const rawLimit = isRecord(input) ? input["limit"] : undefined;
  return { limit: normalizeLimit(rawLimit) };
}

function parseApprovedScriptRunInput(input: unknown): ApprovedScriptRunRequest {
  if (!isRecord(input)) {
    throw new Error("Codex run_approved_script input must be an object.");
  }

  const scriptId = stringProperty(input, "scriptId")?.trim();
  if (!scriptId) {
    throw new Error("Codex run_approved_script input must include a nonblank scriptId.");
  }

  return {
    scriptId,
    input: input["input"] ?? {}
  };
}

function countEmbeddingJobs(statuses: string[]): Record<string, number> {
  return {
    queued: statuses.filter((status) => status === "queued").length,
    running: statuses.filter((status) => status === "running").length,
    completed: statuses.filter((status) => status === "completed").length,
    failed: statuses.filter((status) => status === "failed").length,
    cancelled: statuses.filter((status) => status === "cancelled").length
  };
}

async function isProposalCommitFresh(context: CodexProposalToolExecutionContext | undefined): Promise<boolean> {
  return context?.beforeProposalCommit ? context.beforeProposalCommit() : true;
}

async function isCurrentProposalActionFresh(
  input: CreateCodexReadOnlyToolImplementationsInput,
  context: CodexProposalToolExecutionContext | undefined,
  activePath: string
): Promise<boolean> {
  return input.getActivePath() === activePath && (await isProposalCommitFresh(context));
}

function staleCurrentProposalActionResult(
  targetPath: string,
  operationId?: string,
  decisionRecord?: VaultWriteDecisionRecord
): {
  status: "blocked";
  message: string;
  targetPath: string;
  operationId?: string;
  decisionRecord?: VaultWriteDecisionRecord;
} {
  const result: {
    status: "blocked";
    message: string;
    targetPath: string;
    operationId?: string;
    decisionRecord?: VaultWriteDecisionRecord;
  } = {
    status: "blocked",
    message: "The active note changed before review could finish. Nothing was changed.",
    targetPath
  };
  if (operationId !== undefined) result.operationId = operationId;
  if (decisionRecord !== undefined) result.decisionRecord = decisionRecord;
  return result;
}

export function parseCodexStageSuggestionInput(
  input: unknown,
  activePath: string
): ParsedCodexStageSuggestionInput {
  if (!isRecord(input)) {
    throw new Error("Codex stage_suggestion input must be an object.");
  }

  const targetPath = parseStageSuggestionTargetPath(input, activePath);
  const kind = normalizeKind(stringProperty(input, "kind") ?? stringProperty(input, "type"));

  if (kind === "tag") {
    return {
      kind,
      targetPath,
      tagSuggestions: parseTagSuggestions(input)
    };
  }

  if (kind === "link") {
    return {
      kind,
      targetPath,
      linkSuggestions: parseLinkSuggestions(input)
    };
  }

  if (kind === "rewrite") {
    return {
      kind,
      targetPath,
      proposedContent: parseRewriteContent(input),
      reason: stringProperty(input, "reason")?.trim() || null
    };
  }

  throw new Error("Codex stage_suggestion input kind must be 'tag', 'link', or 'rewrite'.");
}

export function parseCodexReviewCurrentNoteProposalInput(
  input: unknown
): ParsedCodexReviewCurrentNoteProposalInput {
  if (input === null || input === undefined) {
    return {
      operationId: null,
      decision: "approved",
      apply: false
    };
  }
  if (!isRecord(input)) {
    throw new Error("Codex review_current_note_proposal input must be an object.");
  }

  const rawOperationId = input["operationId"];
  const operationId =
    typeof rawOperationId === "string" && rawOperationId.trim().length > 0 ? rawOperationId.trim() : null;
  const apply = input["apply"] === true;
  const rawDecision = input["decision"];
  const decision = normalizeVaultWriteDecision(typeof rawDecision === "string" ? rawDecision : null) ?? "approved";

  return {
    operationId,
    decision,
    apply
  };
}

function normalizeVaultWriteDecision(value: string | null): VaultWriteDecision | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "approved" || normalized === "deferred" || normalized === "rejected") {
    return normalized;
  }
  if (normalized === null || normalized === undefined || normalized.length === 0) {
    return null;
  }
  throw new Error("Codex review_current_note_proposal decision must be approved, deferred, or rejected.");
}

function parseStageSuggestionTargetPath(input: Record<string, unknown>, activePath: string): string {
  validateVaultRelativePath(activePath, { requireMarkdown: true });
  const rawTargetPath = input["targetPath"];
  if (rawTargetPath === undefined) {
    return activePath;
  }

  if (typeof rawTargetPath !== "string" || rawTargetPath.trim().length === 0) {
    throw new Error("Codex stage_suggestion targetPath must be a nonblank string.");
  }

  const targetPath = rawTargetPath.trim();
  validateVaultRelativePath(targetPath, { requireMarkdown: true });
  if (targetPath !== activePath) {
    throw new Error("Codex stage_suggestion targetPath must match the current active note.");
  }

  return targetPath;
}

function parseTagSuggestions(input: Record<string, unknown>): TagSuggestion[] {
  if (Array.isArray(input["suggestions"])) {
    const suggestions = input["suggestions"].map(parseRichTagSuggestion).filter(isPresent);
    if (suggestions.length > 0) {
      return suggestions;
    }
  }

  if (Array.isArray(input["tags"])) {
    const suggestions = input["tags"]
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter((tag) => tag.length > 0)
      .map((tag) =>
        tagSuggestionFromParts({
          tag,
          reason: stringProperty(input, "reason"),
          confidence: clampedConfidence(input["confidence"]),
          score: nonNegativeScore(input["score"]),
          evidence: tagEvidenceArray(input["evidence"])
        })
      );
    if (suggestions.length > 0) {
      return suggestions;
    }
  }

  throw new Error("Codex tag proposal must include at least one nonblank tag suggestion.");
}

function parseRichTagSuggestion(input: unknown): TagSuggestion | null {
  if (!isRecord(input)) {
    return null;
  }

  const tag = stringProperty(input, "tag")?.trim();
  if (!tag) {
    return null;
  }

  return tagSuggestionFromParts({
    tag,
    reason: stringProperty(input, "reason"),
    confidence: clampedConfidence(input["confidence"]),
    score: nonNegativeScore(input["score"]),
    evidence: tagEvidenceArray(input["evidence"])
  });
}

function tagSuggestionFromParts(input: {
  tag: string;
  reason: string | null;
  confidence: number | null;
  score: number | null;
  evidence: unknown[];
}): TagSuggestion {
  return {
    tag: input.tag,
    reason: input.reason ?? "Codex suggested this tag.",
    confidence: input.confidence ?? 0.5,
    score: input.score ?? input.confidence ?? 0.5,
    evidence: input.evidence as TagSuggestion["evidence"]
  };
}

function parseLinkSuggestions(input: Record<string, unknown>): LinkSuggestion[] {
  if (!Array.isArray(input["links"])) {
    throw new Error("Codex link proposal must include at least one link suggestion.");
  }

  const suggestions = input["links"].map(parseLinkSuggestion).filter(isPresent);
  if (suggestions.length === 0) {
    throw new Error("Codex link proposal must include rawLink, unresolvedTarget, and suggestedPath.");
  }

  return suggestions;
}

function parseLinkSuggestion(input: unknown): LinkSuggestion | null {
  if (!isRecord(input)) {
    return null;
  }

  const rawLink = stringProperty(input, "rawLink")?.trim();
  const unresolvedTarget = stringProperty(input, "unresolvedTarget")?.trim();
  const suggestedPath = stringProperty(input, "suggestedPath")?.trim();
  if (!rawLink || !unresolvedTarget || !suggestedPath) {
    return null;
  }

  return {
    rawLink,
    unresolvedTarget,
    suggestedPath,
    suggestedTitle: stringProperty(input, "suggestedTitle")?.trim() || suggestedTitleFromPath(suggestedPath),
    reason: stringProperty(input, "reason") ?? "Codex suggested this link target.",
    confidence: clampedConfidence(input["confidence"]) ?? 0.5,
    score: nonNegativeScore(input["score"]) ?? clampedConfidence(input["confidence"]) ?? 0.5,
    evidence: linkEvidenceArray(input["evidence"])
  };
}

function parseRewriteContent(input: Record<string, unknown>): string {
  const content = stringProperty(input, "markdown") ?? stringProperty(input, "content");
  if (content === null || content.trim().length === 0) {
    throw new Error("Codex rewrite proposal must include nonblank markdown or content.");
  }
  return content;
}

function normalizeKind(value: string | null): "tag" | "link" | "rewrite" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "tag" || normalized === "link" || normalized === "rewrite") return normalized;
  if (normalized === "note_rewrite" || normalized === "note-rewrite" || normalized === "content_rewrite") {
    return "rewrite";
  }
  return null;
}

function stringProperty(value: Record<string, unknown>, key: string): string | null {
  const property = value[key];
  return typeof property === "string" ? property : null;
}

function clampedConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(1, Math.max(0, value));
}

function nonNegativeScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, value);
}

function tagEvidenceArray(value: unknown): TagSuggestion["evidence"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parseTagEvidence).filter(isPresent);
}

function parseTagEvidence(value: unknown): TagSuggestion["evidence"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value["type"]) {
    case "linked_note_tag":
    case "backlink_note_tag": {
      const notePath = nonblankString(value["notePath"]);
      const tag = nonblankString(value["tag"]);
      return notePath && tag ? { type: value["type"], notePath, tag } : null;
    }
    case "co_tag": {
      const fromTag = nonblankString(value["fromTag"]);
      const count = positiveNumber(value["count"]);
      return fromTag && count !== null ? { type: "co_tag", fromTag, count } : null;
    }
    case "tag_frequency": {
      const noteCount = nonNegativeNumber(value["noteCount"]);
      return noteCount !== null ? { type: "tag_frequency", noteCount } : null;
    }
    default:
      return null;
  }
}

function linkEvidenceArray(value: unknown): LinkSuggestion["evidence"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parseLinkEvidence).filter(isPresent);
}

function parseLinkEvidence(value: unknown): LinkSuggestion["evidence"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  switch (value["type"]) {
    case "unresolved_link": {
      const raw = nonblankString(value["raw"]);
      const target = nonblankString(value["target"]);
      return raw && target ? { type: "unresolved_link", raw, target } : null;
    }
    case "alias_match": {
      const alias = nonblankString(value["alias"]);
      return alias ? { type: "alias_match", alias } : null;
    }
    case "title_match": {
      const title = nonblankString(value["title"]);
      return title ? { type: "title_match", title } : null;
    }
    case "token_overlap": {
      const tokens = stringArray(value["tokens"]);
      return tokens.length > 0 ? { type: "token_overlap", tokens } : null;
    }
    default:
      return null;
  }
}

function nonblankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    return [];
  }

  return value.map((item) => item.trim());
}

function suggestedTitleFromPath(path: string): string {
  const basename = path.split("/").pop() ?? path;
  return basename.endsWith(".md") ? basename.slice(0, -3) : basename;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function normalizeLimit(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(input)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
