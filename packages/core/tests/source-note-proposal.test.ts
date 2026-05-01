import { describe, expect, it } from "vitest";
import { proposeSourceNote } from "../src/index";
import type { NoteRecord, SourceChunkRecord, SourceRecord } from "../src/index";

describe("proposeSourceNote", () => {
  it("creates an evidence-bearing read-only note proposal from an extracted source", () => {
    const proposal = proposeSourceNote({
      source: sourceRecord({
        filename: "ragnarok-paper.pdf",
        extractedMarkdown: "# Ragnarok in Icelandic Literature\n\nRagnarok appears in medieval Icelandic sources."
      }),
      sourceChunks: [
        sourceChunk({
          id: "source-chunk:ragnarok:intro",
          sectionPath: ["Ragnarok in Icelandic Literature", "Overview"],
          text: "Ragnarok appears in medieval Icelandic literature and Norse myth."
        }),
        sourceChunk({
          id: "source-chunk:ragnarok:cosmology",
          sectionPath: ["Ragnarok in Icelandic Literature", "Cosmology"],
          text: "The paper compares Ragnarok with cosmology and mythic cycles."
        })
      ],
      notes: [
        noteRecord({
          path: "Mythology/Ragnarok.md",
          title: "Ragnarok",
          basename: "Ragnarok",
          tags: ["myth/norse", "literature/icelandic"],
          aliases: ["Ragnarok"]
        }),
        noteRecord({
          path: "Concepts/Cosmology.md",
          title: "Cosmology",
          basename: "Cosmology",
          tags: ["myth/cosmology"],
          aliases: []
        }),
        noteRecord({
          path: "Projects/Garden.md",
          title: "Garden",
          basename: "Garden",
          tags: ["workflow/gardening"],
          aliases: []
        })
      ],
      limits: {
        tags: 4,
        links: 4,
        relatedNotes: 4,
        outlineHeadings: 4
      }
    });

    expect(proposal).toMatchObject({
      sourceId: "source:ragnarok",
      sourcePath: "Sources/ragnarok-paper.pdf",
      sourceContentHash: "sha256:ragnarok",
      title: "Ragnarok in Icelandic Literature",
      aliases: ["ragnarok-paper"],
      summary: "Ragnarok appears in medieval Icelandic literature and Norse myth."
    });
    expect(proposal?.outlineHeadings).toEqual([
      {
        heading: "Overview",
        sourceSectionPath: ["Ragnarok in Icelandic Literature", "Overview"],
        evidence: [{ type: "source_section", chunkId: "source-chunk:ragnarok:intro", sectionPath: ["Ragnarok in Icelandic Literature", "Overview"] }]
      },
      {
        heading: "Cosmology",
        sourceSectionPath: ["Ragnarok in Icelandic Literature", "Cosmology"],
        evidence: [{ type: "source_section", chunkId: "source-chunk:ragnarok:cosmology", sectionPath: ["Ragnarok in Icelandic Literature", "Cosmology"] }]
      }
    ]);
    expect(proposal?.suggestedTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "myth/norse",
          evidence: expect.arrayContaining([
            expect.objectContaining({
              type: "source_term_match",
              matchedTerms: expect.arrayContaining(["norse"])
            })
          ])
        }),
        expect.objectContaining({
          tag: "literature/icelandic",
          evidence: expect.arrayContaining([
            expect.objectContaining({
              type: "source_term_match",
              matchedTerms: expect.arrayContaining(["literature", "icelandic"])
            })
          ])
        })
      ])
    );
    expect(proposal?.suggestedTags.map((tag) => tag.tag)).not.toContain("workflow/gardening");
    expect(proposal?.suggestedLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notePath: "Mythology/Ragnarok.md",
          linkText: "Ragnarok",
          evidence: expect.arrayContaining([
            expect.objectContaining({
              type: "note_title_match",
              notePath: "Mythology/Ragnarok.md",
              matchedText: "Ragnarok"
            })
          ])
        })
      ])
    );
    expect(proposal?.relatedNotes[0]).toMatchObject({
      notePath: "Mythology/Ragnarok.md",
      title: "Ragnarok"
    });
    expect(proposal?.markdownPreview).toContain("title: Ragnarok in Icelandic Literature");
    expect(proposal?.markdownPreview).toContain("tags:");
    expect(proposal?.markdownPreview).toContain("[[Mythology/Ragnarok|Ragnarok]]");
    expect(proposal?.markdownPreview).toContain("> Source: Sources/ragnarok-paper.pdf");
  });

  it("does not propose notes from failed source workspaces", () => {
    const proposal = proposeSourceNote({
      source: sourceRecord({
        status: "failed",
        extractedMarkdown: ""
      }),
      sourceChunks: [sourceChunk()],
      notes: [noteRecord()]
    });

    expect(proposal).toBeNull();
  });

  it("uses existing vault tags only", () => {
    const proposal = proposeSourceNote({
      source: sourceRecord(),
      sourceChunks: [
        sourceChunk({
          text: "This source mentions a new topic called blue circuitry."
        })
      ],
      notes: [
        noteRecord({
          tags: ["known/topic"],
          title: "Known Topic",
          basename: "Known Topic"
        })
      ]
    });

    expect(proposal?.suggestedTags.map((tag) => tag.tag)).toEqual([]);
  });
});

function sourceRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source:ragnarok",
    status: "extracted",
    sourcePath: "Sources/ragnarok-paper.pdf",
    filename: "ragnarok-paper.pdf",
    extension: ".pdf",
    sizeBytes: 4096,
    contentHash: "sha256:ragnarok",
    importedAt: "2026-05-01T10:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Ragnarok\n\nRagnarok is a mythic source.",
    diagnostics: [],
    attachments: [],
    ...overrides
  };
}

function sourceChunk(overrides: Partial<SourceChunkRecord> = {}): SourceChunkRecord {
  return {
    id: "source-chunk:ragnarok:body",
    sourceId: "source:ragnarok",
    sourcePath: "Sources/ragnarok-paper.pdf",
    sectionPath: ["Ragnarok"],
    normalizedTextHash: "hash",
    ordinal: 0,
    text: "Ragnarok is a mythic source.",
    provenance: { kind: "unknown" },
    ...overrides
  };
}

function noteRecord(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    path: "Notes/Ragnarok.md",
    basename: "Ragnarok",
    title: "Ragnarok",
    contentHash: "sha256:note",
    stat: { ctime: 1, mtime: 2, size: 100 },
    frontmatter: {},
    tags: ["myth/norse"],
    aliases: [],
    links: [],
    headings: [],
    ...overrides
  };
}
