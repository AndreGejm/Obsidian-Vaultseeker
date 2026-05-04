import { describe, expect, it } from "vitest";
import { VaultseerPluginDataStore } from "../src/plugin-data-store";
import { buildVaultSnapshot, PersistentVaultseerStore } from "@vaultseer/core";
import type { NoteRecordInput, StoredVaultIndex } from "@vaultseer/core";

const defaultSettings = {
  excludedFolders: [".obsidian", "research"],
  semanticSearchEnabled: false,
  semanticIndexingEnabled: false,
  embeddingEndpoint: "http://localhost:11434",
  embeddingProviderId: "ollama",
  embeddingModelId: "nomic-embed-text",
  embeddingDimensions: 768,
  embeddingBatchSize: 8,
  sourceNoteFolder: "Source Notes",
  codexProvider: "acp",
  openAiApiKey: "",
  openAiBaseUrl: "https://api.openai.com/v1",
  nativeCodexEnabled: false,
  codexCommand: "codex-acp",
  codexWorkingDirectory: "",
  codexModel: "gpt-5.3-codex-spark",
  codexReasoningEffort: "medium",
  managedSourceFolder: "Sources",
  planFolder: "Plans",
  releaseFolder: "Releases"
};

const storedIndex: StoredVaultIndex = {
  schemaVersion: 1,
  notes: [],
  fileVersions: [],
  chunks: [],
  lexicalIndex: [],
  vectors: [],
  embeddingJobs: [],
  suggestions: [],
  decisions: [],
  health: {
    schemaVersion: 1,
    status: "ready",
    statusMessage: null,
    lastIndexedAt: "2026-04-29T21:30:00.000Z",
    noteCount: 0,
    chunkCount: 0,
    vectorCount: 0,
    suggestionCount: 0,
    warnings: []
  }
};

const noteInputs: NoteRecordInput[] = [
  {
    path: "A.md",
    basename: "A",
    content: "Alpha",
    stat: { ctime: 1, mtime: 2, size: 10 },
    metadata: { frontmatter: { tags: ["alpha"] }, tags: ["#alpha"], links: [], headings: [] }
  }
];

function createHarness(initialData: unknown = null): {
  store: VaultseerPluginDataStore;
  saved: () => unknown;
} {
  let data = initialData;
  return {
    store: new VaultseerPluginDataStore({
      loadData: async () => data,
      saveData: async (next) => {
        data = structuredClone(next);
      }
    }),
    saved: () => data
  };
}

function createExternalIndexHarness(initialData: unknown = null, initialIndexData: unknown = null): {
  store: VaultseerPluginDataStore;
  saved: () => unknown;
  savedIndex: () => unknown;
} {
  let data = initialData;
  let indexData = initialIndexData;
  return {
    store: new VaultseerPluginDataStore(
      {
        loadData: async () => data,
        saveData: async (next) => {
          data = structuredClone(next);
        }
      },
      {
        loadIndexData: async () => indexData,
        saveIndexData: async (next) => {
          indexData = structuredClone(next);
        },
        clearIndexData: async () => {
          indexData = null;
        }
      }
    ),
    saved: () => data,
    savedIndex: () => indexData
  };
}

describe("VaultseerPluginDataStore", () => {
  it("loads legacy root settings without requiring an index wrapper", async () => {
    const legacySettings = {
      excludedFolders: ["Archive"],
      semanticSearchEnabled: true,
      embeddingEndpoint: "http://localhost:11435"
    };
    const { store } = createHarness(legacySettings);

    await expect(store.loadSettings()).resolves.toEqual({
      ...defaultSettings,
      excludedFolders: ["Archive"],
      semanticSearchEnabled: true,
      embeddingEndpoint: "http://localhost:11435"
    });
  });

  it("loads semantic indexing settings with safe defaults and numeric bounds", async () => {
    const { store } = createHarness({
      settings: {
        excludedFolders: ["Archive"],
        semanticSearchEnabled: true,
        semanticIndexingEnabled: true,
        embeddingEndpoint: "  http://localhost:11435  ",
        embeddingProviderId: "  ollama  ",
        embeddingModelId: "  custom-embed  ",
        embeddingDimensions: 0,
        embeddingBatchSize: 99
      },
      index: null
    });

    await expect(store.loadSettings()).resolves.toEqual({
      ...defaultSettings,
      excludedFolders: ["Archive"],
      semanticSearchEnabled: true,
      semanticIndexingEnabled: true,
      embeddingEndpoint: "http://localhost:11435",
      embeddingProviderId: "ollama",
      embeddingModelId: "custom-embed",
      embeddingDimensions: 768,
      embeddingBatchSize: 32
    });
  });

  it("normalizes the configured source note folder", async () => {
    const { store } = createHarness({
      settings: {
        sourceNoteFolder: " /Literature//Sources\\Inbox/ "
      },
      index: null
    });

    await expect(store.loadSettings()).resolves.toEqual({
      ...defaultSettings,
      sourceNoteFolder: "Literature/Sources/Inbox"
    });
  });

  it("falls back to the default source note folder for blank persisted values", async () => {
    const { store } = createHarness({
      settings: {
        sourceNoteFolder: "   "
      },
      index: null
    });

    await expect(store.loadSettings()).resolves.toEqual(defaultSettings);
  });

  it("normalizes native Codex settings", async () => {
    const { store } = createHarness({
      settings: {
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian",
        codexModel: "gpt-5.4",
        codexReasoningEffort: "medium"
      },
      index: null
    });

    const settings = await store.loadSettings();

    expect(settings.nativeCodexEnabled).toBe(true);
    expect(settings.codexCommand).toBe("codex");
    expect(settings.codexWorkingDirectory).toBe("F:\\Dev\\Obsidian");
    expect(settings.codexModel).toBe("gpt-5.4");
    expect(settings.codexReasoningEffort).toBe("medium");
  });

  it("saves settings without dropping the persisted index", async () => {
    const { store, saved } = createHarness({
      settings: defaultSettings,
      index: storedIndex
    });

    await store.saveSettings({
      ...defaultSettings,
      excludedFolders: ["Archive", "Inbox"]
    });

    expect(saved()).toEqual({
      settings: {
        ...defaultSettings,
        excludedFolders: ["Archive", "Inbox"]
      },
      index: storedIndex
    });
  });

  it("provides an index backend that saves and clears index data without dropping settings", async () => {
    const { store, saved } = createHarness({
      settings: defaultSettings,
      index: null
    });
    const backend = store.createIndexBackend();

    await backend.save(storedIndex);
    await expect(backend.load()).resolves.toEqual(storedIndex);
    expect(saved()).toEqual({
      settings: defaultSettings,
      index: storedIndex
    });

    await backend.clear();
    await expect(backend.load()).resolves.toBeNull();
    expect(saved()).toEqual({
      settings: defaultSettings,
      index: null
    });
  });

  it("stores index data in the external index host when one is available", async () => {
    const { store, saved, savedIndex } = createExternalIndexHarness({
      settings: defaultSettings,
      index: null
    });
    const backend = store.createIndexBackend();

    await backend.save(storedIndex);
    await expect(backend.load()).resolves.toEqual(storedIndex);

    expect(savedIndex()).toEqual(storedIndex);
    expect(saved()).toEqual({
      settings: defaultSettings
    });

    await backend.clear();
    await expect(backend.load()).resolves.toBeNull();
    expect(savedIndex()).toBeNull();
    expect(saved()).toEqual({
      settings: defaultSettings
    });
  });

  it("migrates a legacy data.json index to the external index host on first load", async () => {
    const { store, saved, savedIndex } = createExternalIndexHarness({
      settings: defaultSettings,
      index: storedIndex
    });
    const backend = store.createIndexBackend();

    await expect(backend.load()).resolves.toEqual(storedIndex);

    expect(savedIndex()).toEqual(storedIndex);
    expect(saved()).toEqual({
      settings: defaultSettings
    });
  });

  it("migrates a legacy data.json index before saving settings to external-index data", async () => {
    const { store, saved, savedIndex } = createExternalIndexHarness({
      settings: defaultSettings,
      index: storedIndex
    });

    await store.saveSettings({
      ...defaultSettings,
      excludedFolders: ["Archive"]
    });

    expect(savedIndex()).toEqual(storedIndex);
    expect(saved()).toEqual({
      settings: {
        ...defaultSettings,
        excludedFolders: ["Archive"]
      }
    });
  });

  it("prefers the external index host over stale legacy data.json index data", async () => {
    const externalIndex = {
      ...storedIndex,
      health: {
        ...storedIndex.health,
        noteCount: 42
      }
    };
    const { store, saved, savedIndex } = createExternalIndexHarness(
      {
        settings: defaultSettings,
        index: storedIndex
      },
      externalIndex
    );
    const backend = store.createIndexBackend();

    await expect(backend.load()).resolves.toEqual(externalIndex);

    expect(savedIndex()).toEqual(externalIndex);
    expect(saved()).toEqual({
      settings: defaultSettings
    });
  });

  it("supports the core persistent store without overwriting settings", async () => {
    const { store, saved } = createHarness({
      settings: {
        ...defaultSettings,
        excludedFolders: ["Archive"]
      },
      index: null
    });
    const persistentStore = await PersistentVaultseerStore.create(store.createIndexBackend());

    await persistentStore.replaceNoteIndex(buildVaultSnapshot(noteInputs), "2026-04-29T21:45:00.000Z");

    expect(saved()).toMatchObject({
      settings: {
        ...defaultSettings,
        excludedFolders: ["Archive"]
      },
      index: {
        schemaVersion: 1,
        health: {
          status: "ready",
          lastIndexedAt: "2026-04-29T21:45:00.000Z",
          noteCount: 1
        }
      }
    });
  });
});
