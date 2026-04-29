import type { ChunkRecord, VectorRecord } from "../storage/types";
import type { NoteRecord } from "../types";
import { cosineSimilarity, validPositiveInteger, vectorMagnitude } from "./vector-math";

export type SemanticMatchedChunk = {
  chunkId: string;
  headingPath: string[];
  text: string;
  score: number;
};

export type SemanticSearchResult = {
  notePath: string;
  title: string;
  score: number;
  matchedChunks: SemanticMatchedChunk[];
};

export type SemanticSearchInput = {
  queryVector: number[];
  modelNamespace: string;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  vectors: VectorRecord[];
  limit?: number;
  minScore?: number;
  maxChunksPerNote?: number;
};

type MutableSemanticResult = {
  notePath: string;
  title: string;
  score: number;
  matchedChunksById: Map<string, SemanticMatchedChunk>;
};

export function searchSemanticVectors(input: SemanticSearchInput): SemanticSearchResult[] {
  const queryMagnitude = vectorMagnitude(input.queryVector);
  if (!Number.isFinite(queryMagnitude) || queryMagnitude <= 0) return [];

  const limit = validPositiveInteger(input.limit) ?? 20;
  const minScore = Number.isFinite(input.minScore) ? input.minScore! : 0;
  const maxChunksPerNote = validPositiveInteger(input.maxChunksPerNote) ?? 3;
  const noteByPath = new Map(input.notes.map((note) => [note.path, note]));
  const chunkById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));
  const resultsByPath = new Map<string, MutableSemanticResult>();

  for (const vector of input.vectors) {
    if (vector.model !== input.modelNamespace) continue;
    if (vector.dimensions !== input.queryVector.length || vector.vector.length !== input.queryVector.length) continue;

    const chunk = chunkById.get(vector.chunkId);
    if (!chunk || vector.contentHash !== chunk.normalizedTextHash) continue;

    const note = noteByPath.get(chunk.notePath);
    if (!note) continue;

    const score = cosineSimilarity(input.queryVector, queryMagnitude, vector.vector);
    if (!Number.isFinite(score) || score < minScore) continue;

    const result = getOrCreateResult(resultsByPath, note);
    result.score = Math.max(result.score, score);

    const previousChunk = result.matchedChunksById.get(chunk.id);
    if (!previousChunk || score > previousChunk.score) {
      result.matchedChunksById.set(chunk.id, {
        chunkId: chunk.id,
        headingPath: [...chunk.headingPath],
        text: chunk.text,
        score
      });
    }
  }

  return [...resultsByPath.values()]
    .map((result) => finalizeResult(result, maxChunksPerNote))
    .sort((left, right) => right.score - left.score || left.notePath.localeCompare(right.notePath))
    .slice(0, limit);
}

function getOrCreateResult(resultsByPath: Map<string, MutableSemanticResult>, note: NoteRecord): MutableSemanticResult {
  const existing = resultsByPath.get(note.path);
  if (existing) return existing;

  const created: MutableSemanticResult = {
    notePath: note.path,
    title: note.title,
    score: Number.NEGATIVE_INFINITY,
    matchedChunksById: new Map<string, SemanticMatchedChunk>()
  };
  resultsByPath.set(note.path, created);
  return created;
}

function finalizeResult(result: MutableSemanticResult, maxChunksPerNote: number): SemanticSearchResult {
  return {
    notePath: result.notePath,
    title: result.title,
    score: result.score,
    matchedChunks: [...result.matchedChunksById.values()]
      .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
      .slice(0, maxChunksPerNote)
  };
}
