import type { VectorRecord } from "../storage/types";
import { cosineSimilarity, validPositiveInteger, vectorMagnitude } from "../semantic/vector-math";
import type { SourceChunkRecord, SourceProvenance, SourceRecord } from "./types";

export type SourceSemanticMatchedChunk = {
  chunkId: string;
  sectionPath: string[];
  text: string;
  provenance: SourceProvenance;
  score: number;
};

export type SourceSemanticSearchResult = {
  sourceId: string;
  sourcePath: string;
  filename: string;
  score: number;
  matchedChunks: SourceSemanticMatchedChunk[];
};

export type SourceSemanticSearchInput = {
  queryVector: number[];
  modelNamespace: string;
  sources: SourceRecord[];
  chunks: SourceChunkRecord[];
  vectors: VectorRecord[];
  limit?: number;
  minScore?: number;
  maxChunksPerSource?: number;
};

type MutableSourceSemanticResult = {
  sourceId: string;
  sourcePath: string;
  filename: string;
  score: number;
  matchedChunksById: Map<string, SourceSemanticMatchedChunk>;
};

export function searchSourceSemanticVectors(input: SourceSemanticSearchInput): SourceSemanticSearchResult[] {
  const queryMagnitude = vectorMagnitude(input.queryVector);
  if (!Number.isFinite(queryMagnitude) || queryMagnitude <= 0) return [];

  const limit = validPositiveInteger(input.limit) ?? 20;
  const minScore = Number.isFinite(input.minScore) ? input.minScore! : 0;
  const maxChunksPerSource = validPositiveInteger(input.maxChunksPerSource) ?? 3;
  const sourceById = new Map(
    input.sources
      .filter((source) => source.status === "extracted")
      .map((source) => [source.id, source])
  );
  const chunkById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));
  const resultsBySourceId = new Map<string, MutableSourceSemanticResult>();

  for (const vector of input.vectors) {
    if (vector.model !== input.modelNamespace) continue;
    if (vector.dimensions !== input.queryVector.length || vector.vector.length !== input.queryVector.length) continue;

    const chunk = chunkById.get(vector.chunkId);
    if (!chunk || vector.contentHash !== chunk.normalizedTextHash) continue;

    const source = sourceById.get(chunk.sourceId);
    if (!source) continue;

    const score = cosineSimilarity(input.queryVector, queryMagnitude, vector.vector);
    if (!Number.isFinite(score) || score < minScore) continue;

    const result = getOrCreateResult(resultsBySourceId, source);
    result.score = Math.max(result.score, score);

    const previousChunk = result.matchedChunksById.get(chunk.id);
    if (!previousChunk || score > previousChunk.score) {
      result.matchedChunksById.set(chunk.id, {
        chunkId: chunk.id,
        sectionPath: [...chunk.sectionPath],
        text: chunk.text,
        provenance: cloneProvenance(chunk.provenance),
        score
      });
    }
  }

  return [...resultsBySourceId.values()]
    .map((result) => finalizeResult(result, maxChunksPerSource))
    .sort((left, right) => right.score - left.score || left.sourcePath.localeCompare(right.sourcePath))
    .slice(0, limit);
}

function getOrCreateResult(
  resultsBySourceId: Map<string, MutableSourceSemanticResult>,
  source: SourceRecord
): MutableSourceSemanticResult {
  const existing = resultsBySourceId.get(source.id);
  if (existing) return existing;

  const created: MutableSourceSemanticResult = {
    sourceId: source.id,
    sourcePath: source.sourcePath,
    filename: source.filename,
    score: Number.NEGATIVE_INFINITY,
    matchedChunksById: new Map<string, SourceSemanticMatchedChunk>()
  };
  resultsBySourceId.set(source.id, created);
  return created;
}

function finalizeResult(
  result: MutableSourceSemanticResult,
  maxChunksPerSource: number
): SourceSemanticSearchResult {
  return {
    sourceId: result.sourceId,
    sourcePath: result.sourcePath,
    filename: result.filename,
    score: result.score,
    matchedChunks: [...result.matchedChunksById.values()]
      .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
      .slice(0, maxChunksPerSource)
  };
}

function cloneProvenance(provenance: SourceProvenance): SourceProvenance {
  if (provenance.kind === "section") return { ...provenance, sectionPath: [...provenance.sectionPath] };
  return { ...provenance };
}
