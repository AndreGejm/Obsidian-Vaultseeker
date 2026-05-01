import { buildRelationshipGraph } from "../relationships/graph";
import type { RelationshipGraph } from "../relationships/types";
import type { LinkInput, NoteRecord, VaultSnapshot } from "../types";

export type LinkSuggestionEvidence =
  | { type: "unresolved_link"; raw: string; target: string }
  | { type: "alias_match"; alias: string }
  | { type: "title_match"; title: string }
  | { type: "token_overlap"; tokens: string[] };

export type LinkSuggestion = {
  unresolvedTarget: string;
  rawLink: string;
  suggestedPath: string;
  suggestedTitle: string;
  score: number;
  confidence: number;
  evidence: LinkSuggestionEvidence[];
  reason: string;
};

export type SuggestLinksForNoteInput = {
  currentNote: NoteRecord;
  notes: NoteRecord[];
  graph?: RelationshipGraph;
  limit?: number;
};

type CandidateScore = {
  note: NoteRecord;
  score: number;
  evidence: LinkSuggestionEvidence[];
};

const DEFAULT_LINK_SUGGESTION_LIMIT = 6;
const EXACT_ALIAS_SCORE = 50;
const EXACT_TITLE_SCORE = 45;
const TOKEN_OVERLAP_SCORE = 8;
const MIN_LINK_SUGGESTION_SCORE = 8;

export function suggestLinksForNote(input: SuggestLinksForNoteInput): LinkSuggestion[] {
  const graph = input.graph ?? buildRelationshipGraph(createSnapshotFromNotes(input.notes));
  const alreadyLinkedPaths = new Set((graph.resolvedLinksByPath[input.currentNote.path] ?? []).map((link) => link.targetPath));
  const suggestions: LinkSuggestion[] = [];

  for (const unresolvedLink of graph.unresolvedLinksByPath[input.currentNote.path] ?? []) {
    const candidate = findBestCandidate({
      unresolvedLink,
      notes: input.notes,
      currentPath: input.currentNote.path,
      alreadyLinkedPaths
    });

    if (!candidate) continue;
    suggestions.push(toLinkSuggestion(unresolvedLink, candidate));
  }

  return suggestions
    .sort((left, right) => right.score - left.score || left.unresolvedTarget.localeCompare(right.unresolvedTarget))
    .slice(0, input.limit ?? DEFAULT_LINK_SUGGESTION_LIMIT);
}

function findBestCandidate(input: {
  unresolvedLink: LinkInput;
  notes: NoteRecord[];
  currentPath: string;
  alreadyLinkedPaths: Set<string>;
}): CandidateScore | null {
  const candidates = input.notes
    .filter((note) => note.path !== input.currentPath && !input.alreadyLinkedPaths.has(note.path))
    .map((note) => scoreCandidate(input.unresolvedLink.target, note))
    .filter((candidate) => candidate.score >= MIN_LINK_SUGGESTION_SCORE)
    .sort(compareCandidates);

  return candidates[0] ?? null;
}

function scoreCandidate(target: string, note: NoteRecord): CandidateScore {
  const normalizedTarget = normalizeComparableText(target);
  const evidence: LinkSuggestionEvidence[] = [];
  let score = 0;

  const matchingAlias = note.aliases.find((alias) => normalizeComparableText(alias) === normalizedTarget);
  if (matchingAlias) {
    score += EXACT_ALIAS_SCORE;
    evidence.push({ type: "alias_match", alias: matchingAlias });
  }

  if (normalizeComparableText(note.title) === normalizedTarget || normalizeComparableText(note.basename) === normalizedTarget) {
    score += EXACT_TITLE_SCORE;
    evidence.push({ type: "title_match", title: note.title });
  }

  const overlapTokens = overlappingTokens(target, [
    note.path,
    note.basename,
    note.title,
    ...note.aliases
  ]);
  if (overlapTokens.length > 0) {
    score += overlapTokens.length * TOKEN_OVERLAP_SCORE;
    evidence.push({ type: "token_overlap", tokens: overlapTokens });
  }

  return {
    note,
    score,
    evidence
  };
}

function toLinkSuggestion(unresolvedLink: LinkInput, candidate: CandidateScore): LinkSuggestion {
  const evidence = sortEvidence([
    { type: "unresolved_link", raw: unresolvedLink.raw, target: unresolvedLink.target },
    ...candidate.evidence
  ]);
  const score = roundScore(candidate.score);

  return {
    unresolvedTarget: unresolvedLink.target,
    rawLink: unresolvedLink.raw,
    suggestedPath: candidate.note.path,
    suggestedTitle: candidate.note.title,
    score,
    confidence: roundScore(Math.min(0.95, score / (score + 20))),
    evidence,
    reason: formatReason(evidence)
  };
}

function compareCandidates(left: CandidateScore, right: CandidateScore): number {
  return right.score - left.score || left.note.path.localeCompare(right.note.path);
}

function sortEvidence(evidence: LinkSuggestionEvidence[]): LinkSuggestionEvidence[] {
  return [...evidence].sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
}

function formatReason(evidence: LinkSuggestionEvidence[]): string {
  const parts = evidence.map((item) => {
    switch (item.type) {
      case "unresolved_link":
        return `unresolved link ${item.raw}`;
      case "alias_match":
        return `alias ${item.alias}`;
      case "title_match":
        return `title ${item.title}`;
      case "token_overlap":
        return `shared words ${item.tokens.join(", ")}`;
    }
  });

  return [...new Set(parts)].join("; ");
}

function evidenceKey(evidence: LinkSuggestionEvidence): string {
  switch (evidence.type) {
    case "unresolved_link":
      return `${evidence.type}\u001f${evidence.raw}\u001f${evidence.target}`;
    case "alias_match":
      return `${evidence.type}\u001f${evidence.alias}`;
    case "title_match":
      return `${evidence.type}\u001f${evidence.title}`;
    case "token_overlap":
      return `${evidence.type}\u001f${evidence.tokens.join(" ")}`;
  }
}

function overlappingTokens(target: string, values: string[]): string[] {
  const targetTokens = tokenize(target);
  const valueTokens = new Set(values.flatMap(tokenize));
  return targetTokens.filter((token) => valueTokens.has(token)).sort((left, right) => left.localeCompare(right));
}

function tokenize(value: string): string[] {
  return [...new Set(normalizeComparableText(value).split(" ").filter((token) => token.length >= 3))];
}

function normalizeComparableText(value: string): string {
  return value
    .replace(/\.md$/i, "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
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
