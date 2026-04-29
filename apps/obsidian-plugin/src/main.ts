import { Notice, Plugin } from "obsidian";
import { buildVaultSnapshot, type VaultSnapshot } from "@vaultseer/core";
import { readVaultNoteInputs, type VaultReaderApp } from "./obsidian-adapter";
import { DEFAULT_SETTINGS, VaultseerSettingTab, type VaultseerSettings } from "./settings";

export default class VaultseerPlugin extends Plugin {
  settings: VaultseerSettings = { ...DEFAULT_SETTINGS };
  private snapshot: VaultSnapshot | null = null;

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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async rebuildIndex(): Promise<void> {
    const inputs = await readVaultNoteInputs(this.app as unknown as VaultReaderApp);
    const includedInputs = inputs.filter((input) => !this.isExcluded(input.path));
    this.snapshot = buildVaultSnapshot(includedInputs);
    new Notice(`Vaultseer indexed ${this.snapshot.notes.length} notes.`);
  }

  getSnapshot(): VaultSnapshot | null {
    return this.snapshot;
  }

  private isExcluded(path: string): boolean {
    return this.settings.excludedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
  }
}

