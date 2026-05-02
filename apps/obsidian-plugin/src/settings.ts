import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultseerPlugin from "./main";
import {
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  DEFAULT_SETTINGS,
  normalizeCodexModel,
  normalizeCodexReasoningEffort,
  normalizeVaultFolderPath,
  type VaultseerSettings
} from "./settings-model";
export {
  DEFAULT_SETTINGS,
  normalizeCodexModel,
  normalizeCodexReasoningEffort,
  type VaultseerSettings
} from "./settings-model";

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
      .setName("Source note folder")
      .setDesc("Vault folder used for approved source-note creation. Vaultseer will not create the folder automatically.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.sourceNoteFolder)
          .setValue(this.plugin.settings.sourceNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.sourceNoteFolder = normalizeVaultFolderPath(value, DEFAULT_SETTINGS.sourceNoteFolder);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Native Codex enabled")
      .setDesc("Experimental Windows desktop process launching for local Codex sessions. Writes still require approval.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.nativeCodexEnabled).onChange(async (value) => {
          this.plugin.settings.nativeCodexEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Codex command")
      .setDesc("Command used by the experimental Windows desktop launcher. It does not bypass approval for writes.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.codexCommand)
          .setValue(this.plugin.settings.codexCommand)
          .onChange(async (value) => {
            this.plugin.settings.codexCommand = value.trim() || DEFAULT_SETTINGS.codexCommand;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Codex working directory")
      .setDesc("Windows folder where experimental desktop Codex sessions start. Writes still require explicit approval.")
      .addText((text) =>
        text
          .setPlaceholder("F:\\Dev\\Obsidian")
          .setValue(this.plugin.settings.codexWorkingDirectory)
          .onChange(async (value) => {
            this.plugin.settings.codexWorkingDirectory = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Codex model")
      .setDesc("Model used by native Studio chat. Changing it resets the native Codex session.")
      .addDropdown((dropdown) => {
        for (const model of CODEX_MODEL_OPTIONS) {
          dropdown.addOption(model, model);
        }
        dropdown.setValue(this.plugin.settings.codexModel).onChange(async (value) => {
          await this.plugin.setNativeCodexModel(normalizeCodexModel(value));
        });
      });

    new Setting(containerEl)
      .setName("Codex reasoning effort")
      .setDesc("Reasoning depth used by native Studio chat. Lower values are faster; higher values are deeper.")
      .addDropdown((dropdown) => {
        for (const effort of CODEX_REASONING_EFFORT_OPTIONS) {
          dropdown.addOption(effort, formatReasoningEffort(effort));
        }
        dropdown.setValue(this.plugin.settings.codexReasoningEffort).onChange(async (value) => {
          await this.plugin.setNativeCodexReasoningEffort(normalizeCodexReasoningEffort(value));
        });
      });

    new Setting(containerEl)
      .setName("Native Codex setup")
      .setDesc("Checks the command and working folder without starting Codex.")
      .addButton((button) =>
        button.setButtonText("Check setup").onClick(async () => {
          await this.plugin.showNativeCodexSetupCheck();
        })
      );

    new Setting(containerEl)
      .setName("Managed source folder")
      .setDesc(
        "Vault folder for managed sources in experimental Windows native Studio workflows. Writes still require approval."
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.managedSourceFolder)
          .setValue(this.plugin.settings.managedSourceFolder)
          .onChange(async (value) => {
            this.plugin.settings.managedSourceFolder = normalizeVaultFolderPath(
              value,
              DEFAULT_SETTINGS.managedSourceFolder
            );
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Plan folder")
      .setDesc("Vault folder for plans in experimental Windows native Studio workflows. Writes still require approval.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.planFolder)
          .setValue(this.plugin.settings.planFolder)
          .onChange(async (value) => {
            this.plugin.settings.planFolder = normalizeVaultFolderPath(value, DEFAULT_SETTINGS.planFolder);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Release folder")
      .setDesc(
        "Vault folder for release notes in experimental Windows native Studio workflows. Writes still require approval."
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.releaseFolder)
          .setValue(this.plugin.settings.releaseFolder)
          .onChange(async (value) => {
            this.plugin.settings.releaseFolder = normalizeVaultFolderPath(value, DEFAULT_SETTINGS.releaseFolder);
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

function formatReasoningEffort(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
