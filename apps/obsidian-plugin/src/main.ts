import path from "node:path";
import { Notice, Plugin, TFile } from "obsidian";
import {
  getEmbeddingJobTargetKind,
  isBuiltInTextSourceExtension,
  PersistentVaultseerStore,
  type EmbeddingJobRecord,
  type IndexHealth,
  type NoteRecordInput,
  type VaultseerStore
} from "@vaultseer/core";
import { checkReadOnlyIndexStaleness, clearReadOnlyIndex, rebuildReadOnlyIndex } from "./index-controller";
import { readVaultAssetRecords, readVaultNoteInputs, type VaultAssetReaderApp, type VaultReaderApp } from "./obsidian-adapter";
import { mapObsidianFileToNoteInput } from "./metadata-mapper";
import {
  DEFAULT_SETTINGS,
  normalizeCodexModel,
  normalizeCodexReasoningEffort,
  VaultseerSettingTab,
  type VaultseerSettings
} from "./settings";
import { VaultseerPluginDataStore } from "./plugin-data-store";
import { getVaultseerIndexFilePath, NodeVaultseerIndexFileHost } from "./plugin-index-file-host";
import { formatIndexHealthNotice } from "./health-message";
import { VaultseerSearchModal } from "./search-modal";
import { VaultseerSourceFilePickerModal } from "./source-file-picker-modal";
import { VaultseerSourcePreviewModal } from "./source-preview-modal";
import { VaultseerSourceSearchModal } from "./source-search-modal";
import { VaultseerWriteReviewQueueModal } from "./write-review-queue-modal";
import { ObsidianVaultWritePort, type ObsidianVaultWriteVault } from "./obsidian-vault-write-port";
import { importVaultTextSourceWorkspace } from "./source-intake-controller";
import { OllamaEmbeddingProvider } from "./ollama-embedding-provider";
import {
  cancelSourceSemanticIndexQueue,
  cancelSemanticIndexQueue,
  planSourceSemanticIndexQueue,
  planSemanticIndexQueue,
  recoverSourceSemanticIndexQueue,
  recoverSemanticIndexQueue,
  runSourceSemanticIndexBatch,
  runSemanticIndexBatch
} from "./semantic-index-controller";
import { searchSemanticIndex } from "./semantic-search-controller";
import { searchSourceSemanticIndex } from "./source-semantic-search-controller";
import { stageNoteLinkUpdateProposal } from "./link-write-proposal-controller";
import { stageNoteTagUpdateProposal } from "./tag-write-proposal-controller";
import {
  cancelSourceExtractionQueue,
  planMarkerSourceExtractionQueue,
  recoverSourceExtractionQueue,
  runMarkerSourceExtractionBatch,
  summarizeSourceExtractionQueue,
  type SourceExtractionQueueStatusSummary
} from "./source-extraction-controller";
import { MarkerSourceExtractor } from "./marker-source-extractor";
import type { SearchModalSemanticSearch } from "./search-modal-query";
import type { SourceSearchModalSemanticSearch } from "./source-search-modal-query";
import { activateVaultseerStudio, VAULTSEER_STUDIO_VIEW_TYPE, VaultseerStudioView } from "./studio-view";
import { activateVaultseerWorkbench, VAULTSEER_WORKBENCH_VIEW_TYPE, VaultseerWorkbenchView } from "./workbench-view";
import { buildActiveNoteContextFromStore } from "./active-note-context-controller";
import { createBuiltInApprovedScriptHandlers, mergeApprovedScriptDefinitions } from "./approved-script-builtins";
import { createApprovedScriptRegistry } from "./approved-script-registry";
import { createCodexReadOnlyToolImplementations } from "./codex-read-only-tool-implementations";
import type { CodexToolImplementations } from "./codex-tool-dispatcher";
import { NativeCodexAcpSessionClient } from "./native-codex-acp-session-client";
import {
  buildNativeCodexSetupSummary,
  formatNativeCodexSetupNotice,
  nativeCodexCommandExists,
  nativeCodexPathExists
} from "./native-codex-setup-check";
import { createVaultseerStudioCodexChatAdapter } from "./studio-codex-chat-composition";
import { createVaultseerAgentToolRegistry } from "./vaultseer-agent-tool-registry";
import {
  VAULTSEER_STUDIO_COMMAND_DEFINITIONS,
  type VaultseerStudioCommand
} from "./studio-command-catalog";
import { registerVaultseerCommands } from "./register-vaultseer-commands";
import { validateVaultRelativePath } from "./vault-path-policy";
import {
  addSelectedNoteActionMenuItems,
  buildSelectedNoteAgentActionDisplayMessage,
  buildSelectedNoteAgentActionPrompt,
  type SelectedNoteAgentActionRequest
} from "./selected-note-agent-action";

const SEMANTIC_RETRY_DELAY_MS = 30_000;
const SEMANTIC_MAX_ATTEMPTS = 3;
const SOURCE_EXTRACTION_PLAN_LIMIT = 8;
const SOURCE_EXTRACTION_BATCH_SIZE = 1;
const SOURCE_EXTRACTION_RETRY_DELAY_MS = 30_000;
const SOURCE_EXTRACTION_MAX_ATTEMPTS = 3;

export default class VaultseerPlugin extends Plugin {
  settings: VaultseerSettings = { ...DEFAULT_SETTINGS };
  private dataStore!: VaultseerPluginDataStore;
  private store!: VaultseerStore;
  private health: IndexHealth | null = null;
  private nativeCodexClient: NativeCodexAcpSessionClient | null = null;

  async onload(): Promise<void> {
    const vaultBasePath = getVaultBasePath(this.app);
    this.dataStore = new VaultseerPluginDataStore(
      this,
      vaultBasePath === null
        ? undefined
        : new NodeVaultseerIndexFileHost(getVaultseerIndexFilePath(vaultBasePath, this.manifest.id))
    );
    this.settings = await this.dataStore.loadSettings();
    this.store = await PersistentVaultseerStore.create(this.dataStore.createIndexBackend());
    this.health = await this.store.getHealth();
    await this.recoverInterruptedQueuesOnStartup().catch(() => {
      new Notice("Vaultseer could not recover interrupted jobs.");
    });
    const nativeCodexClient = new NativeCodexAcpSessionClient({
      getSettings: () => this.settings,
      getVaultBasePath: () => getVaultBasePath(this.app)
    });
    this.nativeCodexClient = nativeCodexClient;

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
          },
          async (currentNote, tagSuggestions) => {
            const file = this.app.workspace.getActiveFile();
            if (!file || file.path !== currentNote.path) {
              return "Open the indexed note before staging its tag suggestions.";
            }

            const summary = await stageNoteTagUpdateProposal({
              store: this.store,
              targetPath: currentNote.path,
              currentContent: await this.app.vault.cachedRead(file),
              tagSuggestions,
              now: () => new Date().toISOString()
            });
            return summary.message;
          },
          async (currentNote, linkSuggestions) => {
            const file = this.app.workspace.getActiveFile();
            if (!file || file.path !== currentNote.path) {
              return "Open the indexed note before staging its link suggestions.";
            }

            const summary = await stageNoteLinkUpdateProposal({
              store: this.store,
              targetPath: currentNote.path,
              currentContent: await this.app.vault.cachedRead(file),
              linkSuggestions,
              now: () => new Date().toISOString()
            });
            return summary.message;
          }
        )
    );
    this.registerView(
      VAULTSEER_STUDIO_VIEW_TYPE,
      (leaf) => {
        const writePort = new ObsidianVaultWritePort(this.app.vault as unknown as ObsidianVaultWriteVault);
        let codexTools: CodexToolImplementations;
        const approvedScriptRegistry = createApprovedScriptRegistry({
          definitions: mergeApprovedScriptDefinitions(this.settings.approvedScripts),
          handlers: createBuiltInApprovedScriptHandlers(() => codexTools)
        });
        codexTools = createCodexReadOnlyToolImplementations({
          store: this.store,
          getActivePath: () => this.app.workspace.getActiveFile()?.path ?? null,
          readActiveNoteInput: (path) => this.readActiveNoteInput(path),
          readActiveNoteContent: async (path) => (await this.readActiveNoteInput(path)).content,
          searchNotesSemanticSearch: this.createSearchModalSemanticSearch(),
          searchSourcesSemanticSearch: this.createSourceSearchModalSemanticSearch(),
          runVaultseerCommand: async (input) => this.runVaultseerStudioCommandRequest(input),
          rebuildNoteIndex: async () => {
            await this.rebuildIndex();
            const health = await this.store.getHealth();
            return {
              status: "completed",
              message: `Vaultseer indexed ${health.noteCount} note${health.noteCount === 1 ? "" : "s"} and ${health.chunkCount} chunk${health.chunkCount === 1 ? "" : "s"}.`,
              health
            };
          },
          planSemanticIndex: async () => {
            const before = await this.store.getEmbeddingJobRecords();
            await this.planSemanticIndex();
            const after = await this.store.getEmbeddingJobRecords();
            return {
              status: "completed",
              message: `Vaultseer semantic indexing queue now has ${after.filter((job) => job.status === "queued").length} queued job${after.filter((job) => job.status === "queued").length === 1 ? "" : "s"}.`,
              beforeJobCount: before.length,
              afterJobCount: after.length
            };
          },
          runSemanticIndexBatch: async () => {
            const before = await this.store.getEmbeddingJobRecords();
            await this.runSemanticIndexBatch();
            const after = await this.store.getEmbeddingJobRecords();
            return {
              status: "completed",
              message: `Vaultseer semantic indexing batch finished; ${after.filter((job) => job.status === "queued").length} queued job${after.filter((job) => job.status === "queued").length === 1 ? "" : "s"} remain.`,
              beforeJobCount: before.length,
              afterJobCount: after.length
            };
          },
          inspectPdfSourceExtractionQueue: async () => {
            const summary = await summarizeSourceExtractionQueue({ store: this.store });
            return {
              status: "ready",
              message: `Vaultseer PDF extraction queue: ${formatSourceExtractionQueueStatus(summary)}.`,
              ...summary
            };
          },
          planPdfSourceExtraction: async () => {
            const before = await summarizeSourceExtractionQueue({ store: this.store });
            await this.planSourceExtractionQueue();
            const after = await summarizeSourceExtractionQueue({ store: this.store });
            return {
              status: "completed",
              message: `Vaultseer PDF extraction queue now has ${after.queuedJobCount} queued job${after.queuedJobCount === 1 ? "" : "s"}.`,
              before,
              after
            };
          },
          runPdfSourceExtractionBatch: async () => {
            const before = await summarizeSourceExtractionQueue({ store: this.store });
            await this.runSourceExtractionBatch();
            const after = await summarizeSourceExtractionQueue({ store: this.store });
            return {
              status: "completed",
              message: `Vaultseer PDF extraction batch finished; ${after.queuedJobCount} queued job${after.queuedJobCount === 1 ? "" : "s"} remain.`,
              before,
              after
            };
          },
          planSourceSemanticIndex: async () => {
            const before = await this.store.getEmbeddingJobRecords();
            await this.planSourceSemanticIndex();
            const after = await this.store.getEmbeddingJobRecords();
            const queuedSourceJobs = countQueuedSourceEmbeddingJobs(after);
            return {
              status: "completed",
              message: `Vaultseer source semantic indexing queue now has ${queuedSourceJobs} queued job${queuedSourceJobs === 1 ? "" : "s"}.`,
              beforeJobCount: before.length,
              afterJobCount: after.length,
              queuedSourceJobCount: queuedSourceJobs
            };
          },
          runSourceSemanticIndexBatch: async () => {
            const before = await this.store.getEmbeddingJobRecords();
            await this.runSourceSemanticIndexBatch();
            const after = await this.store.getEmbeddingJobRecords();
            const queuedSourceJobs = countQueuedSourceEmbeddingJobs(after);
            return {
              status: "completed",
              message: `Vaultseer source semantic indexing batch finished; ${queuedSourceJobs} queued job${queuedSourceJobs === 1 ? "" : "s"} remain.`,
              beforeJobCount: before.length,
              afterJobCount: after.length,
              queuedSourceJobCount: queuedSourceJobs
            };
          },
          importVaultTextSource: async (input) => this.importVaultTextSourceToolRequest(input),
          writePort,
          approvedScriptRegistry,
          readVaultAssetRecords: () => readVaultAssetRecords(this.app as unknown as VaultAssetReaderApp),
          readVaultBinaryFile: (path) => this.readVaultBinaryFile(path)
        });

        return new VaultseerStudioView(
          leaf,
          this.store,
          () => this.app.workspace.getActiveFile()?.path ?? null,
          () => nativeCodexClient.getState().status,
          async () => {
            await this.resetNativeCodexSession();
          },
          () => ({
            codexModel: this.settings.codexModel,
            codexReasoningEffort: this.settings.codexReasoningEffort
          }),
          async (patch) => {
            if (patch.codexModel !== undefined) {
              await this.setNativeCodexModel(patch.codexModel);
              return;
            }
            if (patch.codexReasoningEffort !== undefined) {
              await this.setNativeCodexReasoningEffort(patch.codexReasoningEffort);
            }
          },
          () => this.createVaultseerStudioCommands(),
          async () =>
            buildActiveNoteContextFromStore({
              store: this.store,
              activePath: this.app.workspace.getActiveFile()?.path ?? null,
              readActiveNoteInput: (path) => this.readActiveNoteInput(path)
            }),
          createVaultseerStudioCodexChatAdapter({
            client: nativeCodexClient,
            registry: createVaultseerAgentToolRegistry({ tools: codexTools }),
            getSettings: () => this.settings
          }),
          codexTools,
          writePort,
          (path) => this.readVaultBinaryFile(path)
        );
      }
    );

    registerVaultseerCommands(this, this.createVaultseerStudioCommands());
    this.registerSelectedNoteActionMenu();
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
    await this.refreshVaultseerViews();
  }

  async clearIndex(): Promise<void> {
    this.health = await clearReadOnlyIndex(this.store);
    new Notice("Vaultseer index cleared.");
    await this.refreshVaultseerViews();
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

    new VaultseerSearchModal(
      this.app,
      this.store,
      async (path) => {
        await this.app.workspace.openLinkText(path, "", false);
      },
      this.createSearchModalSemanticSearch()
    ).open();
  }

  async showSourceSearch(): Promise<void> {
    new VaultseerSourceSearchModal(
      this.app,
      this.store,
      this.createSourceSearchModalSemanticSearch(),
      async (sourceId) => {
        await this.showSourcePreview(sourceId);
      }
    ).open();
  }

  async showSourcePreview(sourceId: string): Promise<void> {
    new VaultseerSourcePreviewModal(this.app, this.store, sourceId, this.settings.sourceNoteFolder).open();
  }

  async showWriteReviewQueue(): Promise<void> {
    new VaultseerWriteReviewQueueModal(
      this.app,
      this.store,
      new ObsidianVaultWritePort(this.app.vault as unknown as ObsidianVaultWriteVault)
    ).open();
  }

  async importActiveTextSource(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a text or code file before importing a source workspace.");
      return;
    }

    const summary = await importVaultTextSourceWorkspace({
      store: this.store,
      sourcePath: file.path,
      filename: file.name,
      extension: file.extension ? `.${file.extension}` : getFileExtension(file.name),
      sizeBytes: file.stat.size,
      readText: async () => this.app.vault.cachedRead(file),
      now: () => new Date().toISOString()
    });

    new Notice(summary.message);
  }

  private async importVaultTextSourceToolRequest(input: unknown): Promise<unknown> {
    const sourcePath = parseImportVaultTextSourcePath(input);
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      return {
        status: "not_found",
        sourcePath,
        message: `Vaultseer could not find vault file '${sourcePath}'.`
      };
    }

    const extension = file.extension ? `.${file.extension}` : getFileExtension(file.name);
    if (!isBuiltInTextSourceExtension(extension)) {
      return {
        status: "unsupported",
        sourcePath,
        extension,
        message: `Vaultseer can import text and code files as source workspaces, but '${sourcePath}' is not a supported text source.`
      };
    }

    const summary = await importVaultTextSourceWorkspace({
      store: this.store,
      sourcePath: file.path,
      filename: file.name,
      extension,
      sizeBytes: file.stat.size,
      readText: async () => this.app.vault.cachedRead(file),
      now: () => new Date().toISOString()
    });
    await this.refreshVaultseerViews();
    return summary;
  }

  async chooseTextSourceFile(): Promise<void> {
    new VaultseerSourceFilePickerModal(
      this.app,
      this.store,
      this.app.vault.getFiles(),
      this.settings.excludedFolders,
      () => new Date().toISOString()
    ).open();
  }

  async planSourceExtractionQueue(): Promise<void> {
    const summary = await planMarkerSourceExtractionQueue({
      store: this.store,
      files: this.app.vault.getFiles(),
      excludedFolders: this.settings.excludedFolders,
      now: new Date().toISOString(),
      maxJobs: SOURCE_EXTRACTION_PLAN_LIMIT
    });

    new Notice(
      `Vaultseer planned ${summary.plannedJobCount} PDF extraction job${summary.plannedJobCount === 1 ? "" : "s"}; ${summary.reusableSourceCount} already current, ${summary.skippedByLimitCount} skipped by limit.`
    );
    await this.refreshVaultseerViews();
  }

  async showSourceExtractionQueueStatus(): Promise<void> {
    const summary = await summarizeSourceExtractionQueue({
      store: this.store
    });

    new Notice(`Vaultseer source extraction queue: ${formatSourceExtractionQueueStatus(summary)}.`);
  }

  async runSourceExtractionBatch(): Promise<void> {
    const vaultBasePath = getVaultBasePath(this.app);
    if (!vaultBasePath) {
      new Notice("Vaultseer can only run Marker extraction with a local filesystem vault.");
      return;
    }

    const extractor = new MarkerSourceExtractor({
      outputRoot: path.join(vaultBasePath, ".obsidian", "plugins", this.manifest.id, "source-workspaces", "marker"),
      resolveSourcePath: (sourcePath) => path.join(vaultBasePath, ...sourcePath.split("/"))
    });
    const dependencies = await extractor.checkDependencies();
    const missingRequired = dependencies.find(
      (dependency) => dependency.required && dependency.status !== "available"
    );

    if (missingRequired) {
      new Notice(`Vaultseer cannot run Marker extraction: ${missingRequired.message ?? missingRequired.name}`);
      return;
    }

    const summary = await runMarkerSourceExtractionBatch({
      store: this.store,
      extractor,
      now: new Date().toISOString(),
      batchSize: SOURCE_EXTRACTION_BATCH_SIZE,
      retryDelayMs: SOURCE_EXTRACTION_RETRY_DELAY_MS,
      maxAttempts: SOURCE_EXTRACTION_MAX_ATTEMPTS
    });

    if (summary.claimed === 0) {
      new Notice("Vaultseer found no queued PDF source extraction jobs ready to run.");
    } else {
      new Notice(
        `Vaultseer source extraction completed ${summary.completed}/${summary.claimed} job${summary.claimed === 1 ? "" : "s"}; ${summary.failed} failed.`
      );
    }
    await this.refreshVaultseerViews();
  }

  async recoverSourceExtractionQueue(): Promise<void> {
    const summary = await recoverSourceExtractionQueue({
      store: this.store,
      now: new Date().toISOString()
    });

    if (summary.recoveredJobCount === 0) {
      new Notice("Vaultseer found no interrupted source extraction jobs to recover.");
    } else {
      new Notice(
        `Vaultseer recovered ${summary.recoveredJobCount} source extraction job${summary.recoveredJobCount === 1 ? "" : "s"}.`
      );
    }
    await this.refreshVaultseerViews();
  }

  async cancelSourceExtractionQueue(): Promise<void> {
    const summary = await cancelSourceExtractionQueue({
      store: this.store,
      now: new Date().toISOString()
    });

    if (summary.newlyCancelledJobCount === 0) {
      new Notice("Vaultseer found no active source extraction jobs to cancel.");
    } else {
      new Notice(
        `Vaultseer cancelled ${summary.newlyCancelledJobCount} source extraction job${summary.newlyCancelledJobCount === 1 ? "" : "s"}.`
      );
    }
    await this.refreshVaultseerViews();
  }

  async openWorkbench(): Promise<void> {
    const leaf = await activateVaultseerWorkbench(this.app);
    if (!leaf) {
      new Notice("Vaultseer could not open the workbench.");
    }
  }

  onunload(): void {
    void this.nativeCodexClient?.dispose();
    this.nativeCodexClient = null;
  }

  async openStudio(): Promise<void> {
    const leaf = await activateVaultseerStudio(this.app);
    if (!leaf) {
      new Notice("Vaultseer could not open Studio.");
    }
  }

  private registerSelectedNoteActionMenu(): void {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        addSelectedNoteActionMenuItems({
          menu,
          activePath: info.file?.path ?? this.app.workspace.getActiveFile()?.path ?? null,
          selectedText: editor.getSelection(),
          onAction: (request) => this.submitSelectedNoteAgentAction(request)
        });
      })
    );
  }

  private async submitSelectedNoteAgentAction(request: SelectedNoteAgentActionRequest): Promise<void> {
    const leaf = await activateVaultseerStudio(this.app);
    const view = leaf?.view;
    if (!(view instanceof VaultseerStudioView)) {
      new Notice("Vaultseer could not open Studio for the selected text.");
      return;
    }

    await view.submitExternalChatMessage(
      buildSelectedNoteAgentActionPrompt(request),
      buildSelectedNoteAgentActionDisplayMessage(request)
    );
  }

  async showNativeCodexSetupCheck(): Promise<void> {
    const summary = await buildNativeCodexSetupSummary({
      settings: this.settings,
      vaultBasePath: getVaultBasePath(this.app),
      commandExists: nativeCodexCommandExists,
      pathExists: nativeCodexPathExists
    });

    new Notice(formatNativeCodexSetupNotice(summary), 10_000);
  }

  async resetNativeCodexSession(): Promise<void> {
    await this.resetNativeCodexSessionQuietly();
    new Notice("Vaultseer reset the native Codex session.");
    await this.refreshVaultseerViews();
  }

  async setNativeCodexModel(value: string): Promise<void> {
    const codexModel = normalizeCodexModel(value);
    if (this.settings.codexModel === codexModel) return;

    this.settings.codexModel = codexModel;
    await this.saveSettings();
    await this.resetNativeCodexSessionQuietly();
    new Notice(`Vaultseer Codex model set to ${codexModel}.`);
    await this.refreshVaultseerViews();
  }

  async setNativeCodexReasoningEffort(value: string): Promise<void> {
    const codexReasoningEffort = normalizeCodexReasoningEffort(value);
    if (this.settings.codexReasoningEffort === codexReasoningEffort) return;

    this.settings.codexReasoningEffort = codexReasoningEffort;
    await this.saveSettings();
    await this.resetNativeCodexSessionQuietly();
    new Notice(`Vaultseer Codex reasoning set to ${codexReasoningEffort}.`);
    await this.refreshVaultseerViews();
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
    await this.refreshVaultseerViews();
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
    await this.refreshVaultseerViews();
  }

  async planSourceSemanticIndex(): Promise<void> {
    if (!this.settings.semanticIndexingEnabled) {
      new Notice("Vaultseer semantic indexing is disabled in settings.");
      return;
    }

    const summary = await planSourceSemanticIndexQueue({
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
      `Vaultseer planned ${summary.queuedJobCount} source semantic job${summary.queuedJobCount === 1 ? "" : "s"}.`
    );
    await this.refreshVaultseerViews();
  }

  async runSourceSemanticIndexBatch(): Promise<void> {
    if (!this.settings.semanticIndexingEnabled) {
      new Notice("Vaultseer semantic indexing is disabled in settings.");
      return;
    }

    if (this.settings.embeddingProviderId !== "ollama") {
      new Notice(`Vaultseer cannot run source semantic batches for provider '${this.settings.embeddingProviderId}'.`);
      return;
    }

    const summary = await runSourceSemanticIndexBatch({
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
      new Notice("Vaultseer found no queued source semantic jobs ready to run.");
    } else {
      new Notice(
        `Vaultseer source semantic batch completed ${summary.completed}/${summary.claimed} job${summary.claimed === 1 ? "" : "s"}; ${summary.failed} failed.`
      );
    }
    await this.refreshVaultseerViews();
  }

  async cancelSemanticIndexQueue(): Promise<void> {
    const summary = await cancelSemanticIndexQueue({
      store: this.store,
      now: new Date().toISOString()
    });

    if (summary.cancelledJobCount === 0) {
      new Notice("Vaultseer found no active semantic indexing jobs to cancel.");
    } else {
      new Notice(
        `Vaultseer cancelled ${summary.cancelledJobCount} semantic job${summary.cancelledJobCount === 1 ? "" : "s"}.`
      );
    }
    await this.refreshVaultseerViews();
  }

  async cancelSourceSemanticIndexQueue(): Promise<void> {
    const summary = await cancelSourceSemanticIndexQueue({
      store: this.store,
      now: new Date().toISOString()
    });

    if (summary.cancelledJobCount === 0) {
      new Notice("Vaultseer found no active source semantic indexing jobs to cancel.");
    } else {
      new Notice(
        `Vaultseer cancelled ${summary.cancelledJobCount} source semantic job${summary.cancelledJobCount === 1 ? "" : "s"}.`
      );
    }
    await this.refreshVaultseerViews();
  }

  private async recoverInterruptedQueuesOnStartup(): Promise<void> {
    const now = new Date().toISOString();
    const summary = await recoverSemanticIndexQueue({
      store: this.store,
      now
    });
    const sourceSummary = await recoverSourceSemanticIndexQueue({
      store: this.store,
      now
    });
    const extractionSummary = await recoverSourceExtractionQueue({
      store: this.store,
      now
    });
    const recoveredJobCount =
      summary.recoveredJobCount + sourceSummary.recoveredJobCount + extractionSummary.recoveredJobCount;

    if (recoveredJobCount > 0) {
      new Notice(
        `Vaultseer recovered ${recoveredJobCount} interrupted job${recoveredJobCount === 1 ? "" : "s"}.`
      );
    }
  }

  private async refreshVaultseerViews(): Promise<void> {
    await Promise.all(
      [
        ...this.app.workspace.getLeavesOfType(VAULTSEER_WORKBENCH_VIEW_TYPE),
        ...this.app.workspace.getLeavesOfType(VAULTSEER_STUDIO_VIEW_TYPE)
      ].map(async (leaf) => {
        const view = leaf.view;
        if (view instanceof VaultseerWorkbenchView || view instanceof VaultseerStudioView) {
          await view.refresh();
        }
      })
    );
  }

  getHealth(): IndexHealth | null {
    return this.health;
  }

  private async resetNativeCodexSessionQuietly(): Promise<void> {
    await this.nativeCodexClient?.resetSession();
  }

  private async readActiveNoteInput(path: string): Promise<NoteRecordInput> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.path !== path) {
      throw new Error("Open the current active note before using Vaultseer note actions.");
    }

    const content = await this.app.vault.cachedRead(file);
    return mapObsidianFileToNoteInput(file, content, this.app.metadataCache.getFileCache(file));
  }

  private async readVaultBinaryFile(path: string): Promise<ArrayBuffer> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Vaultseer could not find vault file '${path}'.`);
    }

    return this.app.vault.readBinary(file);
  }

  private createVaultseerStudioCommands(): VaultseerStudioCommand[] {
    const handlers: Record<string, () => Promise<void>> = {
      "rebuild-index": () => this.rebuildIndex(),
      "clear-index": () => this.clearIndex(),
      "show-index-health": () => this.showIndexHealth(),
      "search-index": () => this.showSearch(),
      "search-source-workspaces": () => this.showSourceSearch(),
      "open-write-review-queue": () => this.showWriteReviewQueue(),
      "import-active-text-source": () => this.importActiveTextSource(),
      "choose-text-source-file": () => this.chooseTextSourceFile(),
      "plan-source-extraction-queue": () => this.planSourceExtractionQueue(),
      "show-source-extraction-queue-status": () => this.showSourceExtractionQueueStatus(),
      "run-source-extraction-batch": () => this.runSourceExtractionBatch(),
      "recover-source-extraction-queue": () => this.recoverSourceExtractionQueue(),
      "cancel-source-extraction-queue": () => this.cancelSourceExtractionQueue(),
      "open-workbench": () => this.openWorkbench(),
      "open-studio": () => this.openStudio(),
      "check-native-codex-setup": () => this.showNativeCodexSetupCheck(),
      "reset-native-codex-session": () => this.resetNativeCodexSession(),
      "plan-semantic-index": () => this.planSemanticIndex(),
      "run-semantic-index-batch": () => this.runSemanticIndexBatch(),
      "cancel-semantic-index-queue": () => this.cancelSemanticIndexQueue(),
      "plan-source-semantic-index": () => this.planSourceSemanticIndex(),
      "run-source-semantic-index-batch": () => this.runSourceSemanticIndexBatch(),
      "cancel-source-semantic-index-queue": () => this.cancelSourceSemanticIndexQueue()
    };

    return VAULTSEER_STUDIO_COMMAND_DEFINITIONS.map((definition) => {
      const run = handlers[definition.id];
      if (run === undefined) {
        throw new Error(`Vaultseer Studio command '${definition.id}' has no handler.`);
      }

      return {
        ...definition,
        run
      };
    });
  }

  private async runVaultseerStudioCommandRequest(input: unknown): Promise<{ commandId: string; message: string }> {
    const commandId = parseVaultseerCommandId(input);
    const command = this.createVaultseerStudioCommands().find((candidate) => candidate.id === commandId);
    if (command === undefined) {
      throw new Error(`Vaultseer command '${commandId}' is not available.`);
    }

    await command.run();
    return {
      commandId,
      message: `Vaultseer command '${command.name}' completed.`
    };
  }

  private createSearchModalSemanticSearch(): SearchModalSemanticSearch | undefined {
    if (!this.settings.semanticSearchEnabled) return undefined;

    if (this.settings.embeddingProviderId !== "ollama") {
      return async () => ({
        status: "degraded",
        message: `Semantic search provider '${this.settings.embeddingProviderId}' is not supported in the search modal.`,
        results: []
      });
    }

    const provider = new OllamaEmbeddingProvider({
      endpoint: this.settings.embeddingEndpoint,
      modelId: this.settings.embeddingModelId
    });
    const modelProfile = {
      providerId: this.settings.embeddingProviderId,
      modelId: this.settings.embeddingModelId,
      dimensions: this.settings.embeddingDimensions
    };

    return (query) =>
      searchSemanticIndex({
        enabled: true,
        store: this.store,
        provider,
        modelProfile,
        query,
        limit: 10,
        minScore: 0.1,
        maxChunksPerNote: 3
      });
  }

  private createSourceSearchModalSemanticSearch(): SourceSearchModalSemanticSearch | undefined {
    if (!this.settings.semanticSearchEnabled) return undefined;

    if (this.settings.embeddingProviderId !== "ollama") {
      return async () => ({
        status: "degraded",
        message: `Source semantic search provider '${this.settings.embeddingProviderId}' is not supported in the search modal.`,
        results: []
      });
    }

    const provider = new OllamaEmbeddingProvider({
      endpoint: this.settings.embeddingEndpoint,
      modelId: this.settings.embeddingModelId
    });
    const modelProfile = {
      providerId: this.settings.embeddingProviderId,
      modelId: this.settings.embeddingModelId,
      dimensions: this.settings.embeddingDimensions
    };

    return (query) =>
      searchSourceSemanticIndex({
        enabled: true,
        store: this.store,
        provider,
        modelProfile,
        query,
        limit: 10,
        minScore: 0.1,
        maxChunksPerSource: 3
      });
  }
}

function parseVaultseerCommandId(input: unknown): string {
  if (typeof input === "string" && input.trim().length > 0) {
    return input.trim();
  }

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const commandId = (input as Record<string, unknown>)["commandId"];
    if (typeof commandId === "string" && commandId.trim().length > 0) {
      return commandId.trim();
    }
  }

  throw new Error("Vaultseer command requests must include a nonblank commandId.");
}

function parseImportVaultTextSourcePath(input: unknown): string {
  if (typeof input === "string" && input.trim().length > 0) {
    return validateVaultRelativePath(input.trim());
  }

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const sourcePath = (input as Record<string, unknown>)["path"];
    if (typeof sourcePath === "string" && sourcePath.trim().length > 0) {
      return validateVaultRelativePath(sourcePath.trim());
    }
  }

  throw new Error("Vaultseer source import requests must include a nonblank vault-relative path.");
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot);
}

function getVaultBasePath(app: { vault: { adapter: unknown } }): string | null {
  const adapter = app.vault.adapter as { getBasePath?: () => string };
  return typeof adapter.getBasePath === "function" ? adapter.getBasePath() : null;
}

function formatSourceExtractionQueueStatus(summary: SourceExtractionQueueStatusSummary): string {
  return [
    `${summary.totalJobCount} total`,
    `${summary.queuedJobCount} queued`,
    `${summary.runningJobCount} running`,
    `${summary.completedJobCount} completed`,
    `${summary.failedJobCount} failed`,
    `${summary.cancelledJobCount} cancelled`
  ].join(", ");
}

function countQueuedSourceEmbeddingJobs(jobs: EmbeddingJobRecord[]): number {
  return jobs.filter((job) => job.status === "queued" && getEmbeddingJobTargetKind(job) === "source").length;
}
