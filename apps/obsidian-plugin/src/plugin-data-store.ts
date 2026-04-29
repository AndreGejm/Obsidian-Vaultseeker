import type { StoredVaultIndex, VaultseerStorageBackend } from "@vaultseer/core";
import { DEFAULT_SETTINGS, type VaultseerSettings } from "./settings-model";

export type VaultseerPluginData = {
  settings: VaultseerSettings;
  index: StoredVaultIndex | null;
};

export type VaultseerPluginDataHost = {
  loadData(): Promise<unknown>;
  saveData(data: VaultseerPluginData): Promise<void>;
};

export class VaultseerPluginDataStore {
  constructor(private readonly host: VaultseerPluginDataHost) {}

  async loadSettings(): Promise<VaultseerSettings> {
    return normalizePluginData(await this.host.loadData()).settings;
  }

  async saveSettings(settings: VaultseerSettings): Promise<void> {
    const data = normalizePluginData(await this.host.loadData());
    await this.host.saveData({
      ...data,
      settings: normalizeSettings(settings)
    });
  }

  createIndexBackend(): VaultseerStorageBackend {
    return {
      load: async () => normalizePluginData(await this.host.loadData()).index,
      save: async (value) => {
        const data = normalizePluginData(await this.host.loadData());
        await this.host.saveData({
          ...data,
          index: value
        });
      },
      clear: async () => {
        const data = normalizePluginData(await this.host.loadData());
        await this.host.saveData({
          ...data,
          index: null
        });
      }
    };
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
    embeddingBatchSize: normalizeBoundedInteger(raw.embeddingBatchSize, DEFAULT_SETTINGS.embeddingBatchSize, 1, 32)
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
