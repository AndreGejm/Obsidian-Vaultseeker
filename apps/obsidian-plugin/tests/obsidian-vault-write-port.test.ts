import { describe, expect, it } from "vitest";
import type { GuardedVaultWriteOperation, SourceNoteProposal } from "@vaultseer/core";
import { hashString, planSourceNoteCreationOperation } from "@vaultseer/core";
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
});

class FakeVault {
  files = new Map<string, string>();
  folders = new Set<string>();
  readOverride: string | null = null;

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
    const content = this.files.get(file.path);
    if (content === undefined) throw new Error(`missing file ${file.path}`);
    return content;
  }

  async create(path: string, content: string): Promise<{ path: string }> {
    if (this.files.has(path)) throw new Error(`file already exists: ${path}`);
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    if (parentPath && !this.folders.has(parentPath)) throw new Error(`missing folder: ${parentPath}`);
    this.files.set(path, content);
    return { path };
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
