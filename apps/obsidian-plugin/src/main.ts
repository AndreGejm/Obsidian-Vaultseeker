import { Notice, Plugin } from "obsidian";
import { PersistentVaultseerStore, type IndexHealth, type VaultseerStore } from "@vaultseer/core";
import { checkReadOnlyIndexStaleness, clearReadOnlyIndex, rebuildReadOnlyIndex } from "./index-controller";
import { readVaultNoteInputs, type VaultReaderApp } from "./obsidian-adapter";
import { DEFAULT_SETTINGS, VaultseerSettingTab, type VaultseerSettings } from "./settings";
import { VaultseerPluginDataStore } from "./plugin-data-store";
import { formatIndexHealthNotice } from "./health-message";
import { VaultseerSearchModal } from "./search-modal";
import { OllamaEmbeddingProvider } from "./ollama-embedding-provider";
import { planSemanticIndexQueue, runSemanticIndexBatch } from "./semantic-index-controller";
import { activateVaultseerWorkbench, VAULTSEER_WORKBENCH_VIEW_TYPE, VaultseerWorkbenchView } from "./workbench-view";

const SEMANTIC_RETRY_DELAY_MS = 30_000;
const SEMANTIC_MAX_ATTEMPTS = 3;

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
    this.registerView(
      VAULTSEER_WORKBENCH_VIEW_TYPE,
      (leaf) =>
        new VaultseerWorkbenchView(
          leaf,
          this.store,
          () => this.app.workspace.getActiveFile()?.path ?? null,
          async (path) => {
            await this.app.workspace.openLinkText(path, "", false);
          },
          {
            "rebuild-index": async () => {
              await this.rebuildIndex();
            },
            "clear-index": async () => {
              await this.clearIndex();
            }
          }
        )
    );

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

    this.addCommand({
      id: "open-workbench",
      name: "Open read-only workbench",
      callback: async () => {
        await this.openWorkbench();
      }
    });

    this.addCommand({
      id: "plan-semantic-index",
      name: "Plan semantic indexing queue",
      callback: async () => {
        await this.planSemanticIndex();
      }
    });

    this.addCommand({
      id: "run-semantic-index-batch",
      name: "Run one semantic indexing batch",
      callback: async () => {
        await this.runSemanticIndexBatch();
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
    await this.refreshWorkbenchViews();
  }

  async clearIndex(): Promise<void> {
    this.health = await clearReadOnlyIndex(this.store);
    new Notice("Vaultseer index cleared.");
    await this.refreshWorkbenchViews();
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

  async openWorkbench(): Promise<void> {
    const leaf = await activateVaultseerWorkbench(this.app);
    if (!leaf) {
      new Notice("Vaultseer could not open the workbench.");
    }
  }

  async planSemanticIndex(): Promise<void> {
    if (!this.settings.semanticIndexingEnabled) {
      new Notice("Vaultseer semantic indexing is disabled in settings.");
      return;
    }

    const summary = await planSemanticIndexQueue({
      store: this.store,
      modelProfile: {
        providerId: this.settings.embeddingProviderId,
        modelId: this.settings.embeddingModelId,
        dimensions: this.settings.embeddingDimensions
      },
      now: new Date().toISOString(),
      maxJobs: this.settings.embeddingBatchSize
    });
    new Notice(
      `Vaultseer planned ${summary.queuedJobCount} semantic job${summary.queuedJobCount === 1 ? "" : "s"}.`
    );
    await this.refreshWorkbenchViews();
  }

  async runSemanticIndexBatch(): Promise<void> {
    if (!this.settings.semanticIndexingEnabled) {
      new Notice("Vaultseer semantic indexing is disabled in settings.");
      return;
    }

    if (this.settings.embeddingProviderId !== "ollama") {
      new Notice(`Vaultseer cannot run semantic batches for provider '${this.settings.embeddingProviderId}'.`);
      return;
    }

    const summary = await runSemanticIndexBatch({
      store: this.store,
      provider: new OllamaEmbeddingProvider({
        endpoint: this.settings.embeddingEndpoint,
        modelId: this.settings.embeddingModelId
      }),
      modelProfile: {
        providerId: this.settings.embeddingProviderId,
        modelId: this.settings.embeddingModelId,
        dimensions: this.settings.embeddingDimensions
      },
      now: new Date().toISOString(),
      batchSize: this.settings.embeddingBatchSize,
      retryDelayMs: SEMANTIC_RETRY_DELAY_MS,
      maxAttempts: SEMANTIC_MAX_ATTEMPTS
    });

    if (summary.claimed === 0) {
      new Notice("Vaultseer found no queued semantic jobs ready to run.");
    } else {
      new Notice(
        `Vaultseer semantic batch completed ${summary.completed}/${summary.claimed} job${summary.claimed === 1 ? "" : "s"}; ${summary.failed} failed.`
      );
    }
    await this.refreshWorkbenchViews();
  }

  private async refreshWorkbenchViews(): Promise<void> {
    await Promise.all(
      this.app.workspace.getLeavesOfType(VAULTSEER_WORKBENCH_VIEW_TYPE).map(async (leaf) => {
        const view = leaf.view;
        if (view instanceof VaultseerWorkbenchView) {
          await view.refresh();
        }
      })
    );
  }

  getHealth(): IndexHealth | null {
    return this.health;
  }
}
