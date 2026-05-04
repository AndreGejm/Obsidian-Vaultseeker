import { describe, expect, it } from "vitest";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  InMemoryVaultseerStore,
  planNoteContentRewriteOperation,
  type GuardedVaultWriteOperation,
  type NoteRecordInput,
  type SourceChunkRecord,
  type SourceRecord,
  type VaultWriteApplyResult,
  type VaultWriteApproval,
  type VaultWriteDryRunResult,
  type VaultWritePort
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

  it("accepts note rewrite proposals with replacement markdown and an optional reason", () => {
    const parsed = parseCodexStageSuggestionInput(
      {
        kind: "rewrite",
        markdown: "# Resistor Types\n\n## Fixed\n\nMetal film resistors are stable.",
        reason: "Split the note into readable sections."
      },
      "Electronics/Resistor Types.md"
    );

    expect(parsed).toEqual({
      kind: "rewrite",
      targetPath: "Electronics/Resistor Types.md",
      proposedContent: "# Resistor Types\n\n## Fixed\n\nMetal film resistors are stable.",
      reason: "Split the note into readable sections."
    });
  });

  it("rejects stage_suggestion targets that are not safe vault-relative Markdown paths", () => {
    expect(() =>
      parseCodexStageSuggestionInput(
        {
          kind: "rewrite",
          targetPath: "../outside.md",
          markdown: "# Outside"
        },
        "../outside.md"
      )
    ).toThrow("vault-relative");
  });
});

describe("readVaultImage tool", () => {
  it("lists vault image assets without reading image bytes", async () => {
    let binaryReadCount = 0;
    const tools = createCodexReadOnlyToolImplementations({
      store: new InMemoryVaultseerStore(),
      getActivePath: () => null,
      readVaultAssetRecords: () => [
        {
          path: "Images/resistor.png",
          filename: "resistor.png",
          basename: "resistor",
          extension: ".png",
          mimeType: "image/png",
          sizeBytes: 3,
          modifiedTime: 10,
          contentHash: "vault-file:3:10"
        },
        {
          path: "Images/capacitor.jpg",
          filename: "capacitor.jpg",
          basename: "capacitor",
          extension: ".jpg",
          mimeType: "image/jpeg",
          sizeBytes: 4,
          modifiedTime: 11,
          contentHash: "vault-file:4:11"
        },
        {
          path: "Docs/readme.pdf",
          filename: "readme.pdf",
          basename: "readme",
          extension: ".pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          modifiedTime: 12,
          contentHash: "vault-file:100:12"
        }
      ],
      readVaultBinaryFile: async () => {
        binaryReadCount += 1;
        return new Uint8Array([1, 2, 3]);
      }
    });

    await expect(tools.listVaultImages?.({ query: "resistor", limit: 5 })).resolves.toEqual({
      status: "ready",
      message: "1 vault image found.",
      images: [
        {
          path: "Images/resistor.png",
          filename: "resistor.png",
          mimeType: "image/png",
          sizeBytes: 3,
          modifiedTime: 10,
          contentHash: "vault-file:3:10"
        }
      ]
    });
    expect(binaryReadCount).toBe(0);
  });

  it("returns a multimodal image content part for vault image assets without source extraction", async () => {
    const store = new InMemoryVaultseerStore();
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => null,
      readVaultAssetRecords: () => [
        {
          path: "Images/resistor.png",
          filename: "resistor.png",
          basename: "resistor",
          extension: ".png",
          mimeType: "image/png",
          sizeBytes: 3,
          modifiedTime: 10,
          contentHash: "vault-file:3:10"
        }
      ],
      readVaultBinaryFile: async (path) => {
        expect(path).toBe("Images/resistor.png");
        return new Uint8Array([1, 2, 3]);
      }
    });

    await expect(tools.readVaultImage?.({ path: "Images/resistor.png", detail: "high" })).resolves.toEqual({
      status: "ready",
      path: "Images/resistor.png",
      mimeType: "image/png",
      sizeBytes: 3,
      contentPart: {
        type: "image_url",
        imageUrl: "data:image/png;base64,AQID",
        detail: "high"
      }
    });
  });

  it("returns a multimodal image content part only for indexed vault images", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSourceWorkspace(
      [
        {
          id: "source-image",
          status: "extracted",
          sourcePath: "Images/resistor.png",
          filename: "resistor.png",
          extension: ".png",
          sizeBytes: 3,
          contentHash: "vault-file:3:10",
          importedAt: "2026-05-04T00:00:00.000Z",
          extractor: { id: "builtin-image", name: "Built-in image", version: null },
          extractionOptions: {},
          extractedMarkdown: "",
          diagnostics: [],
          attachments: [
            {
              id: "attachment-image",
              sourceId: "source-image",
              kind: "image",
              filename: "resistor.png",
              contentHash: "vault-file:3:10",
              stagedPath: "Images/resistor.png",
              mimeType: "image/png"
            }
          ]
        }
      ],
      []
    );
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => null,
      readVaultBinaryFile: async (path) => {
        expect(path).toBe("Images/resistor.png");
        return new Uint8Array([1, 2, 3]);
      }
    });

    await expect(tools.readVaultImage?.({ path: "Images/resistor.png", detail: "high" })).resolves.toEqual({
      status: "ready",
      path: "Images/resistor.png",
      mimeType: "image/png",
      sizeBytes: 3,
      contentPart: {
        type: "image_url",
        imageUrl: "data:image/png;base64,AQID",
        detail: "high"
      }
    });
  });

  it("does not read image bytes when the vault image was not indexed first", async () => {
    const tools = createCodexReadOnlyToolImplementations({
      store: new InMemoryVaultseerStore(),
      getActivePath: () => null,
      readVaultBinaryFile: async () => {
        throw new Error("must not read unindexed image bytes");
      }
    });

    await expect(tools.readVaultImage?.({ path: "Images/missing.png" })).resolves.toEqual({
      status: "not_indexed",
      path: "Images/missing.png",
      message: "Index this vault image before Vaultseer can attach it to the agent turn."
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

  it("inspects live active note text when the current note has not produced indexed chunks yet", async () => {
    const store = new InMemoryVaultseerStore();
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Electronics/Resistor Types.md",
      readActiveNoteInput: async (path) => ({
        path,
        basename: "Resistor Types",
        content: "# Resistor Types\n\nResistors limit current and divide voltage.",
        stat: { ctime: 1, mtime: 2, size: 61 },
        metadata: {
          frontmatter: { tags: ["electronics"] },
          tags: ["#electronics"],
          links: [],
          headings: [{ level: 1, heading: "Resistor Types", position: { line: 0 } }]
        }
      })
    });

    await expect(tools.inspectCurrentNote()).resolves.toMatchObject({
      status: "ready",
      note: { path: "Electronics/Resistor Types.md", title: "Resistor Types", tags: ["electronics"] },
      liveNote: { source: "active_file", text: expect.stringContaining("Resistors limit current") },
      noteChunks: [expect.objectContaining({ text: "Resistors limit current and divide voltage." })]
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

  it("reports index health, chunk, vector, source, and embedding queue counts", async () => {
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
    await store.replaceEmbeddingQueue([
      {
        id: "job:queued",
        chunkId: "chunk:1",
        modelNamespace: "ollama:nomic:768",
        contentHash: "hash",
        status: "queued",
        attemptCount: 0,
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
        lastError: null,
        nextAttemptAt: null,
        notePath: "Notes/VHDL.md"
      }
    ]);
    await store.replaceSourceWorkspace(sourceRecords, sourceChunks);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.inspectIndexHealth?.()).resolves.toMatchObject({
      status: "ready",
      health: { noteCount: 1, chunkCount: 1 },
      counts: {
        notes: 1,
        chunks: 1,
        vectors: 0,
        sources: 1,
        sourceChunks: 1
      },
      embeddingJobs: {
        queued: 1,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0
      }
    });
  });

  it("exposes current-note chunks as a native Codex tool using live note text", async () => {
    const store = new InMemoryVaultseerStore();
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Electronics/Resistor Types.md",
      readActiveNoteInput: async (path) => ({
        path,
        basename: "Resistor Types",
        content: "# Resistor Types\n\nResistors limit current.\n\n## Fixed\n\nMetal film resistors are stable.",
        stat: { ctime: 1, mtime: 2, size: 82 },
        metadata: {
          frontmatter: { tags: ["electronics"] },
          tags: ["#electronics"],
          links: [],
          headings: [
            { level: 1, heading: "Resistor Types", position: { line: 0 } },
            { level: 2, heading: "Fixed", position: { line: 4 } }
          ]
        }
      })
    });

    await expect(tools.inspectCurrentNoteChunks?.({ limit: 1 })).resolves.toMatchObject({
      status: "ready",
      targetPath: "Electronics/Resistor Types.md",
      liveNoteAvailable: true,
      chunkCount: 2,
      chunks: [
        expect.objectContaining({
          headingPath: ["Resistor Types", "Resistor Types"],
          text: "Resistors limit current."
        })
      ]
    });
  });

  it("runs semantic note search through the configured semantic provider surface", async () => {
    const store = new InMemoryVaultseerStore();
    const seenQueries: string[] = [];
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      searchNotesSemanticSearch: async (query) => {
        seenQueries.push(query);
        return {
          status: "ready",
          message: "1 semantic result found.",
          results: [
            {
              notePath: "Notes/Timing Closure.md",
              score: 0.82,
              matchedChunks: [
                {
                  chunkId: "chunk:timing",
                  text: "Timing closure checks setup and hold paths.",
                  score: 0.82
                }
              ]
            }
          ]
        };
      }
    });

    await expect(tools.semanticSearchNotes?.({ query: "adjacent timing topics", limit: 3 })).resolves.toMatchObject({
      status: "ready",
      message: "1 semantic result found.",
      results: [expect.objectContaining({ notePath: "Notes/Timing Closure.md", score: 0.82 })]
    });
    expect(seenQueries).toEqual(["adjacent timing topics"]);
  });

  it("returns deterministic tag, link, and quality suggestions for the current note", async () => {
    const store = new InMemoryVaultseerStore();
    await indexNotes(store, [
      {
        path: "Notes/VHDL.md",
        basename: "VHDL",
        content: "# VHDL\n\nSee [[Timing Closure Missing]].",
        stat: { ctime: 1, mtime: 1, size: 31 },
        metadata: {
          frontmatter: { tags: ["vhdl"] },
          tags: ["#vhdl"],
          links: [{ raw: "[[Timing Closure Missing]]", target: "Timing Closure Missing" }],
          headings: [{ level: 1, heading: "VHDL", position: { line: 0 } }]
        }
      },
      {
        path: "Notes/FPGA.md",
        basename: "FPGA",
        content: "# FPGA\n\n[[VHDL]] is used for designs.",
        stat: { ctime: 1, mtime: 1, size: 37 },
        metadata: {
          frontmatter: { tags: ["fpga"] },
          tags: ["#fpga"],
          links: [{ raw: "[[VHDL]]", target: "VHDL" }],
          headings: [{ level: 1, heading: "FPGA", position: { line: 0 } }]
        }
      },
      {
        path: "Notes/Timing Closure.md",
        basename: "Timing Closure",
        content: "# Timing Closure",
        stat: { ctime: 1, mtime: 1, size: 16 },
        metadata: {
          frontmatter: { tags: ["vhdl/timing"] },
          tags: ["#vhdl/timing"],
          links: [],
          headings: [{ level: 1, heading: "Timing Closure", position: { line: 0 } }]
        }
      }
    ]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md"
    });

    await expect(tools.suggestCurrentNoteTags?.()).resolves.toMatchObject({
      status: "ready",
      targetPath: "Notes/VHDL.md",
      suggestions: expect.arrayContaining([expect.objectContaining({ tag: "fpga" })])
    });
    await expect(tools.suggestCurrentNoteLinks?.()).resolves.toMatchObject({
      status: "ready",
      targetPath: "Notes/VHDL.md",
      suggestions: [
        expect.objectContaining({
          unresolvedTarget: "Timing Closure Missing",
          suggestedPath: "Notes/Timing Closure.md"
        })
      ]
    });
    await expect(tools.inspectNoteQuality?.()).resolves.toMatchObject({
      status: "ready",
      targetPath: "Notes/VHDL.md",
      issueCount: 1,
      issues: [expect.objectContaining({ kind: "broken_internal_link" })]
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

  it("stages a current-note rewrite proposal into guarded review without mutating content", async () => {
    const store = new InMemoryVaultseerStore();
    const content = "# Resistor Types\n\nCarbon film and metal film are common.\n";
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Electronics/Resistor Types.md",
      readActiveNoteContent: async (path) => {
        expect(path).toBe("Electronics/Resistor Types.md");
        return content;
      },
      now: () => "2026-05-03T10:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion({
        kind: "rewrite",
        markdown: [
          "# Resistor Types",
          "",
          "## Fixed Resistors",
          "",
          "Carbon film and metal film resistors are common fixed resistor types.",
          ""
        ].join("\n"),
        reason: "Make the note easier to scan."
      })
    ).resolves.toMatchObject({
      status: "planned",
      targetPath: "Electronics/Resistor Types.md",
      suggestionCount: 1,
      message: "Staged 1 note rewrite for review. No note was changed."
    });

    await expect(store.getVaultWriteOperations()).resolves.toEqual([
      expect.objectContaining({
        type: "rewrite_note_content",
        targetPath: "Electronics/Resistor Types.md",
        content: expect.stringContaining("## Fixed Resistors"),
        rewrite: expect.objectContaining({ reason: "Make the note easier to scan." })
      })
    ]);
    expect(content).toContain("Carbon film and metal film are common.");
    expect(content).not.toContain("## Fixed Resistors");
  });

  it("lists current-note proposals for the active note as a native Codex tool", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = rewriteOperation({
      targetPath: "Electronics/Resistor Types.md"
    });
    await store.replaceVaultWriteOperations([
      operation,
      rewriteOperation({
        id: "vault-write:other",
        targetPath: "Electronics/Other.md"
      })
    ]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Electronics/Resistor Types.md"
    });

    await expect(tools.listCurrentNoteProposals?.()).resolves.toMatchObject({
      status: "ready",
      message: "1 proposed change for this note.",
      cards: [
        expect.objectContaining({
          id: operation.id,
          targetPath: "Electronics/Resistor Types.md",
          title: "Note rewrite",
          queueSection: "active",
          controls: expect.arrayContaining([
            expect.objectContaining({ type: "approve_apply", enabled: true })
          ])
        })
      ]
    });
  });

  it("approves and applies an active current-note proposal from the native Codex tool surface", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = rewriteOperation();
    const writePort = new FakeWritePort({ dryRun: okDryRun(operation), applyResult: appliedResult(operation) });
    await store.replaceVaultWriteOperations([operation]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => operation.targetPath,
      writePort,
      now: () => "2026-05-03T12:00:00.000Z"
    });

    await expect(tools.reviewCurrentNoteProposal?.({ operationId: operation.id, apply: true })).resolves.toMatchObject({
      status: "applied",
      operationId: operation.id,
      targetPath: operation.targetPath,
      decision: "approved",
      message: "Applied note rewrite to Notes/VHDL.md."
    });

    expect(writePort.applyCount).toBe(1);
    await expect(store.getVaultWriteDecisionRecords()).resolves.toEqual([
      expect.objectContaining({
        operationId: operation.id,
        decision: "approved",
        targetPath: operation.targetPath,
        decidedAt: "2026-05-03T12:00:00.000Z"
      })
    ]);
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([
      expect.objectContaining({
        operationId: operation.id,
        status: "applied",
        targetPath: operation.targetPath,
        appliedAt: "2026-05-03T12:00:00.000Z"
      })
    ]);
  });

  it("blocks proposal review when the active note changed before the agent action committed", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = rewriteOperation();
    await store.replaceVaultWriteOperations([operation]);
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => operation.targetPath,
      writePort: new FakeWritePort({ dryRun: okDryRun(operation), applyResult: appliedResult(operation) }),
      now: () => "2026-05-03T12:00:00.000Z"
    });

    await expect(
      tools.reviewCurrentNoteProposal?.({ operationId: operation.id, apply: true }, { beforeProposalCommit: () => false })
    ).resolves.toMatchObject({
      status: "blocked",
      message: "The active note changed before review could finish. Nothing was changed."
    });

    await expect(store.getVaultWriteDecisionRecords()).resolves.toEqual([]);
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([]);
  });

  it("skips current-note rewrite proposals that would not change the note", async () => {
    const store = new InMemoryVaultseerStore();
    const content = "# VHDL Timing\n";
    const tools = createCodexReadOnlyToolImplementations({
      store,
      getActivePath: () => "Notes/VHDL.md",
      readActiveNoteContent: async () => content,
      now: () => "2026-05-03T10:00:00.000Z"
    });

    await expect(
      tools.stageSuggestion({
        kind: "rewrite",
        markdown: content,
        reason: "No real change."
      })
    ).resolves.toMatchObject({
      status: "skipped",
      message: "The proposed rewrite matches the current file."
    });

    await expect(store.getVaultWriteOperations()).resolves.toEqual([]);
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
    [{ kind: "rewrite", markdown: " " }, "rewrite"],
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

class FakeWritePort implements VaultWritePort {
  applyCount = 0;

  constructor(
    private readonly options: {
      dryRun: VaultWriteDryRunResult;
      applyResult: VaultWriteApplyResult;
    }
  ) {}

  async dryRun(): Promise<VaultWriteDryRunResult> {
    return this.options.dryRun;
  }

  async apply(_operation: GuardedVaultWriteOperation, approval: VaultWriteApproval): Promise<VaultWriteApplyResult> {
    this.applyCount += 1;
    return {
      ...this.options.applyResult,
      appliedAt: approval.approvedAt
    };
  }
}

function okDryRun(operation: GuardedVaultWriteOperation): VaultWriteDryRunResult {
  return {
    operation,
    preview: operation.preview,
    precondition: { ok: true }
  };
}

function appliedResult(operation: GuardedVaultWriteOperation): VaultWriteApplyResult {
  return {
    operationId: operation.id,
    targetPath: operation.targetPath,
    beforeHash: operation.expectedCurrentHash,
    afterHash: operation.preview.afterHash,
    appliedAt: "2026-05-03T11:00:00.000Z"
  };
}

function rewriteOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planNoteContentRewriteOperation({
      targetPath: "Notes/VHDL.md",
      currentContent: "# VHDL\n\nOld prose.\n",
      proposedContent: "# VHDL\n\n## Overview\n\nClearer prose.\n",
      reason: "Improve note structure.",
      suggestionIds: ["suggestion:note-rewrite:Notes/VHDL.md:codex"],
      createdAt: "2026-05-03T10:00:00.000Z"
    }),
    id: "vault-write:rewrite-note-content:Notes/VHDL.md:test",
    ...overrides
  };
}
