import type { LinkSuggestion, TagSuggestion, VaultseerStore } from "@vaultseer/core";
import { buildActiveNoteContextFromStore } from "./active-note-context-controller";
import type { SearchModalSemanticSearch } from "./search-modal-query";
import { buildSearchModalQueryState } from "./search-modal-query";
import type { SourceSearchModalSemanticSearch } from "./source-search-modal-query";
import { buildSourceSearchModalQueryState } from "./source-search-modal-query";
import type { CodexProposalToolExecutionContext, CodexToolImplementations } from "./codex-tool-dispatcher";
import { stageNoteLinkUpdateProposal } from "./link-write-proposal-controller";
import { stageNoteTagUpdateProposal } from "./tag-write-proposal-controller";

const DEFAULT_LIMIT = 5;
const MIN_LIMIT = 1;
const MAX_LIMIT = 10;

export type CodexSearchToolInput = {
  query: string;
  limit: number;
};

export type CreateCodexReadOnlyToolImplementationsInput = {
  store: VaultseerStore;
  getActivePath: () => string | null;
  readActiveNoteContent?: (path: string) => Promise<string>;
  now?: () => string;
  searchNotesSemanticSearch?: SearchModalSemanticSearch | undefined;
  searchSourcesSemanticSearch?: SourceSearchModalSemanticSearch | undefined;
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

export function createCodexReadOnlyToolImplementations(
  input: CreateCodexReadOnlyToolImplementationsInput
): CodexToolImplementations {
  return {
    inspectCurrentNote: async () =>
      buildActiveNoteContextFromStore({
        store: input.store,
        activePath: input.getActivePath()
      }),
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

      return stageNoteLinkUpdateProposal({
        store: input.store,
        targetPath: proposal.targetPath,
        currentContent,
        linkSuggestions: proposal.linkSuggestions,
        now,
        beforeCommit: () => input.getActivePath() === proposal.targetPath && isProposalCommitFresh(context)
      });
    }
  };
}

async function isProposalCommitFresh(context: CodexProposalToolExecutionContext | undefined): Promise<boolean> {
  return context?.beforeProposalCommit ? context.beforeProposalCommit() : true;
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

  throw new Error("Codex stage_suggestion input kind must be 'tag' or 'link'.");
}

function parseStageSuggestionTargetPath(input: Record<string, unknown>, activePath: string): string {
  const rawTargetPath = input["targetPath"];
  if (rawTargetPath === undefined) {
    return activePath;
  }

  if (typeof rawTargetPath !== "string" || rawTargetPath.trim().length === 0) {
    throw new Error("Codex stage_suggestion targetPath must be a nonblank string.");
  }

  const targetPath = rawTargetPath.trim();
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

function normalizeKind(value: string | null): "tag" | "link" | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "tag" || normalized === "link" ? normalized : null;
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
