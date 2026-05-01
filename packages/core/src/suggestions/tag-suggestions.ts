import { buildRelationshipGraph } from "../relationships/graph";
import type { RelationshipGraph } from "../relationships/types";
import type { NoteRecord, VaultSnapshot } from "../types";

export type TagSuggestionEvidence =
  | { type: "linked_note_tag"; notePath: string; tag: string }
  | { type: "backlink_note_tag"; notePath: string; tag: string }
  | { type: "co_tag"; fromTag: string; count: number }
  | { type: "tag_frequency"; noteCount: number };

export type TagSuggestion = {
  tag: string;
  score: number;
  confidence: number;
  evidence: TagSuggestionEvidence[];
  reason: string;
};

export type SuggestTagsForNoteInput = {
  currentNote: NoteRecord;
  notes: NoteRecord[];
  graph?: RelationshipGraph;
  limit?: number;
};

type MutableTagSuggestion = {
  tag: string;
  score: number;
  evidence: TagSuggestionEvidence[];
  evidenceKeys: Set<string>;
};

const LINKED_NOTE_TAG_SCORE = 6;
const BACKLINK_NOTE_TAG_SCORE = 5;
const CO_TAG_SCORE_PER_NOTE = 2;
const TAG_FREQUENCY_SCORE_PER_NOTE = 0.25;
const DEFAULT_TAG_SUGGESTION_LIMIT = 6;

export function suggestTagsForNote(input: SuggestTagsForNoteInput): TagSuggestion[] {
  const currentTags = new Set(input.currentNote.tags);
  const graph = input.graph ?? buildRelationshipGraph(createSnapshotFromNotes(input.notes));
  const noteByPath = new Map(input.notes.map((note) => [note.path, note]));
  const suggestions = new Map<string, MutableTagSuggestion>();

  for (const link of graph.resolvedLinksByPath[input.currentNote.path] ?? []) {
    const linkedNote = noteByPath.get(link.targetPath);
    if (!linkedNote) continue;
    for (const tag of linkedNote.tags) {
      if (currentTags.has(tag)) continue;
      addEvidence(suggestions, tag, LINKED_NOTE_TAG_SCORE, {
        type: "linked_note_tag",
        notePath: linkedNote.path,
        tag
      });
    }
  }

  for (const backlinkPath of graph.backlinksByPath[input.currentNote.path] ?? []) {
    const backlinkNote = noteByPath.get(backlinkPath);
    if (!backlinkNote) continue;
    for (const tag of backlinkNote.tags) {
      if (currentTags.has(tag)) continue;
      addEvidence(suggestions, tag, BACKLINK_NOTE_TAG_SCORE, {
        type: "backlink_note_tag",
        notePath: backlinkNote.path,
        tag
      });
    }
  }

  for (const currentTag of currentTags) {
    const stat = graph.tagStatsByTag[currentTag];
    if (!stat) continue;
    for (const coTag of stat.coTags) {
      if (currentTags.has(coTag.tag)) continue;
      addEvidence(suggestions, coTag.tag, coTag.count * CO_TAG_SCORE_PER_NOTE, {
        type: "co_tag",
        fromTag: currentTag,
        count: coTag.count
      });
    }
  }

  for (const suggestion of suggestions.values()) {
    const tagStat = graph.tagStatsByTag[suggestion.tag];
    if (!tagStat) continue;
    addEvidence(suggestions, suggestion.tag, tagStat.noteCount * TAG_FREQUENCY_SCORE_PER_NOTE, {
      type: "tag_frequency",
      noteCount: tagStat.noteCount
    });
  }

  return [...suggestions.values()]
    .map(finalizeSuggestion)
    .sort(compareTagSuggestions)
    .slice(0, input.limit ?? DEFAULT_TAG_SUGGESTION_LIMIT);
}

function addEvidence(
  suggestions: Map<string, MutableTagSuggestion>,
  tag: string,
  score: number,
  evidence: TagSuggestionEvidence
): void {
  const suggestion = suggestions.get(tag) ?? {
    tag,
    score: 0,
    evidence: [],
    evidenceKeys: new Set<string>()
  };
  const key = evidenceKey(evidence);

  suggestion.score += score;
  if (!suggestion.evidenceKeys.has(key)) {
    suggestion.evidenceKeys.add(key);
    suggestion.evidence.push(evidence);
  }
  suggestions.set(tag, suggestion);
}

function finalizeSuggestion(suggestion: MutableTagSuggestion): TagSuggestion {
  const score = roundScore(suggestion.score);
  return {
    tag: suggestion.tag,
    score,
    confidence: roundScore(Math.min(0.95, score / (score + 6))),
    evidence: sortEvidence(suggestion.evidence),
    reason: formatReason(sortEvidence(suggestion.evidence))
  };
}

function compareTagSuggestions(left: TagSuggestion, right: TagSuggestion): number {
  return (
    right.score - left.score ||
    tagDepth(right.tag) - tagDepth(left.tag) ||
    left.tag.localeCompare(right.tag)
  );
}

function sortEvidence(evidence: TagSuggestionEvidence[]): TagSuggestionEvidence[] {
  return [...evidence].sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)));
}

function formatReason(evidence: TagSuggestionEvidence[]): string {
  const parts = evidence.map((item) => {
    switch (item.type) {
      case "linked_note_tag":
        return `linked note ${item.notePath}`;
      case "backlink_note_tag":
        return `backlink ${item.notePath}`;
      case "co_tag":
        return `often appears with ${item.fromTag} (${item.count})`;
      case "tag_frequency":
        return `used in ${item.noteCount} note${item.noteCount === 1 ? "" : "s"}`;
    }
  });

  return [...new Set(parts)].join("; ");
}

function evidenceKey(evidence: TagSuggestionEvidence): string {
  switch (evidence.type) {
    case "linked_note_tag":
    case "backlink_note_tag":
      return `${evidence.type}\u001f${evidence.notePath}\u001f${evidence.tag}`;
    case "co_tag":
      return `${evidence.type}\u001f${evidence.fromTag}\u001f${evidence.count}`;
    case "tag_frequency":
      return `${evidence.type}\u001f${evidence.noteCount}`;
  }
}

function tagDepth(tag: string): number {
  return tag.split("/").filter(Boolean).length;
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
