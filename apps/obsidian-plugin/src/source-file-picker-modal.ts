import { App, Notice, SuggestModal, type TFile } from "obsidian";
import type { VaultseerStore } from "@vaultseer/core";
import { importVaultTextSourceWorkspace } from "./source-intake-controller";
import {
  buildSourceFilePickerItems,
  type SourceFilePickerItem
} from "./source-file-picker-state";

export class VaultseerSourceFilePickerModal extends SuggestModal<SourceFilePickerItem> {
  private readonly items: SourceFilePickerItem[];
  private readonly filesByPath: Map<string, TFile>;

  constructor(
    app: App,
    private readonly store: VaultseerStore,
    files: TFile[],
    excludedFolders: string[],
    private readonly now: () => string
  ) {
    super(app);
    this.limit = 50;
    this.emptyStateText = "No supported text or code source files found.";
    this.setPlaceholder("Choose a text or code file to import as a source workspace");
    this.filesByPath = new Map(files.map((file) => [file.path, file]));
    this.items = buildSourceFilePickerItems({ files, excludedFolders });
  }

  getSuggestions(query: string): SourceFilePickerItem[] {
    const terms = normalizeQuery(query);
    if (terms.length === 0) return this.items.slice(0, this.limit);

    return this.items
      .filter((item) => {
        const haystack = `${item.filename} ${item.sourcePath} ${item.extension}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, this.limit);
  }

  renderSuggestion(item: SourceFilePickerItem, el: HTMLElement): void {
    el.createEl("div", { text: item.displayName, cls: "vaultseer-source-file-picker-title" });
    el.createEl("div", { text: item.sourcePath, cls: "vaultseer-source-file-picker-path" });
    el.createEl("div", { text: item.detail, cls: "vaultseer-source-file-picker-detail" });
  }

  onChooseSuggestion(item: SourceFilePickerItem): void {
    void this.importItem(item);
  }

  private async importItem(item: SourceFilePickerItem): Promise<void> {
    const file = this.filesByPath.get(item.sourcePath);
    if (!file) {
      new Notice(`Vaultseer could not find ${item.sourcePath} in the current vault.`);
      return;
    }

    try {
      const summary = await importVaultTextSourceWorkspace({
        store: this.store,
        sourcePath: item.sourcePath,
        filename: item.filename,
        extension: item.extension,
        sizeBytes: item.sizeBytes,
        readText: async () => this.app.vault.cachedRead(file),
        now: this.now
      });
      new Notice(summary.message);
    } catch (error) {
      new Notice(`Vaultseer could not import ${item.filename}: ${getErrorMessage(error)}`);
    }
  }
}

function normalizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
