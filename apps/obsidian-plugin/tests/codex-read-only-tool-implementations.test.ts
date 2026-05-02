import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  type NoteRecordInput,
  type SourceChunkRecord,
  type SourceRecord
} from "@vaultseer/core";
import {
  createCodexReadOnlyToolImplementations,
  parseCodexStageSuggestionInput,
  parseCodexSearchToolInput
} from "../src/codex-read-only-tool-implementations";

describe("parseCodexSearchToolInput", () => {
  it("accepts a string input as the query with a default bounded limit", () => {
    expect(parseCodexSearchToolInput("timing")).toEqual({ query: "timing", limit: 5 });
  });

  it("accepts object query input and integer limit", () => {
    expect(parseCodexSearchToolInput({ query: "vhdl timing", limit: 7 })).toEqual({
      query: "vhdl timing",
      limit: 7
    });
  });

  it("bounds supplied limits to the supported range", () => {
    expect(parseCodexSearchToolInput({ query: "timer", limit: 100 })).toEqual({ query: "timer", limit: 10 });
    expect(parseCodexSearchToolInput({ query: "timer", limit: -2 })).toEqual({ query: "timer", limit: 1 });
  });

  it("rejects blank queries", () => {
    expect(() => parseCodexSearchToolInput(" ")).toThrow("query");
    expect(() => parseCodexSearchToolInput({ query: "" })).toThrow("query");
  });
});

describe("parseCodexStageSuggestionInput", () => {
  it("drops malformed tag evidence and clamps confidence and score", () => {
    const parsed = parseCodexStageSuggestionInput(
      {
        kind: "tag",
        suggestions: [
          {
            tag: "vhdl/timing",
            confidence: 4,
            score: -10,
            evidence: [
              { type: "linked_note_tag", notePath: "Notes/FPGA.md", tag: "vhdl" },
              { type: "linked_note_tag", notePath: "Notes/FPGA.md" },
              { type: "co_tag", fromTag: "fpga", count: 2 },
              { type: "tag_frequency", noteCount: -1 },
              { type: "unknown", value: "bad" }
            ]
          }
        ]
      },
      "Notes/VHDL.md"
    );

    expect(parsed).toMatchObject({
      kind: "tag",
      tagSuggestions: [
        {
          tag: "vhdl/timing",
          confidence: 1,
          score: 0,
          evidence: [
            { type: "linked_note_tag", notePath: "Notes/FPGA.md", tag: "vhdl" },
            { type: "co_tag", fromTag: "fpga", count: 2 }
          ]
        }
      ]
    });
  });

  it("drops malformed link evidence and clamps confidence and score", () => {
    const parsed = parseCodexStageSuggestionInput(
      {
        kind: "link",
        links: [
          {
            rawLink: "[[Missing Timing Note]]",
            unresolvedTarget: "Missing Timing Note",
            suggestedPath: "Notes/Timing Closure.md",
            confidence: -2,
            score: -4,
            evidence: [
              { type: "unresolved_link", raw: "[[Missing Timing Note]]", target: "Missing Timing Note" },
              { type: "unresolved_link", raw: "[[Missing Timing Note]]" },
              { type: "alias_match", alias: "Timing Closure" },
              { type: "title_match", title: "" },
              { type: "token_overlap", tokens: ["timing", "closure"] },
              { type: "token_overlap", tokens: ["timing", 7] }
            ]
          }
        ]
      },
      "Notes/VHDL.md"
    );

    expect(parsed).toMatchObject({
      kind: "link",
      linkSuggestions: [
        {
          rawLink: "[[Missing Timing Note]]",
          confidence: 0,
          score: 0,
          evidence: [
            { type: "unresolved_link", raw: "[[Missing Timing Note]]", target: "Missing Timing Note" },
            { type: "alias_match", alias: "Timing Closure" },
            { type: "token_overlap", tokens: ["timing", "closure"] }
          ]
        }
      ]
    });
  });
});

describe("createCodexReadOnlyToolImplementations", () => {
  it("inspects the current active note through the active note context builder", async () => {
    const store = new InMemoryVaultseerStore();
    await indexNotes(store, [
      {
        path: "Notes/VHDL.md",
        basename: "VHDL",
        content: "VHDL setup time matters.",
        stat: { ctime: 1, mtime: 1, size: 24 },
        metadata: {
          frontmatter: { tags: ["vhdl"] },
          tags: ["#vhdl"],
          links: [],
          headings: []
        }
      }
    ]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.inspectCurrentNote()).resolves.toMatchObject({
      status: "ready",
      note: { path: "Notes/VHDL.md", title: "VHDL" },
      noteChunks: [expect.objectContaining({ text: "VHDL setup time matters." })]
    });
  });

  it("searches indexed notes through the existing search modal query state", async () => {
    const store = new InMemoryVaultseerStore();
    await indexNotes(store, [
      {
        path: "Notes/VHDL.md",
        basename: "VHDL",
        content: "Setup timing constraints matter.",
        stat: { ctime: 1, mtime: 1, size: 32 },
        metadata: {
          frontmatter: { tags: ["vhdl"] },
          tags: ["#vhdl"],
          links: [],
          headings: []
        }
      }
    ]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.searchNotes({ query: "timing", limit: 2 })).resolves.toMatchObject({
      status: "ready",
      message: "1 result found.",
      results: [expect.objectContaining({ notePath: "Notes/VHDL.md", source: "lexical" })]
    });
  });

  it("searches extracted sources through the existing source search modal state", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceWorkspace(sourceRecords, sourceChunks);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.searchSources("reset")).resolves.toMatchObject({
      status: "ready",
      message: "1 source result found.",
      results: [expect.objectContaining({ sourceId: "source:timer", source: "lexical" })]
    });
  });

  it("stages a current-note tag proposal into guarded review without mutating content", async () => {
    const store = new InMemoryVaultseerStore();
    const content = ["---", "tags:", "  - vhdl", "---", "", "# VHDL Timing"].join("\n");
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async (path) => {
        expect(path).toBe("Notes/VHDL.md");
        return content;
      },
      now: () => "2026-05-02T12:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion({
        kind: "tag",
        tags: ["vhdl/timing"],
        reason: "The note discusses timing constraints.",
        confidence: 0.82
      })
    ).resolves.toMatchObject({
      status: "planned",
      targetPath: "Notes/VHDL.md",
      suggestionCount: 1,
      message: "Staged 1 tag suggestion for review. No note was changed."
    });

    await expect(store.getSuggestionRecords()).resolves.toEqual([
      expect.objectContaining({
        type: "note_tag",
        targetPath: "Notes/VHDL.md"
      })
    ]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([
      expect.objectContaining({
        type: "update_note_tags",
        targetPath: "Notes/VHDL.md",
        tagUpdate: expect.objectContaining({ addedTags: ["vhdl/timing"] })
      })
    ]);
    expect(content).toContain("- vhdl");
    expect(content).not.toContain("vhdl/timing");
  });

  it("does not store a proposal when the active note changes before commit", async () => {
    const store = new InMemoryVaultseerStore();
    let activePath: string | null = "Notes/VHDL.md";
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => activePath,
      readActiveNoteContent: async () => {
        activePath = "Notes/Other.md";
        return "# VHDL Timing\n";
      },
      now: () => "2026-05-02T12:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion({
        kind: "tag",
        targetPath: "Notes/VHDL.md",
        tags: ["vhdl/timing"]
      })
    ).resolves.toMatchObject({
      status: "skipped",
      message: "The active note changed before staging could finish. Nothing was staged."
    });

    await expect(store.getSuggestionRecords()).resolves.toEqual([]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([]);
  });

  it("does not store a proposal when the tool request scope was invalidated away and back before commit", async () => {
    const store = new InMemoryVaultseerStore();
    const beforeProposalCommit = () => false;
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async () => "# VHDL Timing\n",
      now: () => "2026-05-02T12:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion(
        {
          kind: "tag",
          targetPath: "Notes/VHDL.md",
          tags: ["vhdl/timing"]
        },
        { beforeProposalCommit }
      )
    ).resolves.toMatchObject({
      status: "skipped",
      message: "The active note changed before staging could finish. Nothing was staged."
    });

    await expect(store.getSuggestionRecords()).resolves.toEqual([]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([]);
  });

  it("stages a current-note link proposal into guarded review without mutating content", async () => {
    const store = new InMemoryVaultseerStore();
    const content = "# VHDL Timing\n\nSee [[Missing Timing Note]] for details.\n";
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async (path) => {
        expect(path).toBe("Notes/VHDL.md");
        return content;
      },
      now: () => "2026-05-02T12:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion({
        type: "link",
        targetPath: "Notes/VHDL.md",
        links: [
          {
            rawLink: "[[Missing Timing Note]]",
            unresolvedTarget: "Missing Timing Note",
            suggestedPath: "Notes/Timing Closure.md",
            suggestedTitle: "Timing Closure",
            reason: "Title match",
            confidence: 0.76
          }
        ]
      })
    ).resolves.toMatchObject({
      status: "planned",
      targetPath: "Notes/VHDL.md",
      suggestionCount: 1,
      message: "Staged 1 link suggestion for review. No note was changed."
    });

    await expect(store.getSuggestionRecords()).resolves.toEqual([
      expect.objectContaining({
        type: "note_link",
        targetPath: "Notes/VHDL.md"
      })
    ]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([
      expect.objectContaining({
        type: "update_note_links",
        targetPath: "Notes/VHDL.md",
        linkUpdate: expect.objectContaining({
          replacements: [
            expect.objectContaining({
              rawLink: "[[Missing Timing Note]]",
              suggestedPath: "Notes/Timing Closure.md"
            })
          ]
        })
      })
    ]);
    expect(content).toContain("[[Missing Timing Note]]");
    expect(content).not.toContain("[[Notes/Timing Closure|Missing Timing Note]]");
  });

  it("accepts richer tag suggestion input", async () => {
    const store = new InMemoryVaultseerStore();
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async () => "# VHDL Timing\n",
      now: () => "2026-05-02T12:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion({
        kind: "tag",
        suggestions: [
          {
            tag: "vhdl/timing",
            reason: "Nearby notes use this tag.",
            confidence: 0.8,
            score: 9,
            evidence: [{ type: "tag_frequency", noteCount: 3 }]
          }
        ]
      })
    ).resolves.toMatchObject({
      status: "planned",
      suggestionCount: 1
    });
  });

  it("persists only validated Codex evidence and clamped confidence", async () => {
    const store = new InMemoryVaultseerStore();
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async () => "# VHDL Timing\n",
      now: () => "2026-05-02T12:00:00.000Z"
    });

    await tools.stageSuggestion({
      kind: "tag",
      suggestions: [
        {
          tag: "vhdl/timing",
          confidence: 7,
          evidence: [
            { type: "linked_note_tag", notePath: "Notes/FPGA.md", tag: "vhdl" },
            { type: "tag_frequency" },
            { type: "unknown", value: "bad" }
          ]
        }
      ]
    });

    await expect(store.getSuggestionRecords()).resolves.toEqual([
      expect.objectContaining({
        confidence: 1,
        evidence: [
          {
            type: "note_tag_evidence",
            relation: "linked_note",
            notePath: "Notes/FPGA.md",
            tag: "vhdl"
          }
        ]
      })
    ]);
  });

  it("rejects proposal staging without an active note", async () => {
    const tools = createCodexReadOnlyToolImplementations({
      store: new InMemoryVaultseerStore(),
      getActivePath: () => null,
      readActiveNoteContent: async () => "# VHDL Timing\n"
    });

    await expect(tools.stageSuggestion({ kind: "tag", tags: ["vhdl/timing"] })).rejects.toThrow("Open a note");
  });

  it("rejects proposal targetPath mismatch", async () => {
    const tools = createCodexReadOnlyToolImplementations({
      store: new InMemoryVaultseerStore(),
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async () => "# VHDL Timing\n"
    });

    await expect(
      tools.stageSuggestion({ kind: "tag", targetPath: "Notes/Other.md", tags: ["vhdl/timing"] })
    ).rejects.toThrow("current active note");
  });

  it.each([
    [{ kind: "tag", tags: [" "] }, "tag"],
    [{ kind: "tag", suggestions: [{ reason: "missing tag" }] }, "tag"],
    [{ kind: "link", links: [{ rawLink: "[[Missing]]", suggestedPath: "Notes/Found.md" }] }, "link"],
    [{ kind: "unknown", tags: ["vhdl/timing"] }, "kind"]
  ])("rejects malformed stage_suggestion input %#", async (proposal, messagePart) => {
    const tools = createCodexReadOnlyToolImplementations({
      store: new InMemoryVaultseerStore(),
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async () => "# VHDL Timing\n"
    });

    await expect(tools.stageSuggestion(proposal)).rejects.toThrow(messagePart);
  });
});

async function indexNotes(store: InMemoryVaultseerStore, noteInputs: NoteRecordInput[]): Promise<void> {
  const snapshot = buildVaultSnapshot(noteInputs);
  const chunks = chunkVaultInputs(noteInputs);
  await store.replaceNoteIndex(snapshot, "2026-05-02T00:00:00.000Z", chunks, buildLexicalIndex(snapshot, chunks));
}

const sourceRecords: SourceRecord[] = [
  {
    id: "source:timer",
    status: "extracted",
    sourcePath: "Sources/Datasheets/timer.pdf",
    filename: "timer.pdf",
    extension: ".pdf",
    sizeBytes: 100,
    contentHash: "source-hash",
    importedAt: "2026-05-01T07:00:00.000Z",
    extractor: {
      id: "marker",
      name: "Marker",
      version: "1.0.0"
    },
    extractionOptions: {},
    extractedMarkdown: "# Timer\n\nPin 1 controls reset behavior.",
    diagnostics: [],
    attachments: []
  }
];

const sourceChunks: SourceChunkRecord[] = [
  {
    id: "source-chunk:timer-reset",
    sourceId: "source:timer",
    sourcePath: "Sources/Datasheets/timer.pdf",
    sectionPath: ["Timer"],
    normalizedTextHash: "hash-reset",
    ordinal: 0,
    text: "Pin 1 controls reset behavior.",
    provenance: { kind: "unknown" }
  }
];
