import { Notice, Plugin } from "obsidian";
import { InMemoryVaultseerStore, type IndexHealth, type VaultseerStore } from "@vaultseer/core";
import { clearReadOnlyIndex, rebuildReadOnlyIndex } from "./index-controller";
import { readVaultNoteInputs, type VaultReaderApp } from "./obsidian-adapter";
import { DEFAULT_SETTINGS, VaultseerSettingTab, type VaultseerSettings } from "./settings";

export default class VaultseerPlugin extends Plugin {
  settings: VaultseerSettings = { ...DEFAULT_SETTINGS };
  private readonly store: VaultseerStore = new InMemoryVaultseerStore();
  private health: IndexHealth | null = null;

  async onload(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData())
    };

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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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

  getHealth(): IndexHealth | null {
    return this.health;
  }
}
