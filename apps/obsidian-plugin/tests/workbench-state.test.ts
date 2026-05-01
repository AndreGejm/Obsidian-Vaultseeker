import { describe, expect, it } from "vitest";
import { buildWorkbenchState } from "../src/workbench-state";
import {
  buildLexicalIndex,
  buildVaultSnapshot,
  chunkVaultInputs,
  type IndexHealth,
  type NoteRecordInput
} from "@vaultseer/core";

function health(overrides: Partial<IndexHealth>): IndexHealth {
  return {
    schemaVersion: 1,
    status: "ready",
    statusMessage: null,
    lastIndexedAt: "2026-04-29T23:00:00.000Z",
    noteCount: 3,
    chunkCount: 4,
    vectorCount: 0,
    suggestionCount: 0,
    warnings: [],
    ...overrides
  };
}

const noteInputs: NoteRecordInput[] = [
  {
    path: "Projects/Vaultseer Platform.md",
    basename: "Vaultseer Platform",
    content: [
      "# Vaultseer Platform",
      "",
      "Memory retrieval should stay explainable.",
      "",
      "## Notes",
      "",
      "Connects to [[Literature/Mimisbrunnr Retrieval]] and [[Missing Note]]."
    ].join("\n"),
    stat: { ctime: 1, mtime: 2, size: 142 },
    metadata: {
      frontmatter: {
        aliases: ["Vaultseer"],
        tags: ["project/vaultseer", "ai/memory"]
      },
      tags: ["#project/vaultseer", "#ai/memory"],
      aliases: ["Vaultseer"],
      links: [
        { raw: "[[Literature/Mimisbrunnr Retrieval]]", target: "Literature/Mimisbrunnr Retrieval" },
        { raw: "[[Missing Note]]", target: "Missing Note" }
      ],
      headings: [
        { level: 1, heading: "Vaultseer Platform", position: { line: 0, column: 1 } },
        { level: 2, heading: "Notes", position: { line: 4, column: 1 } }
      ]
    }
  },
  {
    path: "Literature/Mimisbrunnr Retrieval.md",
    basename: "Mimisbrunnr Retrieval",
    content: "# Mimisbrunnr Retrieval\n\nRetrieval notes reference [[Projects/Vaultseer Platform]].",
    stat: { ctime: 3, mtime: 4, size: 82 },
    metadata: {
      frontmatter: {
        tags: ["ai/memory"]
      },
      tags: ["#ai/memory"],
      links: [{ raw: "[[Projects/Vaultseer Platform]]", target: "Projects/Vaultseer Platform" }],
      headings: [{ level: 1, heading: "Mimisbrunnr Retrieval", position: { line: 0, column: 1 } }]
    }
  },
  {
    path: "Garden/Loose Idea.md",
    basename: "Loose Idea",
    content: "# Loose Idea\n\nA disconnected memory idea.",
    stat: { ctime: 5, mtime: 6, size: 40 },
    metadata: {
      frontmatter: {
        tags: ["ai/memory"]
      },
      tags: ["#ai/memory"],
      links: [],
      headings: [{ level: 1, heading: "Loose Idea", position: { line: 0, column: 1 } }]
    }
  },
  {
    path: "Literature/Actually Missing Note.md",
    basename: "Actually Missing Note",
    content: "# Actually Missing Note\n\nThis note is aliased to the unresolved target.",
    stat: { ctime: 7, mtime: 8, size: 76 },
    metadata: {
      frontmatter: {
        aliases: ["Missing Note"],
        tags: ["reference"]
      },
      tags: ["#reference"],
      aliases: ["Missing Note"],
      links: [],
      headings: [{ level: 1, heading: "Actually Missing Note", position: { line: 0, column: 1 } }]
    }
  }
];

const snapshot = buildVaultSnapshot(noteInputs);
const chunks = chunkVaultInputs(noteInputs);
const lexicalIndex = buildLexicalIndex(snapshot, chunks);

describe("buildWorkbenchState", () => {
  it("blocks when the mirror is empty or failed", () => {
    expect(
      buildWorkbenchState({
        activePath: "Projects/Vaultseer Platform.md",
        health: health({ status: "empty", noteCount: 0, chunkCount: 0 }),
        notes: [],
        chunks: [],
        lexicalIndex: []
      })
    ).toMatchObject({
      status: "blocked",
      message: "Rebuild the Vaultseer index before opening the workbench."
    });

    expect(
      buildWorkbenchState({
        activePath: "Projects/Vaultseer Platform.md",
        health: health({ status: "error", statusMessage: "Unsupported index schema version: 999." }),
        notes: snapshot.notes,
        chunks,
        lexicalIndex
      })
    ).toMatchObject({
      status: "blocked",
      message: "Vaultseer index has an error: Unsupported index schema version: 999."
    });
  });

  it("prompts when no active note is selected", () => {
    expect(
      buildWorkbenchState({
        activePath: null,
        health: health({ status: "ready" }),
        notes: snapshot.notes,
        chunks,
        lexicalIndex
      })
    ).toMatchObject({
      status: "ready",
      message: "Open a Markdown note to inspect it in Vaultseer.",
      currentNote: null
    });
  });

  it("summarizes current-note metadata and relationships", () => {
    const state = buildWorkbenchState({
      activePath: "Projects/Vaultseer Platform.md",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex
    });

    expect(state).toMatchObject({
      status: "ready",
      currentNote: {
        path: "Projects/Vaultseer Platform.md",
        title: "Vaultseer Platform",
        tags: ["ai", "ai/memory", "project", "project/vaultseer"],
        aliases: ["Vaultseer"]
      },
      outgoingLinks: [
        {
          raw: "[[Literature/Mimisbrunnr Retrieval]]",
          targetPath: "Literature/Mimisbrunnr Retrieval.md"
        }
      ],
      unresolvedLinks: [{ raw: "[[Missing Note]]", target: "Missing Note" }],
      backlinks: ["Literature/Mimisbrunnr Retrieval.md"]
    });
  });

  it("returns related notes with explainable reasons", () => {
    const state = buildWorkbenchState({
      activePath: "Projects/Vaultseer Platform.md",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex
    });

    expect(state.relatedNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notePath: "Literature/Mimisbrunnr Retrieval.md",
          reason: expect.stringContaining("linked note")
        }),
        expect.objectContaining({
          notePath: "Garden/Loose Idea.md",
          reason: expect.stringContaining("shared tag ai/memory")
        })
      ])
    );
  });

  it("shows read-only tag suggestions with explainable evidence", () => {
    const state = buildWorkbenchState({
      activePath: "Literature/Mimisbrunnr Retrieval.md",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex
    });

    expect(state).toMatchObject({
      status: "ready",
      tagSuggestions: expect.arrayContaining([
        expect.objectContaining({
          tag: "project/vaultseer",
          reason: expect.stringContaining("linked note Projects/Vaultseer Platform.md")
        })
      ])
    });
  });

  it("shows read-only link suggestions for unresolved links", () => {
    const state = buildWorkbenchState({
      activePath: "Projects/Vaultseer Platform.md",
      health: health({ status: "ready" }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex
    });

    expect(state).toMatchObject({
      status: "ready",
      linkSuggestions: [
        expect.objectContaining({
          unresolvedTarget: "Missing Note",
          suggestedPath: "Literature/Actually Missing Note.md",
          reason: expect.stringContaining("alias Missing Note")
        })
      ]
    });
  });

  it("warns for stale mirrors and weakly connected notes", () => {
    const state = buildWorkbenchState({
      activePath: "Garden/Loose Idea.md",
      health: health({ status: "stale", statusMessage: "Vault changed since last index: 1 modified." }),
      notes: snapshot.notes,
      chunks,
      lexicalIndex
    });

    expect(state).toMatchObject({
      status: "ready",
      message: "Showing the last indexed mirror. Vault changed since last index: 1 modified.",
      warnings: expect.arrayContaining(["This note has no resolved outgoing links or backlinks in the indexed mirror."])
    });
  });

  it("describes safe mirror controls for the workbench toolbar", () => {
    expect(
      buildWorkbenchState({
        activePath: "Projects/Vaultseer Platform.md",
        health: health({ status: "empty", noteCount: 0, chunkCount: 0 }),
        notes: [],
        chunks: [],
        lexicalIndex: []
      }).controls
    ).toEqual([
      expect.objectContaining({ id: "rebuild-index", label: "Rebuild index", disabled: false }),
      expect.objectContaining({
        id: "clear-index",
        label: "Clear index",
        disabled: true,
        disabledReason: "The mirror is already empty."
      })
    ]);

    expect(
      buildWorkbenchState({
        activePath: "Projects/Vaultseer Platform.md",
        health: health({ status: "indexing" }),
        notes: snapshot.notes,
        chunks,
        lexicalIndex
      }).controls
    ).toEqual([
      expect.objectContaining({
        id: "rebuild-index",
        disabled: true,
        disabledReason: "Indexing is already running."
      }),
      expect.objectContaining({
        id: "clear-index",
        disabled: true,
        disabledReason: "Indexing is already running."
      })
    ]);
  });
});
