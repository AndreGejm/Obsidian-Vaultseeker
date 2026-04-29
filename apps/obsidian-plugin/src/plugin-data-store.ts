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
    embeddingEndpoint: typeof raw.embeddingEndpoint === "string" ? raw.embeddingEndpoint : DEFAULT_SETTINGS.embeddingEndpoint
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStoredIndexLike(value: unknown): value is StoredVaultIndex {
  return isObject(value) && typeof value.schemaVersion === "number" && isObject(value.health);
}
