import type {
  DecisionRecord,
  SuggestionEvidence,
  SuggestionRecord
} from "../storage/types";
import type { LinkSuggestion, LinkSuggestionEvidence } from "./link-suggestions";
import type { TagSuggestion, TagSuggestionEvidence } from "./tag-suggestions";
import type {
  SourceNoteProposal,
  SourceNoteProposalEvidence,
  SourceNoteProposalHeading,
  SourceNoteProposalLink,
  SourceNoteProposalRelatedNote,
  SourceNoteProposalTag
} from "../source/source-note-proposal";

export type CreateNoteTagSuggestionRecordsInput = {
  targetPath: string;
  suggestions: TagSuggestion[];
};

export type CreateNoteLinkSuggestionRecordsInput = {
  targetPath: string;
  suggestions: LinkSuggestion[];
};

export function createNoteLinkSuggestionRecords(
  input: CreateNoteLinkSuggestionRecordsInput,
  createdAt: string
): SuggestionRecord[] {
  return input.suggestions.map((suggestion) => noteLinkSuggestionRecord(input.targetPath, suggestion, createdAt));
}

export function createNoteTagSuggestionRecords(
  input: CreateNoteTagSuggestionRecordsInput,
  createdAt: string
): SuggestionRecord[] {
  return input.suggestions.map((suggestion) => noteTagSuggestionRecord(input.targetPath, suggestion, createdAt));
}

export function createSourceNoteProposalSuggestionRecords(
  proposal: SourceNoteProposal,
  createdAt: string
): SuggestionRecord[] {
  const records: SuggestionRecord[] = [
    {
      id: `suggestion:source-note:${proposal.sourceId}:draft`,
      type: "source_note_draft",
      targetPath: proposal.sourcePath,
      confidence: 0.6,
      evidence: toStoredEvidence(proposal.sourceId, proposal.evidence),
      createdAt
    },
    ...proposal.outlineHeadings.map((heading) => outlineSuggestionRecord(proposal, heading, createdAt)),
    ...proposal.suggestedTags.map((tag) => tagSuggestionRecord(proposal, tag, createdAt)),
    ...proposal.suggestedLinks.map((link) => linkSuggestionRecord(proposal, link, createdAt)),
    ...proposal.relatedNotes.map((note) => relatedNoteSuggestionRecord(proposal, note, createdAt))
  ];

  return records.sort(compareSuggestionRecords);
}

export function mergeSuggestionRecords(existing: SuggestionRecord[], incoming: SuggestionRecord[]): SuggestionRecord[] {
  const recordsById = new Map<string, SuggestionRecord>();
  for (const record of existing) recordsById.set(record.id, clone(record));
  for (const record of incoming) recordsById.set(record.id, clone(record));
  return [...recordsById.values()].sort(compareSuggestionRecords);
}

export function upsertDecisionRecord(existing: DecisionRecord[], incoming: DecisionRecord): DecisionRecord[] {
  const decisionsBySuggestionId = new Map<string, DecisionRecord>();
  for (const decision of existing) decisionsBySuggestionId.set(decision.suggestionId, clone(decision));
  decisionsBySuggestionId.set(incoming.suggestionId, clone(incoming));
  return [...decisionsBySuggestionId.values()].sort((left, right) => left.suggestionId.localeCompare(right.suggestionId));
}

function noteTagSuggestionRecord(targetPath: string, suggestion: TagSuggestion, createdAt: string): SuggestionRecord {
  return {
    id: `suggestion:note-tag:${targetPath}:${suggestion.tag}`,
    type: "note_tag",
    targetPath,
    confidence: suggestion.confidence,
    evidence: toStoredTagEvidence(suggestion.tag, suggestion.evidence),
    createdAt
  };
}

function noteLinkSuggestionRecord(targetPath: string, suggestion: LinkSuggestion, createdAt: string): SuggestionRecord {
  return {
    id: `suggestion:note-link:${targetPath}:${suggestion.unresolvedTarget}:${suggestion.suggestedPath}`,
    type: "note_link",
    targetPath,
    confidence: suggestion.confidence,
    evidence: toStoredLinkEvidence(suggestion, suggestion.evidence),
    createdAt
  };
}

function outlineSuggestionRecord(
  proposal: SourceNoteProposal,
  heading: SourceNoteProposalHeading,
  createdAt: string
): SuggestionRecord {
  return {
    id: `suggestion:source-note:${proposal.sourceId}:outline:${heading.sourceSectionPath.join("/")}`,
    type: "source_note_outline",
    targetPath: proposal.sourcePath,
    confidence: 0.55,
    evidence: toStoredEvidence(proposal.sourceId, heading.evidence),
    createdAt
  };
}

function tagSuggestionRecord(
  proposal: SourceNoteProposal,
  tag: SourceNoteProposalTag,
  createdAt: string
): SuggestionRecord {
  return {
    id: `suggestion:source-note:${proposal.sourceId}:tag:${tag.tag}`,
    type: "source_note_tag",
    targetPath: proposal.sourcePath,
    confidence: tag.confidence,
    evidence: toStoredEvidence(proposal.sourceId, tag.evidence),
    createdAt
  };
}

function linkSuggestionRecord(
  proposal: SourceNoteProposal,
  link: SourceNoteProposalLink,
  createdAt: string
): SuggestionRecord {
  return {
    id: `suggestion:source-note:${proposal.sourceId}:link:${link.notePath}`,
    type: "source_note_link",
    targetPath: proposal.sourcePath,
    confidence: link.confidence,
    evidence: toStoredEvidence(proposal.sourceId, link.evidence),
    createdAt
  };
}

function relatedNoteSuggestionRecord(
  proposal: SourceNoteProposal,
  note: SourceNoteProposalRelatedNote,
  createdAt: string
): SuggestionRecord {
  return {
    id: `suggestion:source-note:${proposal.sourceId}:related:${note.notePath}`,
    type: "source_note_related_note",
    targetPath: proposal.sourcePath,
    confidence: note.confidence,
    evidence: toStoredEvidence(proposal.sourceId, note.evidence),
    createdAt
  };
}

function toStoredTagEvidence(suggestedTag: string, evidence: TagSuggestionEvidence[]): SuggestionEvidence[] {
  return evidence.flatMap((item): SuggestionEvidence[] => {
    switch (item.type) {
      case "linked_note_tag":
        return [
          {
            type: "note_tag_evidence",
            relation: "linked_note",
            notePath: item.notePath,
            tag: item.tag
          }
        ];
      case "backlink_note_tag":
        return [
          {
            type: "note_tag_evidence",
            relation: "backlink_note",
            notePath: item.notePath,
            tag: item.tag
          }
        ];
      case "co_tag":
        return [
          {
            type: "tag_co_occurrence",
            fromTag: item.fromTag,
            suggestedTag,
            count: item.count
          }
        ];
      case "tag_frequency":
        return [
          {
            type: "tag_frequency",
            tag: suggestedTag,
            noteCount: item.noteCount
          }
        ];
    }
  }).sort(compareSuggestionEvidence);
}

function toStoredLinkEvidence(suggestion: LinkSuggestion, evidence: LinkSuggestionEvidence[]): SuggestionEvidence[] {
  return evidence.flatMap((item): SuggestionEvidence[] => {
    switch (item.type) {
      case "unresolved_link":
        return [{ type: "unlinked_mention", text: item.raw }];
      case "alias_match":
        return [
          {
            type: "note_match",
            notePath: suggestion.suggestedPath,
            matchedText: item.alias,
            matchKind: "alias"
          }
        ];
      case "title_match":
        return [
          {
            type: "note_match",
            notePath: suggestion.suggestedPath,
            matchedText: item.title,
            matchKind: "title"
          }
        ];
      case "token_overlap":
        return [
          {
            type: "link_suggestion_token_overlap",
            notePath: suggestion.suggestedPath,
            tokens: item.tokens
          }
        ];
    }
  }).sort(compareSuggestionEvidence);
}

function toStoredEvidence(sourceId: string, evidence: SourceNoteProposalEvidence[]): SuggestionEvidence[] {
  return evidence.flatMap((item): SuggestionEvidence[] => {
    switch (item.type) {
      case "source_title":
        return [{ type: "source_field", sourceId, field: "title", value: item.value }];
      case "source_filename":
        return [{ type: "source_field", sourceId, field: "filename", value: item.value }];
      case "source_section":
        return [{ type: "source_section", sourceId, chunkId: item.chunkId, sectionPath: item.sectionPath }];
      case "source_excerpt":
        return [{ type: "source_excerpt", sourceId, chunkId: item.chunkId, text: item.text }];
      case "source_term_match":
        return [
          {
            type: "source_term_match",
            sourceId,
            chunkId: item.chunkId,
            matchedTerms: item.matchedTerms,
            ...(item.tag ? { tag: item.tag } : {}),
            ...(item.notePath ? { notePath: item.notePath } : {})
          }
        ];
      case "note_title_match":
        return [{ type: "note_match", notePath: item.notePath, matchedText: item.matchedText, matchKind: "title" }];
      case "note_alias_match":
        return [{ type: "note_match", notePath: item.notePath, matchedText: item.matchedText, matchKind: "alias" }];
    }
  });
}

function compareSuggestionRecords(left: SuggestionRecord, right: SuggestionRecord): number {
  return left.id.localeCompare(right.id);
}

function compareSuggestionEvidence(left: SuggestionEvidence, right: SuggestionEvidence): number {
  return suggestionEvidenceKey(left).localeCompare(suggestionEvidenceKey(right));
}

function suggestionEvidenceKey(evidence: SuggestionEvidence): string {
  switch (evidence.type) {
    case "tag_co_occurrence":
      return `0:${evidence.fromTag}:${evidence.suggestedTag}:${evidence.count}`;
    case "tag_frequency":
      return `1:${evidence.tag}:${evidence.noteCount}`;
    case "note_tag_evidence":
      return `2:${evidence.relation}:${evidence.notePath}:${evidence.tag}`;
    case "note_match":
      return `3:${evidence.notePath}:${evidence.matchKind}:${evidence.matchedText}`;
    case "unlinked_mention":
      return `4:${evidence.text}`;
    case "link_suggestion_token_overlap":
      return `5:${evidence.notePath}:${evidence.tokens.join(" ")}`;
    case "assistant_note_rewrite":
      return `6:${evidence.reason}`;
    default:
      return `9:${JSON.stringify(evidence)}`;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
