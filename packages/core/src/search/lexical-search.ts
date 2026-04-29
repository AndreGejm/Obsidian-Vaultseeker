import type { ChunkRecord, LexicalIndexRecord } from "../storage/types";
import type { NoteRecord, VaultSnapshot } from "../types";
import { tokenizeQuery, tokenizeTag, tokenizeText } from "./lexical-terms";

export type LexicalMatchedField = {
  term: string;
  field: LexicalIndexRecord["refs"][number]["field"];
  chunkId?: string;
};

export type LexicalMatchedChunk = {
  chunkId: string;
  headingPath: string[];
  text: string;
  matchedTerms: string[];
};

export type LexicalSearchResult = {
  notePath: string;
  title: string;
  score: number;
  matchedTerms: string[];
  matchedFields: LexicalMatchedField[];
  matchedChunks: LexicalMatchedChunk[];
};

export type LexicalSearchInput = {
  query: string;
  index: LexicalIndexRecord[];
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  limit?: number;
};

type LexicalField = LexicalIndexRecord["refs"][number]["field"];
type LexicalRef = LexicalIndexRecord["refs"][number];

const FIELD_WEIGHTS: Record<LexicalField, number> = {
  title: 10,
  alias: 8,
  tag: 7,
  heading: 5,
  body: 1
};

export function buildLexicalIndex(snapshot: VaultSnapshot, chunks: ChunkRecord[]): LexicalIndexRecord[] {
  const records = new Map<string, Map<string, LexicalRef>>();

  for (const note of snapshot.notes) {
    addTextRefs(records, note.title, { notePath: note.path, field: "title" });

    for (const alias of note.aliases) {
      addTextRefs(records, alias, { notePath: note.path, field: "alias" });
    }

    for (const tag of note.tags) {
      addTagRefs(records, tag, { notePath: note.path, field: "tag" });
    }

    for (const heading of note.headings) {
      addTextRefs(records, heading.heading, { notePath: note.path, field: "heading" });
    }
  }

  for (const chunk of chunks) {
    addTextRefs(records, chunk.text, {
      notePath: chunk.notePath,
      chunkId: chunk.id,
      field: "body"
    });
  }

  return [...records.entries()]
    .map(([term, refs]) => ({
      term,
      refs: [...refs.values()].sort(compareRefs)
    }))
    .sort((left, right) => left.term.localeCompare(right.term));
}

export function searchLexicalIndex(input: LexicalSearchInput): LexicalSearchResult[] {
  const queryTerms = tokenizeQuery(input.query);
  if (queryTerms.length === 0) return [];

  const indexByTerm = new Map(input.index.map((record) => [record.term, record.refs]));
  const noteByPath = new Map(input.notes.map((note) => [note.path, note]));
  const chunkById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));
  const resultsByPath = new Map<string, MutableLexicalSearchResult>();

  for (const term of queryTerms) {
    for (const ref of indexByTerm.get(term) ?? []) {
      const note = noteByPath.get(ref.notePath);
      if (!note) continue;

      const result = getOrCreateResult(resultsByPath, note);
      const fieldKey = `${term}\u001f${ref.field}\u001f${ref.chunkId ?? ""}`;
      if (!result.fieldKeys.has(fieldKey)) {
        result.fieldKeys.add(fieldKey);
        result.score += FIELD_WEIGHTS[ref.field];
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
          const chunkResult = getOrCreateMatchedChunk(result, chunk);
          chunkResult.termSet.add(term);
        }
      }
    }
  }

  return [...resultsByPath.values()]
    .filter((result) => queryTerms.every((term) => result.termSet.has(term)))
    .map((result) => finalizeResult(result, queryTerms))
    .sort((left, right) => right.score - left.score || left.notePath.localeCompare(right.notePath))
    .slice(0, input.limit ?? 20);
}

type MutableLexicalSearchResult = {
  notePath: string;
  title: string;
  score: number;
  termSet: Set<string>;
  fieldKeys: Set<string>;
  matchedFields: LexicalMatchedField[];
  matchedChunksById: Map<string, MutableLexicalMatchedChunk>;
};

type MutableLexicalMatchedChunk = {
  chunkId: string;
  headingPath: string[];
  text: string;
  termSet: Set<string>;
};

function addTextRefs(records: Map<string, Map<string, LexicalRef>>, value: string, ref: LexicalRef): void {
  for (const term of tokenizeText(value)) {
    addRef(records, term, ref);
  }
}

function addTagRefs(records: Map<string, Map<string, LexicalRef>>, value: string, ref: LexicalRef): void {
  for (const term of tokenizeTag(value)) {
    addRef(records, term, ref);
  }
}

function addRef(records: Map<string, Map<string, LexicalRef>>, term: string, ref: LexicalRef): void {
  if (!term) return;
  const refs = records.get(term) ?? new Map<string, LexicalRef>();
  refs.set(refKey(ref), { ...ref });
  records.set(term, refs);
}

function refKey(ref: LexicalRef): string {
  return `${ref.notePath}\u001f${ref.chunkId ?? ""}\u001f${ref.field}`;
}

function compareRefs(left: LexicalRef, right: LexicalRef): number {
  return (
    left.notePath.localeCompare(right.notePath) ||
    (left.chunkId ?? "").localeCompare(right.chunkId ?? "") ||
    left.field.localeCompare(right.field)
  );
}

function getOrCreateResult(resultsByPath: Map<string, MutableLexicalSearchResult>, note: NoteRecord): MutableLexicalSearchResult {
  const existing = resultsByPath.get(note.path);
  if (existing) return existing;

  const created: MutableLexicalSearchResult = {
    notePath: note.path,
    title: note.title,
    score: 0,
    termSet: new Set<string>(),
    fieldKeys: new Set<string>(),
    matchedFields: [],
    matchedChunksById: new Map<string, MutableLexicalMatchedChunk>()
  };
  resultsByPath.set(note.path, created);
  return created;
}

function getOrCreateMatchedChunk(result: MutableLexicalSearchResult, chunk: ChunkRecord): MutableLexicalMatchedChunk {
  const existing = result.matchedChunksById.get(chunk.id);
  if (existing) return existing;

  const created: MutableLexicalMatchedChunk = {
    chunkId: chunk.id,
    headingPath: chunk.headingPath,
    text: chunk.text,
    termSet: new Set<string>()
  };
  result.matchedChunksById.set(chunk.id, created);
  return created;
}

function finalizeResult(result: MutableLexicalSearchResult, queryTerms: string[]): LexicalSearchResult {
  const queryOrder = new Map(queryTerms.map((term, index) => [term, index]));
  const matchedTerms = queryTerms.filter((term) => result.termSet.has(term));

  return {
    notePath: result.notePath,
    title: result.title,
    score: result.score,
    matchedTerms,
    matchedFields: result.matchedFields.sort(
      (left, right) =>
        (queryOrder.get(left.term) ?? 0) - (queryOrder.get(right.term) ?? 0) ||
        FIELD_WEIGHTS[right.field] - FIELD_WEIGHTS[left.field] ||
        left.field.localeCompare(right.field) ||
        (left.chunkId ?? "").localeCompare(right.chunkId ?? "")
    ),
    matchedChunks: [...result.matchedChunksById.values()]
      .map((chunk) => ({
        chunkId: chunk.chunkId,
        headingPath: chunk.headingPath,
        text: chunk.text,
        matchedTerms: queryTerms.filter((term) => chunk.termSet.has(term))
      }))
      .sort((left, right) => left.chunkId.localeCompare(right.chunkId))
  };
}
