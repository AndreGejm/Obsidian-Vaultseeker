import {
  buildRelationshipGraph,
  buildVaultSnapshot,
  detectNoteQualityIssues,
  normalizeNoteRecord,
  suggestLinksForNote,
  suggestTagsForNote,
  type GuardedVaultWriteOperation,
  type NoteRecord,
  type NoteRecordInput,
  type VaultseerStore,
  type VaultWriteDecisionRecord,
  type VaultWritePort
} from "@vaultseer/core";
import { buildActiveNoteContextFromStore } from "./active-note-context-controller";
import type { SearchModalSemanticSearch } from "./search-modal-query";
import { buildSearchModalQueryState } from "./search-modal-query";
import type { SourceSearchModalSemanticSearch } from "./source-search-modal-query";
import { buildSourceSearchModalQueryState } from "./source-search-modal-query";
import type { ApprovedScriptRegistry } from "./approved-script-registry";
import type { CodexProposalToolExecutionContext, CodexToolImplementations } from "./codex-tool-dispatcher";
import {
  parseApprovedScriptRunInput,
  parseCodexReviewCurrentNoteProposalInput,
  parseCodexSearchToolInput,
  parseCodexStageSuggestionInput,
  parseLimitOnlyInput,
  type CodexSearchToolInput
} from "./codex-tool-input-parsers";
import { listVaultImagesForAgent, readVaultImageForAgent } from "./codex-vault-image-tools";
import { stageNoteLinkUpdateProposal } from "./link-write-proposal-controller";
import { stageNoteRewriteProposal } from "./note-rewrite-proposal-controller";
import { stageNoteTagUpdateProposal } from "./tag-write-proposal-controller";
import { buildStudioNoteProposalCards, type StudioNoteProposalCardState } from "./studio-note-proposal-cards";
import type { VaultAssetRecord } from "./obsidian-adapter";
import { validateVaultRelativePath } from "./vault-path-policy";
import {
  acceptWriteReviewQueueOperation,
  recordWriteReviewQueueDecision
} from "./write-review-queue-controller";
import { refreshActiveNoteOperationForCurrentContent } from "./write-operation-edit";

export {
  parseCodexReviewCurrentNoteProposalInput,
  parseCodexSearchToolInput,
  parseCodexStageSuggestionInput,
  type CodexSearchToolInput
} from "./codex-tool-input-parsers";

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
      if (!request.apply) {
        const decisionSummary = await recordWriteReviewQueueDecision({
          store: input.store,
          operation,
          decision: request.decision,
          now
        });

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
        return staleCurrentProposalActionResult(activePath, operation.id);
      }

      const operationToAccept = await refreshCurrentNoteOperationForToolApply(input, operation);
      const acceptSummary = await acceptWriteReviewQueueOperation({
        store: input.store,
        writePort,
        operation: operationToAccept,
        now
      });

      return {
        status: acceptSummary.status,
        operationId: acceptSummary.operationId,
        targetPath: acceptSummary.targetPath,
        decision: request.decision,
        message: acceptSummary.message,
        decisionRecord: acceptSummary.decisionRecord,
        applyResult: acceptSummary.applyResult
      };
    }
  };
}

async function refreshCurrentNoteOperationForToolApply(
  input: CreateCodexReadOnlyToolImplementationsInput,
  operation: GuardedVaultWriteOperation
): Promise<GuardedVaultWriteOperation> {
  if (
    input.readActiveNoteContent === undefined ||
    (operation.type !== "rewrite_note_content" &&
      operation.type !== "update_note_tags" &&
      operation.type !== "update_note_links")
  ) {
    return operation;
  }

  const currentContent = await input.readActiveNoteContent(operation.targetPath);
  const refreshed = refreshActiveNoteOperationForCurrentContent({ operation, currentContent });
  if (refreshed.id === operation.id) {
    return operation;
  }

  const operations = await input.store.getVaultWriteOperations();
  await input.store.replaceVaultWriteOperations(
    operations.map((candidate) => (candidate.id === operation.id ? refreshed : candidate))
  );
  return refreshed;
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
