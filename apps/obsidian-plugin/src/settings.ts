import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultseerPlugin from "./main";

export type VaultseerSettings = {
  excludedFolders: string[];
  semanticSearchEnabled: boolean;
  embeddingEndpoint: string;
};

export const DEFAULT_SETTINGS: VaultseerSettings = {
  excludedFolders: [".obsidian", "research"],
  semanticSearchEnabled: false,
  embeddingEndpoint: "http://localhost:11434"
};

export class VaultseerSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: VaultseerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Vaultseer" });

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated vault folders Vaultseer should ignore during indexing.")
      .addText((text) =>
        text
          .setPlaceholder(".obsidian, research")
          .setValue(this.plugin.settings.excludedFolders.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Semantic search")
      .setDesc("Reserved for the embedding queue sprint. Lexical search remains the primary fallback.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.semanticSearchEnabled).onChange(async (value) => {
          this.plugin.settings.semanticSearchEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Embedding endpoint")
      .setDesc("Local embedding service endpoint for a later semantic indexing sprint.")
      .addText((text) =>
        text.setValue(this.plugin.settings.embeddingEndpoint).onChange(async (value) => {
          this.plugin.settings.embeddingEndpoint = value.trim();
          await this.plugin.saveSettings();
        })
      );
  }
}

