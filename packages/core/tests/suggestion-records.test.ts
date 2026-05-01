import { describe, expect, it } from "vitest";
import {
  createNoteLinkSuggestionRecords,
  createNoteTagSuggestionRecords,
  createSourceNoteProposalSuggestionRecords,
  mergeSuggestionRecords,
  upsertDecisionRecord
} from "../src/index";
import type { DecisionRecord, LinkSuggestion, SourceNoteProposal, SuggestionRecord, TagSuggestion } from "../src/index";

describe("suggestion record helpers", () => {
  it("converts note tag suggestions into stable evidence-bearing suggestion records", () => {
    const records = createNoteTagSuggestionRecords(
      {
        targetPath: "Literature/Mimisbrunnr Retrieval.md",
        suggestions: [
          tagSuggestion({
            tag: "project/vaultseer",
            confidence: 0.72,
            evidence: [
              {
                type: "linked_note_tag",
                notePath: "Projects/Vaultseer Platform.md",
                tag: "project/vaultseer"
              },
              {
                type: "co_tag",
                fromTag: "ai/memory",
                count: 3
              }
            ]
          })
        ]
      },
      "2026-05-01T22:00:00.000Z"
    );

    expect(records).toEqual([
      {
        id: "suggestion:note-tag:Literature/Mimisbrunnr Retrieval.md:project/vaultseer",
        type: "note_tag",
        targetPath: "Literature/Mimisbrunnr Retrieval.md",
        confidence: 0.72,
        evidence: [
          {
            type: "tag_co_occurrence",
            fromTag: "ai/memory",
            suggestedTag: "project/vaultseer",
            count: 3
          },
          {
            type: "note_tag_evidence",
            relation: "linked_note",
            notePath: "Projects/Vaultseer Platform.md",
            tag: "project/vaultseer"
          }
        ],
        createdAt: "2026-05-01T22:00:00.000Z"
      }
    ]);
  });

  it("converts note link suggestions into stable evidence-bearing suggestion records", () => {
    const records = createNoteLinkSuggestionRecords(
      {
        targetPath: "Projects/Vaultseer Platform.md",
        suggestions: [
          linkSuggestion({
            unresolvedTarget: "Missing Note",
            rawLink: "[[Missing Note]]",
            suggestedPath: "Literature/Actually Missing Note.md",
            suggestedTitle: "Actually Missing Note",
            confidence: 0.78,
            evidence: [
              { type: "unresolved_link", raw: "[[Missing Note]]", target: "Missing Note" },
              { type: "alias_match", alias: "Missing Note" },
              { type: "token_overlap", tokens: ["missing", "note"] }
            ]
          })
        ]
      },
      "2026-05-01T23:00:00.000Z"
    );

    expect(records).toEqual([
      {
        id: "suggestion:note-link:Projects/Vaultseer Platform.md:Missing Note:Literature/Actually Missing Note.md",
        type: "note_link",
        targetPath: "Projects/Vaultseer Platform.md",
        confidence: 0.78,
        evidence: [
          {
            type: "note_match",
            notePath: "Literature/Actually Missing Note.md",
            matchedText: "Missing Note",
            matchKind: "alias"
          },
          {
            type: "unlinked_mention",
            text: "[[Missing Note]]"
          },
          {
            type: "link_suggestion_token_overlap",
            notePath: "Literature/Actually Missing Note.md",
            tokens: ["missing", "note"]
          }
        ],
        createdAt: "2026-05-01T23:00:00.000Z"
      }
    ]);
  });

  it("converts a source note proposal into stable evidence-bearing suggestion records", () => {
    const records = createSourceNoteProposalSuggestionRecords(
      sourceNoteProposal({
        suggestedTags: [
          {
            tag: "electronics/timing",
            score: 18,
            confidence: 0.75,
            reason: "matched source terms electronics, timing",
            evidence: [
              {
                type: "source_term_match",
                chunkId: "source-chunk:timer:overview",
                matchedTerms: ["electronics", "timing"],
                tag: "electronics/timing"
              }
            ]
          }
        ]
      }),
      "2026-05-01T12:00:00.000Z"
    );

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "suggestion:source-note:source:timer:draft",
          type: "source_note_draft",
          targetPath: "Sources/timer.pdf",
          confidence: 0.6,
          createdAt: "2026-05-01T12:00:00.000Z"
        }),
        expect.objectContaining({
          id: "suggestion:source-note:source:timer:tag:electronics/timing",
          type: "source_note_tag",
          confidence: 0.75,
          evidence: [
            {
              type: "source_term_match",
              sourceId: "source:timer",
              chunkId: "source-chunk:timer:overview",
              matchedTerms: ["electronics", "timing"],
              tag: "electronics/timing"
            }
          ]
        }),
        expect.objectContaining({
          id: "suggestion:source-note:source:timer:link:Notes/Timer.md",
          type: "source_note_link",
          evidence: expect.arrayContaining([
            {
              type: "note_match",
              notePath: "Notes/Timer.md",
              matchedText: "Timer",
              matchKind: "title"
            }
          ])
        })
      ])
    );
  });

  it("merges incoming suggestion records by id while preserving unrelated suggestions", () => {
    const existing: SuggestionRecord[] = [
      suggestionRecord({ id: "suggestion:keep", type: "note_tag", confidence: 0.2 }),
      suggestionRecord({ id: "suggestion:update", type: "note_link", confidence: 0.3 })
    ];
    const incoming: SuggestionRecord[] = [
      suggestionRecord({ id: "suggestion:update", type: "note_link", confidence: 0.9 }),
      suggestionRecord({ id: "suggestion:new", type: "source_note_draft", confidence: 0.6 })
    ];

    expect(mergeSuggestionRecords(existing, incoming)).toEqual([
      suggestionRecord({ id: "suggestion:keep", type: "note_tag", confidence: 0.2 }),
      suggestionRecord({ id: "suggestion:new", type: "source_note_draft", confidence: 0.6 }),
      suggestionRecord({ id: "suggestion:update", type: "note_link", confidence: 0.9 })
    ]);
  });

  it("upserts the current decision for one suggestion without touching other decisions", () => {
    const existing: DecisionRecord[] = [
      decisionRecord({ suggestionId: "suggestion:a", decision: "deferred", decidedAt: "2026-05-01T10:00:00.000Z" }),
      decisionRecord({ suggestionId: "suggestion:b", decision: "accepted", decidedAt: "2026-05-01T10:01:00.000Z" })
    ];

    expect(
      upsertDecisionRecord(existing, {
        suggestionId: "suggestion:a",
        decision: "rejected",
        decidedAt: "2026-05-01T12:00:00.000Z"
      })
    ).toEqual([
      decisionRecord({ suggestionId: "suggestion:a", decision: "rejected", decidedAt: "2026-05-01T12:00:00.000Z" }),
      decisionRecord({ suggestionId: "suggestion:b", decision: "accepted", decidedAt: "2026-05-01T10:01:00.000Z" })
    ]);
  });
});

function sourceNoteProposal(overrides: Partial<SourceNoteProposal> = {}): SourceNoteProposal {
  return {
    sourceId: "source:timer",
    sourcePath: "Sources/timer.pdf",
    sourceContentHash: "sha256:timer",
    title: "Timer Datasheet",
    summary: "A timer source.",
    aliases: ["timer"],
    outlineHeadings: [
      {
        heading: "Overview",
        sourceSectionPath: ["Timer Datasheet", "Overview"],
        evidence: [
          {
            type: "source_section",
            chunkId: "source-chunk:timer:overview",
            sectionPath: ["Timer Datasheet", "Overview"]
          }
        ]
      }
    ],
    suggestedTags: [],
    suggestedLinks: [
      {
        notePath: "Notes/Timer.md",
        title: "Timer",
        linkText: "Timer",
        score: 44,
        confidence: 0.65,
        reason: "note title Timer",
        evidence: [
          {
            type: "note_title_match",
            notePath: "Notes/Timer.md",
            matchedText: "Timer"
          }
        ]
      }
    ],
    relatedNotes: [
      {
        notePath: "Notes/Timer.md",
        title: "Timer",
        score: 44,
        confidence: 0.65,
        reason: "note title Timer",
        evidence: [
          {
            type: "note_title_match",
            notePath: "Notes/Timer.md",
            matchedText: "Timer"
          }
        ]
      }
    ],
    markdownPreview: "# Timer Datasheet\n",
    evidence: [
      {
        type: "source_title",
        value: "Timer Datasheet"
      }
    ],
    ...overrides
  };
}

function tagSuggestion(overrides: Partial<TagSuggestion>): TagSuggestion {
  return {
    tag: "project/vaultseer",
    score: 12,
    confidence: 0.72,
    evidence: [],
    reason: "linked note Projects/Vaultseer Platform.md",
    ...overrides
  };
}

function linkSuggestion(overrides: Partial<LinkSuggestion>): LinkSuggestion {
  return {
    unresolvedTarget: "Missing Note",
    rawLink: "[[Missing Note]]",
    suggestedPath: "Literature/Actually Missing Note.md",
    suggestedTitle: "Actually Missing Note",
    score: 58,
    confidence: 0.78,
    evidence: [],
    reason: "alias Missing Note",
    ...overrides
  };
}

function suggestionRecord(overrides: Partial<SuggestionRecord>): SuggestionRecord {
  return {
    id: "suggestion:default",
    type: "note_tag",
    targetPath: "Notes/Timer.md",
    confidence: 0.5,
    evidence: [],
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides
  };
}

function decisionRecord(overrides: Partial<DecisionRecord>): DecisionRecord {
  return {
    suggestionId: "suggestion:default",
    decision: "deferred",
    decidedAt: "2026-05-01T12:00:00.000Z",
    ...overrides
  };
}
