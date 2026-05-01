import { describe, expect, it } from "vitest";
import {
  createVaultWriteDecisionRecord,
  evaluateVaultWritePrecondition,
  planSourceNoteCreationOperation
} from "../src/index";
import type { SourceNoteProposal } from "../src/index";

describe("guarded write operations", () => {
  it("turns a source note proposal into a dry-run creation operation with a preview diff", () => {
    const operation = planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: "Literature/Ragnarok in Icelandic Literature.md",
      suggestionIds: [
        "suggestion:source-note:source:ragnarok:draft",
        "suggestion:source-note:source:ragnarok:tag:myth/norse"
      ],
      createdAt: "2026-05-01T14:00:00.000Z"
    });

    expect(operation).toMatchObject({
      id: "vault-write:create-note-from-source:source:ragnarok:7e3442af",
      type: "create_note_from_source",
      targetPath: "Literature/Ragnarok in Icelandic Literature.md",
      expectedCurrentHash: null,
      source: {
        sourceId: "source:ragnarok",
        sourcePath: "Sources/ragnarok-paper.pdf",
        sourceContentHash: "sha256:ragnarok"
      },
      suggestionIds: [
        "suggestion:source-note:source:ragnarok:draft",
        "suggestion:source-note:source:ragnarok:tag:myth/norse"
      ],
      createdAt: "2026-05-01T14:00:00.000Z"
    });
    expect(operation.preview.afterHash).toBe("775d0762");
    expect(operation.preview.diff).toContain("--- /dev/null");
    expect(operation.preview.diff).toContain("+++ b/Literature/Ragnarok in Icelandic Literature.md");
    expect(operation.preview.diff).toContain("+title: Ragnarok in Icelandic Literature");
    expect(operation.preview.diff).toContain("+> Source: Sources/ragnarok-paper.pdf");
  });

  it("rejects stale or conflicting file state before a write can be applied", () => {
    const createOperation = planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: "Literature/Ragnarok in Icelandic Literature.md",
      suggestionIds: [],
      createdAt: "2026-05-01T14:00:00.000Z"
    });

    expect(
      evaluateVaultWritePrecondition(createOperation, {
        path: "Literature/Ragnarok in Icelandic Literature.md",
        currentHash: null
      })
    ).toEqual({ ok: true });

    expect(
      evaluateVaultWritePrecondition(createOperation, {
        path: "Literature/Ragnarok in Icelandic Literature.md",
        currentHash: "existing-file"
      })
    ).toEqual({
      ok: false,
      reason: "target_exists",
      expectedCurrentHash: null,
      actualCurrentHash: "existing-file"
    });

    expect(
      evaluateVaultWritePrecondition(
        {
          ...createOperation,
          expectedCurrentHash: "old-hash"
        },
        {
          path: "Literature/Ragnarok in Icelandic Literature.md",
          currentHash: "new-hash"
        }
      )
    ).toEqual({
      ok: false,
      reason: "stale_file",
      expectedCurrentHash: "old-hash",
      actualCurrentHash: "new-hash"
    });

    expect(
      evaluateVaultWritePrecondition(
        {
          ...createOperation,
          expectedCurrentHash: "old-hash"
        },
        {
          path: "Literature/Ragnarok in Icelandic Literature.md",
          currentHash: null
        }
      )
    ).toEqual({
      ok: false,
      reason: "missing_file",
      expectedCurrentHash: "old-hash",
      actualCurrentHash: null
    });
  });

  it("records approval metadata without applying the operation", () => {
    const operation = planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: "Literature/Ragnarok in Icelandic Literature.md",
      suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
      createdAt: "2026-05-01T14:00:00.000Z"
    });

    expect(
      createVaultWriteDecisionRecord({
        operation,
        decision: "approved",
        decidedAt: "2026-05-01T14:10:00.000Z"
      })
    ).toEqual({
      operationId: operation.id,
      decision: "approved",
      targetPath: "Literature/Ragnarok in Icelandic Literature.md",
      suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
      decidedAt: "2026-05-01T14:10:00.000Z"
    });
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
      "",
      "## Summary",
      "",
      "Ragnarok appears in medieval Icelandic literature.",
      ""
    ].join("\n"),
    evidence: [{ type: "source_filename", value: "ragnarok-paper.pdf" }],
    ...overrides
  };
}
