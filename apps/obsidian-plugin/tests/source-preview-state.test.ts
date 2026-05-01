import { describe, expect, it } from "vitest";
import type { NoteRecord, SourceChunkRecord, SourceRecord } from "@vaultseer/core";
import { buildSourcePreviewState } from "../src/source-preview-state";

describe("buildSourcePreviewState", () => {
  it("builds a readable extracted source preview with grouped chunks", () => {
    const source = sourceRecord({
      diagnostics: [
        {
          severity: "warning",
          code: "low_ocr_confidence",
          message: "Some scanned text may be uncertain.",
          provenance: { kind: "page", page: 4 }
        }
      ],
      attachments: [
        {
          id: "attachment:timer:block-diagram",
          sourceId: "source:timer",
          kind: "image",
          filename: "block-diagram.png",
          contentHash: "sha256:image",
          stagedPath: ".vaultseer/sources/timer/block-diagram.png",
          mimeType: "image/png",
          provenance: { kind: "page", page: 2 }
        }
      ]
    });
    const chunks = [
      sourceChunk({
        id: "source-chunk:timer:intro",
        sourceId: "source:timer",
        sectionPath: ["Timer Datasheet", "Overview"],
        ordinal: 0,
        text: "The timer is a precision timing circuit.",
        provenance: { kind: "page", page: 1 }
      }),
      sourceChunk({
        id: "source-chunk:timer:reset",
        sourceId: "source:timer",
        sectionPath: ["Timer Datasheet", "Pins"],
        ordinal: 1,
        text: "Pin 1 controls reset behavior.",
        provenance: { kind: "page", page: 3 }
      })
    ];

    const state = buildSourcePreviewState({
      sourceId: "source:timer",
      sources: [source],
      chunks
    });

    expect(state).toEqual({
      status: "ready",
      title: "timer.pdf",
      message: "Source workspace is extracted and ready for review.",
      source: expect.objectContaining({
        id: "source:timer",
        sourcePath: "Sources/Datasheets/timer.pdf",
        extractor: "Marker 1.0.0"
      }),
      diagnostics: [
        {
          severity: "warning",
          code: "low_ocr_confidence",
          message: "Some scanned text may be uncertain.",
          location: "page 4"
        }
      ],
      attachments: [
        {
          id: "attachment:timer:block-diagram",
          kind: "image",
          filename: "block-diagram.png",
          stagedPath: ".vaultseer/sources/timer/block-diagram.png",
          mimeType: "image/png",
          location: "page 2"
        }
      ],
      markdownPreview: "# Timer Datasheet\n\nPin 1 controls reset.",
      noteProposal: null,
      suggestionRecords: [],
      noteWriteReview: null,
      chunkGroups: [
        {
          label: "Timer Datasheet > Overview",
          chunks: [
            {
              id: "source-chunk:timer:intro",
              ordinal: 0,
              text: "The timer is a precision timing circuit.",
              location: "page 1"
            }
          ]
        },
        {
          label: "Timer Datasheet > Pins",
          chunks: [
            {
              id: "source-chunk:timer:reset",
              ordinal: 1,
              text: "Pin 1 controls reset behavior.",
              location: "page 3"
            }
          ]
        }
      ]
    });
  });

  it("shows failed source diagnostics without treating the source as review-ready", () => {
    const failedSource = sourceRecord({
      status: "failed",
      extractedMarkdown: "",
      diagnostics: [
        {
          severity: "error",
          code: "missing_dependency",
          message: "Marker is not installed.",
          provenance: { kind: "unknown" }
        }
      ]
    });

    const state = buildSourcePreviewState({
      sourceId: "source:timer",
      sources: [failedSource],
      chunks: [sourceChunk({ sourceId: "source:timer" })]
    });

    expect(state.status).toBe("failed");
    expect(state.message).toBe("Source extraction failed. Review diagnostics before retrying extraction.");
    expect(state.diagnostics).toEqual([
      {
        severity: "error",
        code: "missing_dependency",
        message: "Marker is not installed.",
        location: "unknown"
      }
    ]);
    expect(state.noteProposal).toBeNull();
    expect(state.suggestionRecords).toEqual([]);
    expect(state.noteWriteReview).toBeNull();
    expect(state.chunkGroups).toEqual([]);
  });

  it("returns a missing state when the source id is not stored", () => {
    const state = buildSourcePreviewState({
      sourceId: "source:missing",
      sources: [sourceRecord({ id: "source:timer" })],
      chunks: []
    });

    expect(state).toEqual({
      status: "missing",
      title: "Source not found",
      message: "The selected source workspace is no longer stored.",
      source: null,
      diagnostics: [],
      attachments: [],
      markdownPreview: "",
      noteProposal: null,
      suggestionRecords: [],
      noteWriteReview: null,
      chunkGroups: []
    });
  });

  it("keeps source body as the group label for chunks without section paths", () => {
    const state = buildSourcePreviewState({
      sourceId: "source:timer",
      sources: [sourceRecord({ id: "source:timer" })],
      chunks: [
        sourceChunk({
          sourceId: "source:timer",
          sectionPath: [],
          text: "Standalone extracted text."
        })
      ]
    });

    expect(state.chunkGroups).toEqual([
      {
        label: "Source body",
        chunks: [
          expect.objectContaining({
            text: "Standalone extracted text."
          })
        ]
      }
    ]);
  });

  it("adds a read-only note proposal when vault notes are provided", () => {
    const state = buildSourcePreviewState({
      sourceId: "source:timer",
      sources: [
        sourceRecord({
          id: "source:timer",
          filename: "timer-datasheet.pdf",
          extractedMarkdown: "# Precision Timer\n\nReset pins and timing circuits."
        })
      ],
      chunks: [
        sourceChunk({
          sourceId: "source:timer",
          sectionPath: ["Precision Timer", "Reset Pins"],
          text: "The reset pin controls timing circuits."
        })
      ],
      notes: [
        noteRecord({
          path: "Electronics/Timing Circuits.md",
          title: "Timing Circuits",
          basename: "Timing Circuits",
          tags: ["electronics/timing"],
          aliases: ["timing circuits"]
        })
      ]
    });

    expect(state.noteProposal).toMatchObject({
      title: "Precision Timer",
      aliases: ["timer-datasheet"],
      suggestedTags: [
        expect.objectContaining({
          tag: "electronics/timing"
        })
      ],
      suggestedLinks: [
        expect.objectContaining({
          notePath: "Electronics/Timing Circuits.md",
          linkText: "Timing Circuits"
        })
      ]
    });
    expect(state.suggestionRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "source_note_draft",
          targetPath: "Sources/Datasheets/timer.pdf"
        }),
        expect.objectContaining({
          type: "source_note_tag",
          targetPath: "Sources/Datasheets/timer.pdf"
        }),
        expect.objectContaining({
          type: "source_note_link",
          targetPath: "Sources/Datasheets/timer.pdf"
        })
      ])
    );
    expect(state.noteWriteReview).toMatchObject({
      status: "ready",
      targetPath: "Source Notes/Precision Timer.md",
      canApply: false,
      source: {
        sourceId: "source:timer",
        sourcePath: "Sources/Datasheets/timer.pdf",
        sourceContentHash: "sha256:timer"
      }
    });
  });
});

function sourceRecord(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    id: "source:timer",
    status: "extracted",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
    extension: ".pdf",
    sizeBytes: 2048,
    contentHash: "sha256:timer",
    importedAt: "2026-05-01T07:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Timer Datasheet\n\nPin 1 controls reset.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function sourceChunk(overrides: Partial<SourceChunkRecord>): SourceChunkRecord {
  return {
    id: "source-chunk:timer:body",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    sectionPath: ["Timer Datasheet"],
    normalizedTextHash: "hash",
    ordinal: 0,
    text: "Pin 1 controls reset.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}

function noteRecord(overrides: Partial<NoteRecord>): NoteRecord {
  return {
    path: "Electronics/Timer.md",
    basename: "Timer",
    title: "Timer",
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
