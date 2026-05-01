import {
  buildRelationshipGraph,
  detectNoteQualityIssues,
  searchLexicalIndex,
  searchSemanticVectors,
  suggestLinksForNote,
  suggestTagsForNote,
  type ChunkRecord,
  type IndexHealth,
  type LinkSuggestion,
  type LexicalIndexRecord,
  type NoteRecord,
  type NoteQualityIssue,
  type ResolvedLink,
  type TagSuggestion,
  type VaultSnapshot
} from "@vaultseer/core";
import type { LinkInput, SemanticSearchResult, VectorRecord } from "@vaultseer/core";

export type WorkbenchNoteSummary = {
  path: string;
  title: string;
  tags: string[];
  aliases: string[];
};

export type WorkbenchRelatedNote = {
  notePath: string;
  title: string;
  score: number;
  reason: string;
};

export type WorkbenchTagSuggestion = {
  tag: string;
  confidence: number;
  reason: string;
};

export type WorkbenchLinkSuggestion = {
  unresolvedTarget: string;
  rawLink: string;
  suggestedPath: string;
  suggestedTitle: string;
  confidence: number;
  reason: string;
};

export type WorkbenchQualityIssue = {
  id: string;
  kind: NoteQualityIssue["kind"];
  severity: NoteQualityIssue["severity"];
  message: string;
};

export type WorkbenchControlId = "rebuild-index" | "clear-index";

export type WorkbenchControl = {
  id: WorkbenchControlId;
  label: string;
  description: string;
  disabled: boolean;
  disabledReason: string | null;
};

export type WorkbenchState =
  | {
      status: "blocked";
      message: string;
      healthSummary: string;
      controls: WorkbenchControl[];
      currentNote: null;
      outgoingLinks: [];
      unresolvedLinks: [];
      backlinks: [];
      relatedNotes: [];
      linkSuggestions: [];
      tagSuggestions: [];
      qualityIssues: [];
      warnings: [];
    }
  | {
      status: "ready";
      message: string;
      healthSummary: string;
      controls: WorkbenchControl[];
      currentNote: WorkbenchNoteSummary | null;
      outgoingLinks: ResolvedLink[];
      unresolvedLinks: LinkInput[];
      backlinks: string[];
      relatedNotes: WorkbenchRelatedNote[];
      linkSuggestions: WorkbenchLinkSuggestion[];
      tagSuggestions: WorkbenchTagSuggestion[];
      qualityIssues: WorkbenchQualityIssue[];
      warnings: string[];
    };

export type BuildWorkbenchStateInput = {
  activePath: string | null;
  health: IndexHealth;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexRecord[];
  vectors?: VectorRecord[];
  relatedLimit?: number;
};

type RelatedAccumulator = {
  notePath: string;
  title: string;
  score: number;
  reasons: Set<string>;
};

export function buildWorkbenchState(input: BuildWorkbenchStateInput): WorkbenchState {
  const healthSummary = formatHealthSummary(input.health);
  const controls = buildWorkbenchControls(input.health);
  const blockedMessage = getBlockedMessage(input.health);

  if (blockedMessage) {
    return {
      status: "blocked",
      message: blockedMessage,
      healthSummary,
      controls,
      currentNote: null,
      outgoingLinks: [],
      unresolvedLinks: [],
      backlinks: [],
      relatedNotes: [],
      linkSuggestions: [],
      tagSuggestions: [],
      qualityIssues: [],
      warnings: []
    };
  }

  if (!input.activePath) {
    return {
      status: "ready",
      message: "Open a Markdown note to inspect it in Vaultseer.",
      healthSummary,
      controls,
      currentNote: null,
      outgoingLinks: [],
      unresolvedLinks: [],
      backlinks: [],
      relatedNotes: [],
      linkSuggestions: [],
      tagSuggestions: [],
      qualityIssues: [],
      warnings: statusWarnings(input.health)
    };
  }

  const snapshot = createSnapshotFromNotes(input.notes);
  const currentNote = snapshot.notesByPath[input.activePath];

  if (!currentNote) {
    return {
      status: "ready",
      message: "Active note is not in the indexed mirror. Rebuild the Vaultseer index to inspect it.",
      healthSummary,
      controls,
      currentNote: null,
      outgoingLinks: [],
      unresolvedLinks: [],
      backlinks: [],
      relatedNotes: [],
      linkSuggestions: [],
      tagSuggestions: [],
      qualityIssues: [],
      warnings: statusWarnings(input.health)
    };
  }

  const graph = buildRelationshipGraph(snapshot);
  const outgoingLinks = graph.resolvedLinksByPath[currentNote.path] ?? [];
  const unresolvedLinks = graph.unresolvedLinksByPath[currentNote.path] ?? [];
  const backlinks = graph.backlinksByPath[currentNote.path] ?? [];

  return {
    status: "ready",
    message: getReadyMessage(input.health),
    healthSummary,
    controls,
    currentNote: {
      path: currentNote.path,
      title: currentNote.title,
      tags: currentNote.tags,
      aliases: currentNote.aliases
    },
    outgoingLinks,
    unresolvedLinks,
    backlinks,
    relatedNotes: buildRelatedNotes({
      currentNote,
      notes: input.notes,
      chunks: input.chunks,
      lexicalIndex: input.lexicalIndex,
      vectors: input.vectors ?? [],
      outgoingLinks,
      backlinks,
      limit: input.relatedLimit ?? 6
    }),
    linkSuggestions: suggestLinksForNote({
      currentNote,
      notes: input.notes,
      graph,
      limit: 6
    }).map(toWorkbenchLinkSuggestion),
    tagSuggestions: suggestTagsForNote({
      currentNote,
      notes: input.notes,
      graph,
      limit: 6
    }).map(toWorkbenchTagSuggestion),
    qualityIssues: detectNoteQualityIssues({
      currentNote,
      graph
    }).map(toWorkbenchQualityIssue),
    warnings: [
      ...statusWarnings(input.health),
      ...relationshipWarnings(currentNote.path, unresolvedLinks, graph.weaklyConnectedNotePaths)
    ]
  };
}

export function buildWorkbenchControls(health: IndexHealth): WorkbenchControl[] {
  const isIndexing = health.status === "indexing";

  return [
    {
      id: "rebuild-index",
      label: "Rebuild index",
      description: "Refresh Vaultseer's disposable mirror from the current Obsidian vault.",
      disabled: isIndexing,
      disabledReason: isIndexing ? "Indexing is already running." : null
    },
    {
      id: "clear-index",
      label: "Clear index",
      description: "Discard Vaultseer's disposable mirror without changing Markdown notes.",
      disabled: isIndexing || health.status === "empty",
      disabledReason: isIndexing
        ? "Indexing is already running."
        : health.status === "empty"
          ? "The mirror is already empty."
          : null
    }
  ];
}

function getBlockedMessage(health: IndexHealth): string | null {
  switch (health.status) {
    case "empty":
      return "Rebuild the Vaultseer index before opening the workbench.";
    case "error":
      return health.statusMessage ? `Vaultseer index has an error: ${health.statusMessage}` : "Vaultseer index has an error.";
    case "indexing":
      return "Vaultseer is rebuilding the index. The workbench will be available after the rebuild finishes.";
    case "ready":
    case "stale":
    case "degraded":
      return null;
  }
}

function getReadyMessage(health: IndexHealth): string {
  if (health.status === "stale") {
    return health.statusMessage
      ? `Showing the last indexed mirror. ${health.statusMessage}`
      : "Showing the last indexed mirror. Rebuild when you want fresh workbench data.";
  }

  if (health.status === "degraded") {
    return health.statusMessage
      ? `Workbench is available with a warning: ${health.statusMessage}`
      : "Workbench is available, but optional analysis is degraded.";
  }

  return "Showing the indexed mirror for the active note.";
}

function statusWarnings(health: IndexHealth): string[] {
  if (health.status === "degraded" && health.statusMessage) return [health.statusMessage];
  return [];
}

function relationshipWarnings(path: string, unresolvedLinks: LinkInput[], weaklyConnectedNotePaths: string[]): string[] {
  const warnings: string[] = [];

  if (weaklyConnectedNotePaths.includes(path)) {
    warnings.push("This note has no resolved outgoing links or backlinks in the indexed mirror.");
  }

  if (unresolvedLinks.length > 0) {
    warnings.push(`${unresolvedLinks.length} unresolved link${unresolvedLinks.length === 1 ? "" : "s"} found.`);
  }

  return warnings;
}

function toWorkbenchTagSuggestion(suggestion: TagSuggestion): WorkbenchTagSuggestion {
  return {
    tag: suggestion.tag,
    confidence: suggestion.confidence,
    reason: suggestion.reason
  };
}

function toWorkbenchLinkSuggestion(suggestion: LinkSuggestion): WorkbenchLinkSuggestion {
  return {
    unresolvedTarget: suggestion.unresolvedTarget,
    rawLink: suggestion.rawLink,
    suggestedPath: suggestion.suggestedPath,
    suggestedTitle: suggestion.suggestedTitle,
    confidence: suggestion.confidence,
    reason: suggestion.reason
  };
}

function toWorkbenchQualityIssue(issue: NoteQualityIssue): WorkbenchQualityIssue {
  return {
    id: issue.id,
    kind: issue.kind,
    severity: issue.severity,
    message: issue.message
  };
}

function buildRelatedNotes(input: {
  currentNote: NoteRecord;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexRecord[];
  vectors: VectorRecord[];
  outgoingLinks: ResolvedLink[];
  backlinks: string[];
  limit: number;
}): WorkbenchRelatedNote[] {
  const noteByPath = new Map(input.notes.map((note) => [note.path, note]));
  const related = new Map<string, RelatedAccumulator>();

  for (const link of input.outgoingLinks) {
    addRelated(related, noteByPath, link.targetPath, 40, "linked note");
  }

  for (const backlinkPath of input.backlinks) {
    addRelated(related, noteByPath, backlinkPath, 35, "backlink");
  }

  for (const tag of input.currentNote.tags) {
    for (const note of input.notes) {
      if (note.path === input.currentNote.path || !note.tags.includes(tag)) continue;
      addRelated(related, noteByPath, note.path, 20, `shared tag ${tag}`);
    }
  }

  for (const query of buildRelatedQueries(input.currentNote)) {
    const lexicalResults = searchLexicalIndex({
      query,
      index: input.lexicalIndex,
      notes: input.notes,
      chunks: input.chunks,
      limit: input.limit + 1
    });

    for (const result of lexicalResults) {
      if (result.notePath === input.currentNote.path) continue;
      addRelated(related, noteByPath, result.notePath, Math.max(1, result.score / 10), `lexical match: ${result.matchedTerms.join(", ")}`);
    }
  }

  addSemanticRelatedNotes({
    currentNote: input.currentNote,
    notes: input.notes,
    chunks: input.chunks,
    vectors: input.vectors,
    related,
    noteByPath,
    limit: input.limit
  });

  return [...related.values()]
    .map((candidate) => ({
      notePath: candidate.notePath,
      title: candidate.title,
      score: candidate.score,
      reason: [...candidate.reasons].join("; ")
    }))
    .sort((left, right) => right.score - left.score || left.notePath.localeCompare(right.notePath))
    .slice(0, input.limit);
}

function addSemanticRelatedNotes(input: {
  currentNote: NoteRecord;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  vectors: VectorRecord[];
  related: Map<string, RelatedAccumulator>;
  noteByPath: Map<string, NoteRecord>;
  limit: number;
}): void {
  const currentChunks = input.chunks.filter((chunk) => chunk.notePath === input.currentNote.path);
  if (currentChunks.length === 0 || input.vectors.length === 0) return;

  const currentChunkById = new Map(currentChunks.map((chunk) => [chunk.id, chunk]));
  const queryVectors = input.vectors.filter((vector) => {
    const chunk = currentChunkById.get(vector.chunkId);
    return Boolean(chunk && vector.contentHash === chunk.normalizedTextHash);
  });

  for (const queryVector of queryVectors) {
    const results = searchSemanticVectors({
      queryVector: queryVector.vector,
      modelNamespace: queryVector.model,
      notes: input.notes,
      chunks: input.chunks,
      vectors: input.vectors,
      limit: input.limit + 5,
      minScore: 0.75,
      maxChunksPerNote: 1
    });

    for (const result of results) {
      if (result.notePath === input.currentNote.path) continue;
      addRelated(input.related, input.noteByPath, result.notePath, semanticRelatedScore(result), formatSemanticRelatedReason(result));
    }
  }
}

function semanticRelatedScore(result: SemanticSearchResult): number {
  return Math.max(1, result.score * 30);
}

function formatSemanticRelatedReason(result: SemanticSearchResult): string {
  const bestChunk = result.matchedChunks[0];
  const score = result.score.toFixed(2);
  if (!bestChunk) return `semantic match ${score}`;
  const location = bestChunk.headingPath.length > 0 ? bestChunk.headingPath.join(" > ") : result.title;
  return `semantic match ${score} in ${location}`;
}

function addRelated(
  related: Map<string, RelatedAccumulator>,
  noteByPath: Map<string, NoteRecord>,
  notePath: string,
  score: number,
  reason: string
): void {
  const note = noteByPath.get(notePath);
  if (!note) return;

  const existing = related.get(notePath) ?? {
    notePath,
    title: note.title,
    score: 0,
    reasons: new Set<string>()
  };
  existing.score += score;
  existing.reasons.add(reason);
  related.set(notePath, existing);
}

function buildRelatedQueries(note: NoteRecord): string[] {
  return [
    ...note.tags.map((tag) => `#${tag}`),
    ...note.aliases,
    note.title
  ].filter((query) => query.trim().length > 0);
}

function createSnapshotFromNotes(notes: NoteRecord[]): VaultSnapshot {
  const sortedNotes = [...notes].sort((left, right) => left.path.localeCompare(right.path));
  const notesByPath = Object.fromEntries(sortedNotes.map((note) => [note.path, note]));
  const notePathsByTag: Record<string, string[]> = {};

  for (const note of sortedNotes) {
    for (const tag of note.tags) {
      notePathsByTag[tag] ??= [];
      notePathsByTag[tag]!.push(note.path);
    }
  }

  return {
    notes: sortedNotes,
    notesByPath,
    notePathsByTag: Object.fromEntries(
      Object.entries(notePathsByTag)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([tag, paths]) => [tag, paths.sort()])
    ),
    outgoingLinksByPath: Object.fromEntries(
      sortedNotes.map((note) => [note.path, [...new Set(note.links.map((link) => link.target))].sort()])
    )
  };
}

function formatHealthSummary(health: IndexHealth): string {
  return `${health.status}: ${health.noteCount} notes, ${health.chunkCount} chunks`;
}
