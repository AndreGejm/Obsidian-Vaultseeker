import { describe, expect, it } from "vitest";
import {
  buildVaultSnapshot,
  createVaultWriteDecisionRecord,
  InMemoryVaultseerStore,
  mergeVaultWriteOperations,
  PersistentVaultseerStore,
  planSourceNoteCreationOperation,
  upsertVaultWriteDecisionRecord
} from "../src/index";
import type {
  GuardedVaultWriteOperation,
  NoteRecordInput,
  SourceNoteProposal,
  StoredVaultIndex,
  VaultseerStorageBackend,
  VaultWriteDecisionRecord
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

describe("write operation helpers", () => {
  it("merges proposed write operations by id", () => {
    const existing = [
      writeOperation({ id: "vault-write:a", targetPath: "A.md", content: "old\n" }),
      writeOperation({ id: "vault-write:b", targetPath: "B.md" })
    ];
    const incoming = [
      writeOperation({ id: "vault-write:a", targetPath: "A.md", content: "new\n" }),
      writeOperation({ id: "vault-write:c", targetPath: "C.md" })
    ];

    expect(mergeVaultWriteOperations(existing, incoming).map((operation) => [operation.id, operation.content])).toEqual([
      ["vault-write:a", "new\n"],
      ["vault-write:b", "# Ragnarok\n"],
      ["vault-write:c", "# Ragnarok\n"]
    ]);
  });

  it("upserts write decisions by operation id", () => {
    const first = writeDecision({
      operationId: "vault-write:a",
      decision: "deferred",
      decidedAt: "2026-05-01T15:00:00.000Z"
    });
    const second = writeDecision({
      operationId: "vault-write:a",
      decision: "rejected",
      decidedAt: "2026-05-01T15:30:00.000Z"
    });

    expect(upsertVaultWriteDecisionRecord([first], second)).toEqual([second]);
  });
});

describe("write operation storage", () => {
  it("stores proposed write operations without applying them", async () => {
    const store = new InMemoryVaultseerStore();
    const operations = [writeOperation({ id: "vault-write:a" }), writeOperation({ id: "vault-write:b" })];

    await expect(store.replaceVaultWriteOperations(operations)).resolves.toEqual(operations);
    await expect(store.getVaultWriteOperations()).resolves.toEqual(operations);

    operations[0]!.content = "mutated after save\n";
    await expect(store.getVaultWriteOperations()).resolves.toEqual([
      writeOperation({ id: "vault-write:a" }),
      writeOperation({ id: "vault-write:b" })
    ]);
  });

  it("records write decisions separately from proposed operations", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation({ id: "vault-write:a" });
    await store.replaceVaultWriteOperations([operation]);

    const first = createVaultWriteDecisionRecord({
      operation,
      decision: "deferred",
      decidedAt: "2026-05-01T16:00:00.000Z"
    });
    const second = createVaultWriteDecisionRecord({
      operation,
      decision: "approved",
      decidedAt: "2026-05-01T16:30:00.000Z"
    });

    await expect(store.recordVaultWriteDecision(first)).resolves.toEqual([first]);
    await expect(store.recordVaultWriteDecision(second)).resolves.toEqual([second]);
    await expect(store.getVaultWriteOperations()).resolves.toEqual([operation]);
  });

  it("persists proposed write operations and decisions across reloads", async () => {
    const backend = new MemoryBackend();
    const store = await PersistentVaultseerStore.create(backend);
    const operation = writeOperation({ id: "vault-write:persisted" });
    const decision = writeDecision({ operationId: "vault-write:persisted", decision: "deferred" });

    await store.replaceVaultWriteOperations([operation]);
    await store.recordVaultWriteDecision(decision);
    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getVaultWriteOperations()).resolves.toEqual([operation]);
    await expect(reloaded.getVaultWriteDecisionRecords()).resolves.toEqual([decision]);
  });

  it("preserves proposed write operations and decisions across note mirror rebuilds", async () => {
    const store = new InMemoryVaultseerStore();
    const operation = writeOperation({ id: "vault-write:survives-rebuild" });
    const decision = writeDecision({ operationId: operation.id, decision: "deferred" });

    await store.replaceVaultWriteOperations([operation]);
    await store.recordVaultWriteDecision(decision);
    await store.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-05-01T17:00:00.000Z");

    await expect(store.getVaultWriteOperations()).resolves.toEqual([operation]);
    await expect(store.getVaultWriteDecisionRecords()).resolves.toEqual([decision]);
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

function writeDecision(overrides: Partial<VaultWriteDecisionRecord> = {}): VaultWriteDecisionRecord {
  return {
    operationId: "vault-write:default",
    decision: "approved",
    targetPath: "Source Notes/Ragnarok.md",
    suggestionIds: ["suggestion:source-note:source:ragnarok:draft"],
    decidedAt: "2026-05-01T16:00:00.000Z",
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
