import {
  buildSourceLexicalIndex,
  searchSourceLexicalIndex,
  type SourceChunkRecord,
  type SourceLexicalSearchResult,
  type SourceRecord,
  type SourceSemanticSearchResult
} from "@vaultseer/core";
import type { SourceSemanticSearchControllerResult } from "./source-semantic-search-controller";

export type SourceSearchModalResult = {
  sourceId: string;
  sourcePath: string;
  filename: string;
  score: number;
  source: "lexical" | "semantic" | "hybrid";
  reason: string;
  excerpt: string;
};

export type SourceSearchModalState = {
  status: "ready";
  message: string;
  results: SourceSearchModalResult[];
};

export type BuildSourceSearchModalStateInput = {
  query: string;
  sources: SourceRecord[];
  chunks: SourceChunkRecord[];
  semantic?: SourceSemanticSearchControllerResult;
  limit?: number;
};

export function buildSourceSearchModalState(input: BuildSourceSearchModalStateInput): SourceSearchModalState {
  const extractedSources = input.sources.filter((source) => source.status === "extracted");
  if (extractedSources.length === 0) {
    return {
      status: "ready",
      message: "No source workspaces are stored yet.",
      results: []
    };
  }

  if (!input.query.trim()) {
    return {
      status: "ready",
      message: "Type a filename, section, phrase, or topic to search stored source workspaces.",
      results: []
    };
  }

  const lexicalIndex = buildSourceLexicalIndex(input.sources, input.chunks);
  const lexicalResults = searchSourceLexicalIndex({
    query: input.query,
    index: lexicalIndex,
    sources: input.sources,
    chunks: input.chunks,
    limit: input.limit ?? 20
  }).map(toModalResult);
  const semanticResults = input.semantic?.status === "ready"
    ? input.semantic.results.map(toSemanticModalResult)
    : [];
  const results = mergeResults(lexicalResults, semanticResults, input.limit ?? 20);

  return {
    status: "ready",
    message: appendSemanticMessage(getSearchableMessage(results.length), input.semantic),
    results
  };
}

function toModalResult(result: SourceLexicalSearchResult): SourceSearchModalResult {
  return {
    sourceId: result.sourceId,
    sourcePath: result.sourcePath,
    filename: result.filename,
    score: result.score,
    source: "lexical",
    reason: formatReason(result),
    excerpt: formatExcerpt(result)
  };
}

function toSemanticModalResult(result: SourceSemanticSearchResult): SourceSearchModalResult {
  return {
    sourceId: result.sourceId,
    sourcePath: result.sourcePath,
    filename: result.filename,
    score: result.score,
    source: "semantic",
    reason: formatSemanticReason(result),
    excerpt: formatSemanticExcerpt(result)
  };
}

function mergeResults(
  lexicalResults: SourceSearchModalResult[],
  semanticResults: SourceSearchModalResult[],
  limit: number
): SourceSearchModalResult[] {
  const mergedById = new Map<string, SourceSearchModalResult>();
  const order: string[] = [];

  for (const result of lexicalResults) {
    mergedById.set(result.sourceId, result);
    order.push(result.sourceId);
  }

  for (const result of semanticResults) {
    const existing = mergedById.get(result.sourceId);
    if (!existing) {
      mergedById.set(result.sourceId, result);
      order.push(result.sourceId);
      continue;
    }

    mergedById.set(result.sourceId, {
      ...existing,
      score: Math.max(existing.score, result.score),
      source: "hybrid",
      reason: joinReasons(existing.reason, result.reason),
      excerpt: existing.excerpt || result.excerpt
    });
  }

  return order.map((sourceId) => mergedById.get(sourceId)!).slice(0, limit);
}

function getSearchableMessage(resultCount: number): string {
  if (resultCount === 0) return "No source results found.";
  return `${resultCount} source ${resultCount === 1 ? "result" : "results"} found.`;
}

function formatReason(result: SourceLexicalSearchResult): string {
  const fieldsByTerm = new Map<string, Set<string>>();

  for (const match of result.matchedFields) {
    const fields = fieldsByTerm.get(match.term) ?? new Set<string>();
    fields.add(match.field);
    fieldsByTerm.set(match.term, fields);
  }

  return [...fieldsByTerm.entries()]
    .map(([term, fields]) => `${term} in ${[...fields].join(", ")}`)
    .join("; ");
}

function formatExcerpt(result: SourceLexicalSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  if (!bestChunk) return "";

  return truncate(bestChunk.text);
}

function formatSemanticReason(result: SourceSemanticSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  const score = result.score.toFixed(2);
  if (!bestChunk) return `semantic match ${score}`;
  const location = bestChunk.sectionPath.length > 0 ? bestChunk.sectionPath.join(" > ") : "source body";
  return `semantic match ${score} in ${location}`;
}

function formatSemanticExcerpt(result: SourceSemanticSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  if (!bestChunk) return "";

  return truncate(bestChunk.text);
}

function appendSemanticMessage(
  message: string,
  semantic: SourceSemanticSearchControllerResult | undefined
): string {
  if (!semantic || semantic.status !== "degraded") return message;
  return `${message} ${semantic.message}`;
}

function joinReasons(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return `${left}; ${right}`;
}

function truncate(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).trimEnd()}...`;
}
