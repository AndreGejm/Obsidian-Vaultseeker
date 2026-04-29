import { Notice, Plugin } from "obsidian";
import { PersistentVaultseerStore, type IndexHealth, type VaultseerStore } from "@vaultseer/core";
import { checkReadOnlyIndexStaleness, clearReadOnlyIndex, rebuildReadOnlyIndex } from "./index-controller";
import { readVaultNoteInputs, type VaultReaderApp } from "./obsidian-adapter";
import { DEFAULT_SETTINGS, VaultseerSettingTab, type VaultseerSettings } from "./settings";
import { VaultseerPluginDataStore } from "./plugin-data-store";
import { formatIndexHealthNotice } from "./health-message";
import { VaultseerSearchModal } from "./search-modal";

export default class VaultseerPlugin extends Plugin {
  settings: VaultseerSettings = { ...DEFAULT_SETTINGS };
  private readonly dataStore = new VaultseerPluginDataStore(this);
  private store!: VaultseerStore;
  private health: IndexHealth | null = null;

  async onload(): Promise<void> {
    this.settings = await this.dataStore.loadSettings();
    this.store = await PersistentVaultseerStore.create(this.dataStore.createIndexBackend());
    this.health = await this.store.getHealth();

    this.addSettingTab(new VaultseerSettingTab(this.app, this));

    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild read-only vault index",
      callback: async () => {
        await this.rebuildIndex();
      }
    });

    this.addCommand({
      id: "clear-index",
      name: "Clear read-only vault index",
      callback: async () => {
        await this.clearIndex();
      }
    });

    this.addCommand({
      id: "show-index-health",
      name: "Check read-only vault index health",
      callback: async () => {
        await this.showIndexHealth();
      }
    });

    this.addCommand({
      id: "search-index",
      name: "Search read-only vault index",
      callback: async () => {
        await this.showSearch();
      }
    });
  }

  async saveSettings(): Promise<void> {
    await this.dataStore.saveSettings(this.settings);
  }

  async rebuildIndex(): Promise<void> {
    this.health = await rebuildReadOnlyIndex({
      readNoteInputs: () => readVaultNoteInputs(this.app as unknown as VaultReaderApp),
      store: this.store,
      excludedFolders: this.settings.excludedFolders,
      now: () => new Date().toISOString()
    });
    new Notice(`Vaultseer indexed ${this.health.noteCount} notes.`);
  }

  async clearIndex(): Promise<void> {
    this.health = await clearReadOnlyIndex(this.store);
    new Notice("Vaultseer index cleared.");
  }

  async showIndexHealth(): Promise<void> {
    this.health = await checkReadOnlyIndexStaleness({
      readNoteInputs: () => readVaultNoteInputs(this.app as unknown as VaultReaderApp),
      store: this.store,
      excludedFolders: this.settings.excludedFolders
    });
    new Notice(formatIndexHealthNotice(this.health));
  }

  async showSearch(): Promise<void> {
    try {
      this.health = await checkReadOnlyIndexStaleness({
        readNoteInputs: () => readVaultNoteInputs(this.app as unknown as VaultReaderApp),
        store: this.store,
        excludedFolders: this.settings.excludedFolders
      });
    } catch {
      new Notice("Vaultseer could not check index freshness before search.");
    }

    new VaultseerSearchModal(this.app, this.store, async (path) => {
      await this.app.workspace.openLinkText(path, "", false);
    }).open();
  }

  getHealth(): IndexHealth | null {
    return this.health;
  }
}
