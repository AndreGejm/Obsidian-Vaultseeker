import { describe, expect, it } from "vitest";
import {
  buildVaultSnapshot,
  createVaultWriteApplyFailureRecord,
  createVaultWriteApplySuccessRecord,
  InMemoryVaultseerStore,
  PersistentVaultseerStore,
  planSourceNoteCreationOperation,
  upsertVaultWriteApplyResultRecord
} from "../src/index";
import type {
  GuardedVaultWriteOperation,
  NoteRecordInput,
  SourceNoteProposal,
  StoredVaultIndex,
  VaultseerStorageBackend,
  VaultWriteApplyResultRecord
} from "../src/index";

class MemoryBackend implements VaultseerStorageBackend {
  value: StoredVaultIndex | null = null;

  async load(): Promise<StoredVaultIndex | null> {
    return this.value ? structuredClone(this.value) : null;
  }

  async save(value: StoredVaultIndex): Promise<void> {
    this.value = structuredClone(value);
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}

describe("write apply result helpers", () => {
  it("creates success and failure records without requiring a write adapter", () => {
    const operation = writeOperation({ id: "vault-write:record-shapes" });

    expect(
      createVaultWriteApplySuccessRecord({
        operation,
        beforeHash: null,
        afterHash: operation.preview.afterHash,
        appliedAt: "2026-05-01T18:00:00.000Z"
      })
    ).toEqual({
      operationId: operation.id,
      status: "applied",
      targetPath: operation.targetPath,
      beforeHash: null,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-01T18:00:00.000Z"
    });

    expect(
      createVaultWriteApplyFailureRecord({
        operation,
        stage: "precondition",
        expectedCurrentHash: null,
        actualCurrentHash: "existing-note-hash",
        message: "Target file already exists.",
        retryable: false,
        failedAt: "2026-05-01T18:05:00.000Z"
      })
    ).toEqual({
      operationId: operation.id,
      status: "failed",
      targetPath: operation.targetPath,
      stage: "precondition",
      expectedCurrentHash: null,
      actualCurrentHash: "existing-note-hash",
      message: "Target file already exists.",
      retryable: false,
      failedAt: "2026-05-01T18:05:00.000Z"
    });
  });

  it("upserts apply results by operation id", () => {
    const failed = applyResult({ operationId: "vault-write:a", status: "failed", failedAt: "2026-05-01T18:00:00.000Z" });
    const applied = applyResult({
      operationId: "vault-write:a",
      status: "applied",
      appliedAt: "2026-05-01T18:10:00.000Z"
    });

    expect(upsertVaultWriteApplyResultRecord([failed], applied)).toEqual([applied]);
  });
});

describe("write apply result storage", () => {
  it("records apply results separately from proposals and decisions", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation({ id: "vault-write:apply-result" });
    await store.replaceVaultWriteOperations([operation]);

    const failure = createVaultWriteApplyFailureRecord({
      operation,
      stage: "write",
      expectedCurrentHash: null,
      actualCurrentHash: null,
      message: "Filesystem write failed.",
      retryable: true,
      failedAt: "2026-05-01T18:00:00.000Z"
    });

    await expect(store.recordVaultWriteApplyResult(failure)).resolves.toEqual([failure]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([operation]);
    await expect(store.getVaultWriteApplyResultRecords()).resolves.toEqual([failure]);
  });

  it("persists apply results across reloads and mirror rebuilds", async () => {
    const backend = new MemoryBackend();
    const store = await PersistentVaultseerStore.create(backend);
    const operation = writeOperation({ id: "vault-write:persisted-result" });
    const result = createVaultWriteApplySuccessRecord({
      operation,
      beforeHash: null,
      afterHash: operation.preview.afterHash,
      appliedAt: "2026-05-01T18:00:00.000Z"
    });

    await store.replaceVaultWriteOperations([operation]);
    await store.recordVaultWriteApplyResult(result);
    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-05-01T18:30:00.000Z");
    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getVaultWriteOperations()).resolves.toEqual([operation]);
    await expect(reloaded.getVaultWriteApplyResultRecords()).resolves.toEqual([result]);
  });
});

const noteInputs: NoteRecordInput[] = [
  {
    path: "Existing.md",
    basename: "Existing",
    content: "# Existing\n",
    stat: { ctime: 1, mtime: 2, size: 11 },
    metadata: { frontmatter: {}, tags: [], links: [], headings: [{ level: 1, heading: "Existing" }] }
  }
];

function writeOperation(overrides: Partial<GuardedVaultWriteOperation> = {}): GuardedVaultWriteOperation {
  return {
    ...planSourceNoteCreationOperation({
      proposal: sourceNoteProposal(),
      targetPath: overrides.targetPath ?? "Source Notes/Ragnarok.md",
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

function applyResult(overrides: Partial<VaultWriteApplyResultRecord>): VaultWriteApplyResultRecord {
  if (overrides.status === "failed") {
    return {
      operationId: "vault-write:default",
      status: "failed",
      targetPath: "Source Notes/Ragnarok.md",
      stage: "write",
      expectedCurrentHash: null,
      actualCurrentHash: null,
      message: "Write failed.",
      retryable: true,
      failedAt: "2026-05-01T18:00:00.000Z",
      ...overrides
    };
  }

  return {
    operationId: "vault-write:default",
    status: "applied",
    targetPath: "Source Notes/Ragnarok.md",
    beforeHash: null,
    afterHash: "sha256:after",
    appliedAt: "2026-05-01T18:00:00.000Z",
    ...overrides
  };
}
