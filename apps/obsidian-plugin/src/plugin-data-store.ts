import type { StoredVaultIndex, VaultseerStorageBackend } from "@vaultseer/core";
import { normalizeApprovedScriptDefinitions } from "./approved-script-registry";
import {
  DEFAULT_SETTINGS,
  normalizeCodexModel,
  normalizeCodexProvider,
  normalizeCodexReasoningEffort,
  normalizeVaultFolderPath,
  type VaultseerSettings
} from "./settings-model";

export type VaultseerPluginData = {
  settings: VaultseerSettings;
  index: StoredVaultIndex | null;
};

export type VaultseerPluginPersistedData = {
  settings: VaultseerSettings;
  index?: StoredVaultIndex | null;
};

export type VaultseerPluginDataHost = {
  loadData(): Promise<unknown>;
  saveData(data: VaultseerPluginPersistedData): Promise<void>;
};

export type VaultseerPluginIndexDataHost = {
  loadIndexData(): Promise<unknown>;
  saveIndexData(data: StoredVaultIndex): Promise<void>;
  clearIndexData(): Promise<void>;
};

export class VaultseerPluginDataStore {
  constructor(
    private readonly host: VaultseerPluginDataHost,
    private readonly indexHost?: VaultseerPluginIndexDataHost
  ) {}

  async loadSettings(): Promise<VaultseerSettings> {
    return normalizePluginData(await this.host.loadData()).settings;
  }

  async saveSettings(settings: VaultseerSettings): Promise<void> {
    const data = normalizePluginData(await this.host.loadData());
    if (data.index !== null && this.indexHost !== undefined && (await this.loadExternalIndex()) === null) {
      await this.indexHost.saveIndexData(data.index);
    }

    await this.savePluginData({
      settings: normalizeSettings(settings),
      index: data.index
    });
  }

  createIndexBackend(): VaultseerStorageBackend {
    return {
      load: async () => this.loadIndex(),
      save: async (value) => this.saveIndex(value),
      clear: async () => this.clearIndex()
    };
  }

  private async loadIndex(): Promise<StoredVaultIndex | null> {
    const data = normalizePluginData(await this.host.loadData());
    const externalIndex = await this.loadExternalIndex();

    if (externalIndex !== null) {
      if (data.index !== null) {
        await this.savePluginData({
          settings: data.settings,
          index: null
        });
      }
      return externalIndex;
    }

    if (data.index !== null && this.indexHost !== undefined) {
      await this.indexHost.saveIndexData(data.index);
      await this.savePluginData({
        settings: data.settings,
        index: null
      });
    }

    return data.index;
  }

  private async saveIndex(value: StoredVaultIndex): Promise<void> {
    const data = normalizePluginData(await this.host.loadData());

    if (this.indexHost !== undefined) {
      await this.indexHost.saveIndexData(value);
      await this.savePluginData({
        settings: data.settings,
        index: null
      });
      return;
    }

    await this.savePluginData({
      settings: data.settings,
      index: value
    });
  }

  private async clearIndex(): Promise<void> {
    const data = normalizePluginData(await this.host.loadData());

    if (this.indexHost !== undefined) {
      await this.indexHost.clearIndexData();
      await this.savePluginData({
        settings: data.settings,
        index: null
      });
      return;
    }

    await this.savePluginData({
      settings: data.settings,
      index: null
    });
  }

  private async loadExternalIndex(): Promise<StoredVaultIndex | null> {
    if (this.indexHost === undefined) {
      return null;
    }

    const index = await this.indexHost.loadIndexData();
    return isStoredIndexLike(index) ? index : null;
  }

  private async savePluginData(data: VaultseerPluginData): Promise<void> {
    if (this.indexHost !== undefined) {
      await this.host.saveData({
        settings: data.settings
      });
      return;
    }

    await this.host.saveData(data);
  }
}

function normalizePluginData(raw: unknown): VaultseerPluginData {
  if (isObject(raw) && "settings" in raw) {
    return {
      settings: normalizeSettings(raw.settings),
      index: isStoredIndexLike(raw.index) ? raw.index : null
    };
  }

  return {
    settings: normalizeSettings(raw),
    index: null
  };
}

function normalizeSettings(raw: unknown): VaultseerSettings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };

  return {
    excludedFolders: Array.isArray(raw.excludedFolders)
      ? raw.excludedFolders.filter((value): value is string => typeof value === "string")
      : DEFAULT_SETTINGS.excludedFolders,
    semanticSearchEnabled:
      typeof raw.semanticSearchEnabled === "boolean" ? raw.semanticSearchEnabled : DEFAULT_SETTINGS.semanticSearchEnabled,
    semanticIndexingEnabled:
      typeof raw.semanticIndexingEnabled === "boolean"
        ? raw.semanticIndexingEnabled
        : DEFAULT_SETTINGS.semanticIndexingEnabled,
    embeddingEndpoint: normalizeNonEmptyString(raw.embeddingEndpoint, DEFAULT_SETTINGS.embeddingEndpoint),
    embeddingProviderId: normalizeNonEmptyString(raw.embeddingProviderId, DEFAULT_SETTINGS.embeddingProviderId),
    embeddingModelId: normalizeNonEmptyString(raw.embeddingModelId, DEFAULT_SETTINGS.embeddingModelId),
    embeddingDimensions: normalizePositiveInteger(raw.embeddingDimensions, DEFAULT_SETTINGS.embeddingDimensions),
    embeddingBatchSize: normalizeBoundedInteger(raw.embeddingBatchSize, DEFAULT_SETTINGS.embeddingBatchSize, 1, 32),
    sourceNoteFolder: normalizeVaultFolderPath(raw.sourceNoteFolder, DEFAULT_SETTINGS.sourceNoteFolder),
    codexProvider: normalizeCodexProvider(raw.codexProvider),
    openAiApiKey: typeof raw.openAiApiKey === "string" ? raw.openAiApiKey.trim() : DEFAULT_SETTINGS.openAiApiKey,
    openAiBaseUrl: normalizeNonEmptyString(raw.openAiBaseUrl, DEFAULT_SETTINGS.openAiBaseUrl).replace(/\/+$/g, ""),
    nativeCodexEnabled:
      typeof raw.nativeCodexEnabled === "boolean" ? raw.nativeCodexEnabled : DEFAULT_SETTINGS.nativeCodexEnabled,
    codexCommand: normalizeNonEmptyString(raw.codexCommand, DEFAULT_SETTINGS.codexCommand),
    codexWorkingDirectory:
      typeof raw.codexWorkingDirectory === "string"
        ? raw.codexWorkingDirectory.trim()
        : DEFAULT_SETTINGS.codexWorkingDirectory,
    codexModel: normalizeCodexModel(raw.codexModel),
    codexReasoningEffort: normalizeCodexReasoningEffort(raw.codexReasoningEffort),
    approvedScripts: normalizeApprovedScriptDefinitions(raw.approvedScripts),
    managedSourceFolder: normalizeVaultFolderPath(raw.managedSourceFolder, DEFAULT_SETTINGS.managedSourceFolder),
    planFolder: normalizeVaultFolderPath(raw.planFolder, DEFAULT_SETTINGS.planFolder),
    releaseFolder: normalizeVaultFolderPath(raw.releaseFolder, DEFAULT_SETTINGS.releaseFolder)
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStoredIndexLike(value: unknown): value is StoredVaultIndex {
  return isObject(value) && typeof value.schemaVersion === "number" && isObject(value.health);
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
