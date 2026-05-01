import { tokenizeQuery, tokenizeText } from "../search/lexical-terms";
import type { SourceChunkRecord, SourceRecord } from "./types";

export type SourceLexicalField = "filename" | "section" | "body";

export type SourceLexicalIndexRecord = {
  term: string;
  refs: SourceLexicalRef[];
};

export type SourceLexicalRef = {
  sourceId: string;
  sourcePath: string;
  chunkId?: string;
  field: SourceLexicalField;
};

export type SourceLexicalMatchedField = {
  term: string;
  field: SourceLexicalField;
  chunkId?: string;
};

export type SourceLexicalMatchedChunk = {
  chunkId: string;
  sectionPath: string[];
  text: string;
  matchedTerms: string[];
};

export type SourceLexicalSearchResult = {
  sourceId: string;
  sourcePath: string;
  filename: string;
  score: number;
  matchedTerms: string[];
  matchedFields: SourceLexicalMatchedField[];
  matchedChunks: SourceLexicalMatchedChunk[];
};

export type SourceLexicalSearchInput = {
  query: string;
  index: SourceLexicalIndexRecord[];
  sources: SourceRecord[];
  chunks: SourceChunkRecord[];
  limit?: number;
};

type MutableSourceLexicalSearchResult = {
  sourceId: string;
  sourcePath: string;
  filename: string;
  score: number;
  termSet: Set<string>;
  fieldKeys: Set<string>;
  matchedFields: SourceLexicalMatchedField[];
  matchedChunksById: Map<string, MutableSourceLexicalMatchedChunk>;
};

type MutableSourceLexicalMatchedChunk = {
  chunkId: string;
  sectionPath: string[];
  text: string;
  termSet: Set<string>;
};

const SOURCE_FIELD_WEIGHTS: Record<SourceLexicalField, number> = {
  filename: 8,
  section: 5,
  body: 1
};

export function buildSourceLexicalIndex(
  sources: SourceRecord[],
  chunks: SourceChunkRecord[]
): SourceLexicalIndexRecord[] {
  const records = new Map<string, Map<string, SourceLexicalRef>>();
  const extractedSourceIds = new Set<string>();

  for (const source of sources) {
    if (source.status !== "extracted") continue;
    extractedSourceIds.add(source.id);
    addTextRefs(records, source.filename, {
      sourceId: source.id,
      sourcePath: source.sourcePath,
      field: "filename"
    });
  }

  for (const chunk of chunks) {
    if (!extractedSourceIds.has(chunk.sourceId)) continue;
    const baseRef = {
      sourceId: chunk.sourceId,
      sourcePath: chunk.sourcePath,
      chunkId: chunk.id
    };
    addTextRefs(records, chunk.sectionPath.join(" "), {
      ...baseRef,
      field: "section"
    });
    addTextRefs(records, chunk.text, {
      ...baseRef,
      field: "body"
    });
  }

  return [...records.entries()]
    .map(([term, refs]) => ({
      term,
      refs: [...refs.values()].sort(compareSourceRefs)
    }))
    .sort((left, right) => left.term.localeCompare(right.term));
}

export function searchSourceLexicalIndex(input: SourceLexicalSearchInput): SourceLexicalSearchResult[] {
  const queryTerms = tokenizeQuery(input.query);
  if (queryTerms.length === 0) return [];

  const indexByTerm = new Map(input.index.map((record) => [record.term, record.refs]));
  const sourceById = new Map(
    input.sources
      .filter((source) => source.status === "extracted")
      .map((source) => [source.id, source])
  );
  const chunkById = new Map(
    input.chunks
      .filter((chunk) => sourceById.has(chunk.sourceId))
      .map((chunk) => [chunk.id, chunk])
  );
  const resultsById = new Map<string, MutableSourceLexicalSearchResult>();

  for (const term of queryTerms) {
    for (const ref of indexByTerm.get(term) ?? []) {
      const source = sourceById.get(ref.sourceId);
      if (!source) continue;

      const result = getOrCreateSourceResult(resultsById, source);
      const fieldKey = `${term}\u001f${ref.field}\u001f${ref.chunkId ?? ""}`;
      if (!result.fieldKeys.has(fieldKey)) {
        result.fieldKeys.add(fieldKey);
        result.score += SOURCE_FIELD_WEIGHTS[ref.field];
        result.matchedFields.push({
          term,
          field: ref.field,
          ...(ref.chunkId ? { chunkId: ref.chunkId } : {})
        });
      }

      result.termSet.add(term);

      if (ref.chunkId) {
        const chunk = chunkById.get(ref.chunkId);
        if (chunk) {
          const chunkResult = getOrCreateSourceMatchedChunk(result, chunk);
          chunkResult.termSet.add(term);
        }
      }
    }
  }

  return [...resultsById.values()]
    .filter((result) => queryTerms.every((term) => result.termSet.has(term)))
    .map((result) => finalizeSourceResult(result, queryTerms))
    .sort((left, right) => right.score - left.score || left.sourcePath.localeCompare(right.sourcePath))
    .slice(0, input.limit ?? 20);
}

function addTextRefs(records: Map<string, Map<string, SourceLexicalRef>>, value: string, ref: SourceLexicalRef): void {
  for (const term of tokenizeText(value)) {
    addRef(records, term, ref);
  }
}

function addRef(records: Map<string, Map<string, SourceLexicalRef>>, term: string, ref: SourceLexicalRef): void {
  if (!term) return;
  const refs = records.get(term) ?? new Map<string, SourceLexicalRef>();
  refs.set(sourceRefKey(ref), { ...ref });
  records.set(term, refs);
}

function sourceRefKey(ref: SourceLexicalRef): string {
  return `${ref.sourceId}\u001f${ref.chunkId ?? ""}\u001f${ref.field}`;
}

function compareSourceRefs(left: SourceLexicalRef, right: SourceLexicalRef): number {
  return (
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.sourceId.localeCompare(right.sourceId) ||
    (left.chunkId ?? "").localeCompare(right.chunkId ?? "") ||
    left.field.localeCompare(right.field)
  );
}

function getOrCreateSourceResult(
  resultsById: Map<string, MutableSourceLexicalSearchResult>,
  source: SourceRecord
): MutableSourceLexicalSearchResult {
  const existing = resultsById.get(source.id);
  if (existing) return existing;

  const created: MutableSourceLexicalSearchResult = {
    sourceId: source.id,
    sourcePath: source.sourcePath,
    filename: source.filename,
    score: 0,
    termSet: new Set<string>(),
    fieldKeys: new Set<string>(),
    matchedFields: [],
    matchedChunksById: new Map<string, MutableSourceLexicalMatchedChunk>()
  };
  resultsById.set(source.id, created);
  return created;
}

function getOrCreateSourceMatchedChunk(
  result: MutableSourceLexicalSearchResult,
  chunk: SourceChunkRecord
): MutableSourceLexicalMatchedChunk {
  const existing = result.matchedChunksById.get(chunk.id);
  if (existing) return existing;

  const created: MutableSourceLexicalMatchedChunk = {
    chunkId: chunk.id,
    sectionPath: chunk.sectionPath,
    text: chunk.text,
    termSet: new Set<string>()
  };
  result.matchedChunksById.set(chunk.id, created);
  return created;
}

function finalizeSourceResult(
  result: MutableSourceLexicalSearchResult,
  queryTerms: string[]
): SourceLexicalSearchResult {
  const queryOrder = new Map(queryTerms.map((term, index) => [term, index]));
  const matchedTerms = queryTerms.filter((term) => result.termSet.has(term));

  return {
    sourceId: result.sourceId,
    sourcePath: result.sourcePath,
    filename: result.filename,
    score: result.score,
    matchedTerms,
    matchedFields: result.matchedFields.sort(
      (left, right) =>
        (queryOrder.get(left.term) ?? 0) - (queryOrder.get(right.term) ?? 0) ||
        SOURCE_FIELD_WEIGHTS[right.field] - SOURCE_FIELD_WEIGHTS[left.field] ||
        left.field.localeCompare(right.field) ||
        (left.chunkId ?? "").localeCompare(right.chunkId ?? "")
    ),
    matchedChunks: [...result.matchedChunksById.values()]
      .map((chunk) => ({
        chunkId: chunk.chunkId,
        sectionPath: chunk.sectionPath,
        text: chunk.text,
        matchedTerms: queryTerms.filter((term) => chunk.termSet.has(term))
      }))
      .sort((left, right) => left.chunkId.localeCompare(right.chunkId))
  };
}
