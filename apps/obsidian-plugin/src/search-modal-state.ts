import type {
  ChunkRecord,
  IndexHealth,
  LexicalIndexRecord,
  LexicalSearchResult,
  NoteRecord,
  SemanticSearchResult
} from "@vaultseer/core";
import { searchLexicalIndex } from "@vaultseer/core";
import type { SemanticSearchControllerResult } from "./semantic-search-controller";

export type SearchModalResult = {
  notePath: string;
  title: string;
  score: number;
  source: "lexical" | "semantic" | "hybrid";
  reason: string;
  excerpt: string;
};

export type SearchModalState =
  | {
      status: "blocked";
      message: string;
      results: [];
    }
  | {
      status: "ready";
      message: string;
      results: SearchModalResult[];
    };

export type BuildSearchModalStateInput = {
  query: string;
  health: IndexHealth;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexRecord[];
  semantic?: SemanticSearchControllerResult;
  limit?: number;
};

export function buildSearchModalState(input: BuildSearchModalStateInput): SearchModalState {
  const blockedMessage = getBlockedMessage(input.health);
  if (blockedMessage) {
    return {
      status: "blocked",
      message: blockedMessage,
      results: []
    };
  }

  if (!input.query.trim()) {
    return {
      status: "ready",
      message: "Type a word, tag, title, alias, or topic to search the indexed mirror.",
      results: []
    };
  }

  const lexicalResults = searchLexicalIndex({
    query: input.query,
    index: input.lexicalIndex,
    notes: input.notes,
    chunks: input.chunks,
    limit: input.limit ?? 20
  }).map(toModalResult);
  const results = mergeResults(
    lexicalResults,
    input.semantic?.status === "ready" ? input.semantic.results.map(toSemanticModalResult) : [],
    input.limit ?? 20
  );

  return {
    status: "ready",
    message: appendSemanticMessage(getSearchableMessage(input.health, results.length), input.semantic),
    results
  };
}

function getBlockedMessage(health: IndexHealth): string | null {
  switch (health.status) {
    case "empty":
      return "Rebuild the Vaultseer index before searching.";
    case "error":
      return health.statusMessage ? `Vaultseer index has an error: ${health.statusMessage}` : "Vaultseer index has an error.";
    case "indexing":
      return "Vaultseer is rebuilding the index. Search will be available after the rebuild finishes.";
    case "ready":
    case "stale":
    case "degraded":
      return null;
  }
}

function getSearchableMessage(health: IndexHealth, resultCount: number): string {
  if (health.status === "stale") {
    return health.statusMessage
      ? `Showing the last indexed mirror. ${health.statusMessage}`
      : "Showing the last indexed mirror. Rebuild when you want fresh results.";
  }

  if (health.status === "degraded") {
    return health.statusMessage
      ? `Search is available with a warning: ${health.statusMessage}`
      : "Search is available, but optional analysis is degraded.";
  }

  if (resultCount === 0) return "No results found.";
  return `${resultCount} ${resultCount === 1 ? "result" : "results"} found.`;
}

function toModalResult(result: LexicalSearchResult): SearchModalResult {
  return {
    notePath: result.notePath,
    title: result.title,
    score: result.score,
    source: "lexical",
    reason: formatReason(result),
    excerpt: formatExcerpt(result)
  };
}

function toSemanticModalResult(result: SemanticSearchResult): SearchModalResult {
  return {
    notePath: result.notePath,
    title: result.title,
    score: result.score,
    source: "semantic",
    reason: formatSemanticReason(result),
    excerpt: formatSemanticExcerpt(result)
  };
}

function mergeResults(
  lexicalResults: SearchModalResult[],
  semanticResults: SearchModalResult[],
  limit: number
): SearchModalResult[] {
  const mergedByPath = new Map<string, SearchModalResult>();
  const order: string[] = [];

  for (const result of lexicalResults) {
    mergedByPath.set(result.notePath, result);
    order.push(result.notePath);
  }

  for (const result of semanticResults) {
    const existing = mergedByPath.get(result.notePath);
    if (!existing) {
      mergedByPath.set(result.notePath, result);
      order.push(result.notePath);
      continue;
    }

    mergedByPath.set(result.notePath, {
      ...existing,
      score: Math.max(existing.score, result.score),
      source: "hybrid",
      reason: joinReasons(existing.reason, result.reason),
      excerpt: existing.excerpt || result.excerpt
    });
  }

  return order.map((path) => mergedByPath.get(path)!).slice(0, limit);
}

function formatReason(result: LexicalSearchResult): string {
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

function formatExcerpt(result: LexicalSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  if (!bestChunk) return "";

  const text = bestChunk.text.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).trimEnd()}...`;
}

function formatSemanticReason(result: SemanticSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  const score = result.score.toFixed(2);
  if (!bestChunk) return `semantic match ${score}`;
  const location = bestChunk.headingPath.length > 0 ? bestChunk.headingPath.join(" > ") : "note body";
  return `semantic match ${score} in ${location}`;
}

function formatSemanticExcerpt(result: SemanticSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  if (!bestChunk) return "";

  const text = bestChunk.text.replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).trimEnd()}...`;
}

function appendSemanticMessage(message: string, semantic: SemanticSearchControllerResult | undefined): string {
  if (!semantic || semantic.status !== "degraded") return message;
  return `${message} Semantic search is unavailable. Lexical search still works.`;
}

function joinReasons(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return `${left}; ${right}`;
}
