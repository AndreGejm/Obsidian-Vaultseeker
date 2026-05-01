import { describe, expect, it } from "vitest";
import { InMemoryVaultseerStore, PersistentVaultseerStore } from "../src/index";
import type { DecisionRecord, StoredVaultIndex, SuggestionRecord, VaultseerStorageBackend } from "../src/index";

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

describe("suggestion storage", () => {
  it("stores suggestion records and updates health count", async () => {
    const store = new InMemoryVaultseerStore();
    const suggestions = [
      suggestionRecord({ id: "suggestion:a", type: "source_note_tag" }),
      suggestionRecord({ id: "suggestion:b", type: "source_note_link" })
    ];

    await expect(store.replaceSuggestionRecords(suggestions)).resolves.toMatchObject({
      suggestionCount: 2
    });
    await expect(store.getSuggestionRecords()).resolves.toEqual(suggestions);

    suggestions[0]!.confidence = 0.01;
    await expect(store.getSuggestionRecords()).resolves.toEqual([
      suggestionRecord({ id: "suggestion:a", type: "source_note_tag" }),
      suggestionRecord({ id: "suggestion:b", type: "source_note_link" })
    ]);
  });

  it("records the current decision separately from the suggestion", async () => {
    const store = new InMemoryVaultseerStore();
    await store.replaceSuggestionRecords([suggestionRecord({ id: "suggestion:a" })]);

    const firstDecision: DecisionRecord = {
      suggestionId: "suggestion:a",
      decision: "deferred",
      decidedAt: "2026-05-01T12:00:00.000Z"
    };
    const secondDecision: DecisionRecord = {
      suggestionId: "suggestion:a",
      decision: "rejected",
      decidedAt: "2026-05-01T12:30:00.000Z"
    };

    await expect(store.recordSuggestionDecision(firstDecision)).resolves.toEqual([firstDecision]);
    await expect(store.recordSuggestionDecision(secondDecision)).resolves.toEqual([secondDecision]);
    await expect(store.getSuggestionRecords()).resolves.toEqual([suggestionRecord({ id: "suggestion:a" })]);
  });

  it("persists suggestions and decisions across store reloads", async () => {
    const backend = new MemoryBackend();
    const store = await PersistentVaultseerStore.create(backend);
    const suggestions = [suggestionRecord({ id: "suggestion:persisted", type: "source_note_draft" })];
    const decision: DecisionRecord = {
      suggestionId: "suggestion:persisted",
      decision: "accepted",
      decidedAt: "2026-05-01T13:00:00.000Z"
    };

    await store.replaceSuggestionRecords(suggestions);
    await store.recordSuggestionDecision(decision);
    const reloaded = await PersistentVaultseerStore.create(backend);

    await expect(reloaded.getHealth()).resolves.toMatchObject({ suggestionCount: 1 });
    await expect(reloaded.getSuggestionRecords()).resolves.toEqual(suggestions);
    await expect(reloaded.getDecisionRecords()).resolves.toEqual([decision]);
  });

  it("preserves suggestions and decisions across note mirror rebuilds", async () => {
    const store = new InMemoryVaultseerStore();
    const suggestion = suggestionRecord({ id: "suggestion:survives-rebuild" });
    const decision: DecisionRecord = {
      suggestionId: suggestion.id,
      decision: "deferred",
      decidedAt: "2026-05-01T14:00:00.000Z"
    };

    await store.replaceSuggestionRecords([suggestion]);
    await store.recordSuggestionDecision(decision);
    await store.replaceNoteIndex(
      {
        notes: [],
        notesByPath: {},
        notePathsByTag: {},
        outgoingLinksByPath: {}
      },
      "2026-05-01T14:30:00.000Z"
    );

    await expect(store.getSuggestionRecords()).resolves.toEqual([suggestion]);
    await expect(store.getDecisionRecords()).resolves.toEqual([decision]);
  });
});

function suggestionRecord(overrides: Partial<SuggestionRecord>): SuggestionRecord {
  return {
    id: "suggestion:default",
    type: "source_note_tag",
    targetPath: "Sources/timer.pdf",
    confidence: 0.7,
    evidence: [
      {
        type: "source_term_match",
        sourceId: "source:timer",
        chunkId: "source-chunk:timer:overview",
        matchedTerms: ["timer"],
        tag: "electronics/timing"
      }
    ],
    createdAt: "2026-05-01T12:00:00.000Z",
    ...overrides
  };
}
