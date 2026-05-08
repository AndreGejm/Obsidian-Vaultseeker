import { describe, expect, it } from "vitest";
import type { GuardedVaultWriteOperation, SourceNoteProposal } from "@vaultseer/core";
import {
  hashString,
  planNoteContentRewriteOperation,
  planNoteLinkUpdateOperation,
  planNoteTagUpdateOperation,
  planSourceNoteCreationOperation
} from "@vaultseer/core";
import { ObsidianVaultWritePort, VaultWriteVerificationError } from "../src/obsidian-vault-write-port";

describe("ObsidianVaultWritePort", () => {
  it("creates a new note after a clean dry run and verifies the written hash", async () => {
    const operation = writeOperation();
    const vault = new FakeVault();
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: null,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-01T20:00:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: null,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-01T20:00:00.000Z"
    });
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
  });

  it("blocks dry run when the target already exists", async () => {
    const operation = writeOperation();
    const vault = new FakeVault([[operation.targetPath, "# Existing\n"]]);
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: {
        ok: false,
        reason: "target_exists",
        expectedCurrentHash: null,
        actualCurrentHash: hashString("# Existing\n")
      }
    });
  });

  it("blocks dry run when the target parent folder does not exist", async () => {
    const operation = writeOperation();
    const vault = new FakeVault([], []);
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: {
        ok: false,
        reason: "missing_parent_folder",
        expectedCurrentHash: null,
        actualCurrentHash: null
      }
    });
    expect(vault.files.has(operation.targetPath)).toBe(false);
  });

  it("rejects write operations whose target path is not vault-relative", async () => {
    const operation = writeOperation({
      targetPath: "../outside.md"
    });
    const vault = new FakeVault();
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).rejects.toThrow(VaultWriteVerificationError);
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: null,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-01T20:00:00.000Z"
      })
    ).rejects.toThrow(VaultWriteVerificationError);
  });

  it("fails apply when the approved after hash does not match the operation preview", async () => {
    const operation = writeOperation();
    const vault = new FakeVault();
    const port = new ObsidianVaultWritePort(vault);

    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: null,
        afterHash: "wrong-hash",
        approvedAt: "2026-05-01T20:00:00.000Z"
      })
    ).rejects.toThrow(VaultWriteVerificationError);
    expect(vault.files.has(operation.targetPath)).toBe(false);
  });

  it("fails apply when the content read after create does not match the expected hash", async () => {
    const operation = writeOperation();
    const vault = new FakeVault();
    vault.readOverride = "# Corrupted\n";
    const port = new ObsidianVaultWritePort(vault);

    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: null,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-01T20:00:00.000Z"
      })
    ).rejects.toThrow(VaultWriteVerificationError);
  });

  it("applies an approved tag update after a clean dry run and verifies the written hash", async () => {
    const currentContent = ["---", "tags:", "  - electronics", "---", "", "# Precision Timer", ""].join("\n");
    const operation = tagUpdateOperation(currentContent);
    const vault = new FakeVault([[operation.targetPath, currentContent]], ["Electronics"]);
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-01T21:00:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-01T21:00:00.000Z"
    });
    expect(vault.modifyCount).toBe(1);
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
  });

  it("applies an approved note rewrite after a clean dry run and verifies the written hash", async () => {
    const currentContent = "# Resistor Types\n\nCarbon film and metal film are common.\n";
    const operation = planNoteContentRewriteOperation({
      targetPath: "Electronics/Resistor Types.md",
      currentContent,
      proposedContent: "# Resistor Types\n\n## Fixed Resistors\n\nMetal film resistors are stable.\n",
      reason: "Improve scanability.",
      suggestionIds: ["suggestion:note-rewrite:Electronics/Resistor Types.md:codex"],
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const vault = new FakeVault([[operation.targetPath, currentContent]], ["Electronics"]);
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-03T10:10:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-03T10:10:00.000Z"
    });
    expect(vault.modifyCount).toBe(1);
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
  });

  it("uses the active editor content for active-note rewrite preconditions and updates the visible editor", async () => {
    const savedContent = "# Ohm's law\n\nSaved text that has fallen behind the editor.\n";
    const activeContent = "# Ohm's law\n";
    const operation = planNoteContentRewriteOperation({
      targetPath: "Electronics/Ohms law.md",
      currentContent: activeContent,
      proposedContent: "# Ohm's law\n\nOhm's law relates voltage, current, and resistance.\n",
      reason: "Add the requested explanation.",
      suggestionIds: ["suggestion:note-rewrite:Electronics/Ohms law.md:codex"],
      createdAt: "2026-05-07T18:00:00.000Z"
    });
    const vault = new FakeVault([[operation.targetPath, savedContent]], ["Electronics"]);
    const activeNote = new FakeActiveNote(operation.targetPath, activeContent);
    const port = new ObsidianVaultWritePort(vault, activeNote);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-07T18:05:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-07T18:05:00.000Z"
    });
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
    expect(activeNote.content).toBe(operation.content);
  });

  it("normalizes active editor content before checking rewrite preconditions", async () => {
    const activeContent = "# Ohm's law";
    const operation = planNoteContentRewriteOperation({
      targetPath: "Electronics/Ohms law.md",
      currentContent: activeContent,
      proposedContent: "# Ohm's law\n\nOhm's law relates voltage, current, and resistance.\n",
      reason: "Add the requested explanation.",
      suggestionIds: ["suggestion:note-rewrite:Electronics/Ohms law.md:codex"],
      createdAt: "2026-05-08T09:00:00.000Z"
    });
    const vault = new FakeVault([[operation.targetPath, activeContent]], ["Electronics"]);
    const activeNote = new FakeActiveNote(operation.targetPath, activeContent);
    const port = new ObsidianVaultWritePort(vault, activeNote);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-08T09:05:00.000Z"
      })
    ).resolves.toMatchObject({
      operationId: operation.id,
      targetPath: operation.targetPath,
      afterHash: operation.preview.afterHash
    });
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
    expect(activeNote.content).toBe(operation.content);
  });

  it("uses open editor content for rewrite preconditions even when the target note is not the active pane", async () => {
    const savedContent = "# Ohm's law\n\nSaved text that has fallen behind the editor.\n";
    const openEditorContent = "# Ohm's law\n";
    const operation = planNoteContentRewriteOperation({
      targetPath: "Electronics/Ohms law.md",
      currentContent: openEditorContent,
      proposedContent: "# Ohm's law\n\nOhm's law relates voltage, current, and resistance.\n",
      reason: "Add the requested explanation.",
      suggestionIds: ["suggestion:note-rewrite:Electronics/Ohms law.md:codex"],
      createdAt: "2026-05-08T07:00:00.000Z"
    });
    const vault = new FakeVault([[operation.targetPath, savedContent]], ["Electronics"]);
    const openNote = new FakeOpenMarkdownNoteAccess("Electronics/Other.md", operation.targetPath, openEditorContent);
    const port = new ObsidianVaultWritePort(vault, openNote);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-08T07:05:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-08T07:05:00.000Z"
    });
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
    expect(openNote.content).toBe(operation.content);
  });

  it("verifies modified notes with an uncached read so stale cached content does not fail apply", async () => {
    const currentContent = "# Resistor Types\n\nOriginal text.\n";
    const operation = planNoteContentRewriteOperation({
      targetPath: "Electronics/Resistor Types.md",
      currentContent,
      proposedContent: "# Resistor Types\n\n## Overview\n\nEdited text.\n",
      reason: "Improve scanability.",
      suggestionIds: ["suggestion:note-rewrite:Electronics/Resistor Types.md:codex"],
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const vault = new FakeVault([[operation.targetPath, currentContent]], ["Electronics"]);
    vault.staleCachedReadAfterWrite = currentContent;
    const port = new ObsidianVaultWritePort(vault);

    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-03T10:10:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-03T10:10:00.000Z"
    });
    expect(vault.readCount).toBeGreaterThan(0);
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
  });

  it("applies an approved note link update after a clean dry run and verifies the written hash", async () => {
    const currentContent = "# VHDL\n\nSee [[Missing Timing Note]].\n";
    const operation = planNoteLinkUpdateOperation({
      targetPath: "Notes/VHDL.md",
      currentContent,
      replacements: [
        {
          rawLink: "[[Missing Timing Note]]",
          unresolvedTarget: "Missing Timing Note",
          suggestedPath: "Notes/Timing Closure.md"
        }
      ],
      suggestionIds: ["suggestion:note-link:Notes/VHDL.md:Missing Timing Note:Notes/Timing Closure.md"],
      createdAt: "2026-05-03T10:00:00.000Z"
    });
    const vault = new FakeVault([[operation.targetPath, currentContent]], ["Notes"]);
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: { ok: true },
      preview: operation.preview
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-03T10:10:00.000Z"
      })
    ).resolves.toEqual({
      operationId: operation.id,
      targetPath: operation.targetPath,
      beforeHash: operation.expectedCurrentHash,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-03T10:10:00.000Z"
    });
    expect(vault.modifyCount).toBe(1);
    expect(vault.files.get(operation.targetPath)).toBe(operation.content);
  });

  it("blocks tag update apply when the note changed since review", async () => {
    const reviewedContent = "# Precision Timer\n";
    const changedContent = "# Precision Timer\n\nEdited after review.\n";
    const operation = tagUpdateOperation(reviewedContent);
    const vault = new FakeVault([[operation.targetPath, changedContent]], ["Electronics"]);
    const port = new ObsidianVaultWritePort(vault);

    await expect(port.dryRun(operation)).resolves.toMatchObject({
      precondition: {
        ok: false,
        reason: "stale_file",
        expectedCurrentHash: operation.expectedCurrentHash,
        actualCurrentHash: hashString(changedContent)
      }
    });
    await expect(
      port.apply(operation, {
        operationId: operation.id,
        targetPath: operation.targetPath,
        expectedCurrentHash: operation.expectedCurrentHash,
        afterHash: operation.preview.afterHash,
        approvedAt: "2026-05-01T21:00:00.000Z"
      })
    ).rejects.toThrow("precondition failed: stale_file");
    expect(vault.modifyCount).toBe(0);
    expect(vault.files.get(operation.targetPath)).toBe(changedContent);
  });
});

class FakeVault {
  files = new Map<string, string>();
  folders = new Set<string>();
  readOverride: string | null = null;
  staleCachedReadAfterWrite: string | null = null;
  modifyCount = 0;
  createCount = 0;
  readCount = 0;

  constructor(entries: Array<[string, string]> = [], folders: string[] = ["Source Notes"]) {
    this.files = new Map(entries);
    this.folders = new Set(folders);
  }

  getAbstractFileByPath(path: string): { path: string; children?: unknown[] } | null {
    if (this.files.has(path)) return { path };
    return this.folders.has(path) ? { path, children: [] } : null;
  }

  async cachedRead(file: { path: string }): Promise<string> {
    if (this.readOverride !== null) return this.readOverride;
    if (this.staleCachedReadAfterWrite !== null && (this.modifyCount > 0 || this.createCount > 0)) {
      return this.staleCachedReadAfterWrite;
    }
    return this.read(file);
  }

  async read(file: { path: string }): Promise<string> {
    this.readCount += 1;
    if (this.readOverride !== null) return this.readOverride;
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`missing file ${file.path}`);
    return content;
  }

  async create(path: string, content: string): Promise<{ path: string }> {
    if (this.files.has(path)) throw new Error(`file already exists: ${path}`);
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    if (parentPath && !this.folders.has(parentPath)) throw new Error(`missing folder: ${parentPath}`);
    this.files.set(path, content);
    this.createCount += 1;
    return { path };
  }

  async modify(file: { path: string }, content: string): Promise<void> {
    if (!this.files.has(file.path)) throw new Error(`missing file ${file.path}`);
    this.modifyCount += 1;
    this.files.set(file.path, content);
  }
}

class FakeActiveNote {
  constructor(
    private readonly path: string,
    public content: string
  ) {}

  getActivePath(): string | null {
    return this.path;
  }

  readContent(path: string): string | null {
    return path === this.path ? this.content : null;
  }

  writeContent(path: string, content: string): boolean {
    if (path !== this.path) return false;
    this.content = content;
    return true;
  }
}

class FakeOpenMarkdownNoteAccess {
  constructor(
    private readonly activePath: string,
    private readonly openPath: string,
    public content: string
  ) {}

  getActivePath(): string | null {
    return this.activePath;
  }

  readContent(path: string): string | null {
    return path === this.openPath ? this.content : null;
  }

  writeContent(path: string, content: string): boolean {
    if (path !== this.openPath) return false;
    this.content = content;
    return true;
  }
}

function writeOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: "Source Notes/Ragnarok.md",
      suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
      createdAt: "2026-05-01T15:00:00.000Z"
    }),
    ...overrides
  };
}

function sourceNoteProposal(overrides: Partial<SourceNoteProposal> = {}): SourceNoteProposal {
  return {
    sourceId: "source:ragnarok",
    sourcePath: "Sources/ragnarok-paper.pdf",
    sourceContentHash: "sha256:ragnarok",
    title: "Ragnarok",
    summary: "Ragnarok appears in medieval Icelandic literature.",
    aliases: [],
    outlineHeadings: [],
    suggestedTags: [],
    suggestedLinks: [],
    relatedNotes: [],
    markdownPreview: "# Ragnarok\n",
    evidence: [{ type: "source_filename", value: "ragnarok-paper.pdf" }],
    ...overrides
  };
}

function tagUpdateOperation(currentContent: string): GuardedVaultWriteOperation {
  return planNoteTagUpdateOperation({
    targetPath: "Electronics/Precision Timer.md",
    currentContent,
    tagsToAdd: ["electronics/timing"],
    suggestionIds: ["suggestion:note-tag:Electronics/Precision Timer.md:electronics/timing"],
    createdAt: "2026-05-01T21:00:00.000Z"
  });
}
