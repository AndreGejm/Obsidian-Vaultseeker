import { describe, expect, it } from "vitest";
import type { NoteRecord, SourceNoteProposal, SuggestionRecord } from "@vaultseer/core";
import { buildSourceNoteWriteReviewState, deriveSourceNoteTargetPath } from "../src/source-note-write-review-state";

describe("buildSourceNoteWriteReviewState", () => {
  it("builds a dry-run source note creation review with a diff and no apply state", () => {
    const proposal = sourceNoteProposal();
    const state = buildSourceNoteWriteReviewState({
      proposal,
      notes: [],
      suggestionRecords: [
        suggestionRecord({ id: "suggestion:source-note:source:ragnarok:draft" }),
        suggestionRecord({ id: "suggestion:source-note:source:ragnarok:tag:myth/norse" }),
        suggestionRecord({ id: "suggestion:other-source:draft" })
      ],
      createdAt: "2026-05-01T15:00:00.000Z"
    });

    expect(state).toMatchObject({
      status: "ready",
      title: "Review Source Note Creation",
      message: "Dry-run only. Vaultseer has not created or modified this note.",
      targetPath: "Source Notes/Ragnarok in Icelandic Literature.md",
      canApply: false,
      precondition: { ok: true },
      source: {
        sourceId: "source:ragnarok",
        sourcePath: "Sources/ragnarok-paper.pdf",
        sourceContentHash: "sha256:ragnarok"
      },
      suggestionIds: [
        "suggestion:source-note:source:ragnarok:draft",
        "suggestion:source-note:source:ragnarok:tag:myth/norse"
      ]
    });
    expect(state.operation?.type).toBe("create_note_from_source");
    expect(state.diff).toContain("+++ b/Source Notes/Ragnarok in Icelandic Literature.md");
    expect(state.diff).toContain("+title: Ragnarok in Icelandic Literature");
  });

  it("blocks the dry-run when the proposed target already exists", () => {
    const state = buildSourceNoteWriteReviewState({
      proposal: sourceNoteProposal(),
      notes: [
        noteRecord({
          path: "Source Notes/Ragnarok in Icelandic Literature.md",
          contentHash: "existing-note-hash"
        })
      ],
      suggestionRecords: [],
      createdAt: "2026-05-01T15:00:00.000Z"
    });

    expect(state).toMatchObject({
      status: "blocked",
      message: "Dry-run blocked: target note already exists.",
      targetPath: "Source Notes/Ragnarok in Icelandic Literature.md",
      canApply: false,
      precondition: {
        ok: false,
        reason: "target_exists",
        expectedCurrentHash: null,
        actualCurrentHash: "existing-note-hash"
      }
    });
  });

  it("returns an unavailable state without a proposal", () => {
    expect(
      buildSourceNoteWriteReviewState({
        proposal: null,
        notes: [],
        suggestionRecords: [],
        createdAt: "2026-05-01T15:00:00.000Z"
      })
    ).toEqual({
      status: "unavailable",
      title: "No Source Note Proposal",
      message: "This source does not have a note proposal to review.",
      targetPath: null,
      operation: null,
      precondition: null,
      diff: "",
      canApply: false,
      source: null,
      suggestionIds: []
    });
  });
});

describe("deriveSourceNoteTargetPath", () => {
  it("creates a stable markdown path from the proposal title", () => {
    expect(
      deriveSourceNoteTargetPath(
        sourceNoteProposal({
          title: "  AC/DC Timer: Reset & Trigger?  "
        })
      )
    ).toBe("Source Notes/AC DC Timer Reset Trigger.md");
  });
});

function sourceNoteProposal(overrides: Partial<SourceNoteProposal> = {}): SourceNoteProposal {
  return {
    sourceId: "source:ragnarok",
    sourcePath: "Sources/ragnarok-paper.pdf",
    sourceContentHash: "sha256:ragnarok",
    title: "Ragnarok in Icelandic Literature",
    summary: "Ragnarok appears in medieval Icelandic literature.",
    aliases: ["ragnarok-paper"],
    outlineHeadings: [],
    suggestedTags: [],
    suggestedLinks: [],
    relatedNotes: [],
    markdownPreview: [
      "---",
      "title: Ragnarok in Icelandic Literature",
      "tags:",
      "  - myth/norse",
      "---",
      "",
      "# Ragnarok in Icelandic Literature",
      "",
      "> Source: Sources/ragnarok-paper.pdf",
      ""
    ].join("\n"),
    evidence: [{ type: "source_filename", value: "ragnarok-paper.pdf" }],
    ...overrides
  };
}

function suggestionRecord(overrides: Partial<SuggestionRecord>): SuggestionRecord {
  return {
    id: "suggestion:source-note:source:ragnarok:draft",
    type: "source_note_draft",
    targetPath: "Sources/ragnarok-paper.pdf",
    confidence: 0.7,
    evidence: [],
    createdAt: "2026-05-01T15:00:00.000Z",
    ...overrides
  };
}

function noteRecord(overrides: Partial<NoteRecord>): NoteRecord {
  return {
    path: "Source Notes/Ragnarok in Icelandic Literature.md",
    basename: "Ragnarok in Icelandic Literature",
    title: "Ragnarok in Icelandic Literature",
    contentHash: "sha256:note",
    stat: { ctime: 1, mtime: 2, size: 100 },
    frontmatter: {},
    tags: [],
    aliases: [],
    links: [],
    headings: [],
    ...overrides
  };
}
