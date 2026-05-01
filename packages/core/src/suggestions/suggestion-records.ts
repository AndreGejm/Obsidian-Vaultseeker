import type {
  DecisionRecord,
  SuggestionEvidence,
  SuggestionRecord
} from "../storage/types";
import type {
  SourceNoteProposal,
  SourceNoteProposalEvidence,
  SourceNoteProposalHeading,
  SourceNoteProposalLink,
  SourceNoteProposalRelatedNote,
  SourceNoteProposalTag
} from "../source/source-note-proposal";

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

function clone<T>(value: T): T {
  return structuredClone(value);
}
