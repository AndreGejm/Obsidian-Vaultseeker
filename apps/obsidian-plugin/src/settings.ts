import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultseerPlugin from "./main";
import { DEFAULT_SETTINGS, type VaultseerSettings } from "./settings-model";
export { DEFAULT_SETTINGS, type VaultseerSettings } from "./settings-model";

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
      .setDesc("Use stored vectors and the local embedding endpoint for optional semantic results in Vaultseer search.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.semanticSearchEnabled).onChange(async (value) => {
          this.plugin.settings.semanticSearchEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Semantic indexing")
      .setDesc("Prepare semantic vectors from the local mirror. Keep this off unless you are intentionally testing embeddings.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.semanticIndexingEnabled).onChange(async (value) => {
          this.plugin.settings.semanticIndexingEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Embedding endpoint")
      .setDesc("Local embedding service endpoint used only by the explicit semantic batch command.")
      .addText((text) =>
        text.setValue(this.plugin.settings.embeddingEndpoint).onChange(async (value) => {
          this.plugin.settings.embeddingEndpoint = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Embedding provider")
      .setDesc("Provider identifier used for vector namespaces.")
      .addText((text) =>
        text.setValue(this.plugin.settings.embeddingProviderId).onChange(async (value) => {
          this.plugin.settings.embeddingProviderId = value.trim() || DEFAULT_SETTINGS.embeddingProviderId;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Embedding model")
      .setDesc("Model identifier used for vector namespaces.")
      .addText((text) =>
        text.setValue(this.plugin.settings.embeddingModelId).onChange(async (value) => {
          this.plugin.settings.embeddingModelId = value.trim() || DEFAULT_SETTINGS.embeddingModelId;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Embedding dimensions")
      .setDesc("Expected vector size for the configured embedding model.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.embeddingDimensions)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.embeddingDimensions = Number.isInteger(parsed) && parsed > 0
            ? parsed
            : DEFAULT_SETTINGS.embeddingDimensions;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Embedding batch size")
      .setDesc("Maximum chunks to process in one explicit semantic worker batch.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.embeddingBatchSize)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.embeddingBatchSize = Number.isInteger(parsed)
            ? Math.min(32, Math.max(1, parsed))
            : DEFAULT_SETTINGS.embeddingBatchSize;
          await this.plugin.saveSettings();
        })
      );
  }
}
