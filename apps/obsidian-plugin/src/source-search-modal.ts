import { App, Modal, Notice, Setting } from "obsidian";
import {
  buildSourceLexicalIndex,
  type SourceChunkRecord,
  type SourceLexicalIndexRecord,
  type SourceRecord,
  type VaultseerStore
} from "@vaultseer/core";
import {
  buildSourceSearchModalState,
  type SourceSearchModalResult,
  type SourceSearchModalState
} from "./source-search-modal-state";
import {
  buildSourceSearchModalQueryState,
  type SourceSearchModalSemanticSearch
} from "./source-search-modal-query";

type SourceSearchData = {
  sources: SourceRecord[];
  chunks: SourceChunkRecord[];
  lexicalIndex: SourceLexicalIndexRecord[];
};

export class VaultseerSourceSearchModal extends Modal {
  constructor(
    app: App,
    private readonly store: VaultseerStore,
    private readonly semanticSearch?: SourceSearchModalSemanticSearch
  ) {
    super(app);
  }

  onOpen(): void {
    void this.loadAndRender();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async loadAndRender(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Vaultseer Source Search" });
    contentEl.createEl("p", { text: "Loading stored source workspaces..." });

    try {
      const data = await this.loadSearchData();
      this.renderSearch(data);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Source Search" });
      contentEl.createEl("p", { text: `Could not load source workspaces: ${getErrorMessage(error)}` });
      new Notice("Vaultseer could not load source search data.");
    }
  }

  private async loadSearchData(): Promise<SourceSearchData> {
    const [sources, chunks] = await Promise.all([
      this.store.getSourceRecords(),
      this.store.getSourceChunkRecords()
    ]);

    return {
      sources,
      chunks,
      lexicalIndex: buildSourceLexicalIndex(sources, chunks)
    };
  }

  private renderSearch(data: SourceSearchData): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Vaultseer Source Search" });

    const statusEl = contentEl.createEl("p");
    const resultsEl = contentEl.createEl("div");
    let activeRequestId = 0;
    let currentQuery = "";
    const hasSearchableSource = data.sources.some((source) => source.status === "extracted");

    const renderState = (state: SourceSearchModalState): void => {
      statusEl.textContent = state.message;
      resultsEl.empty();

      for (const result of state.results) {
        this.renderResult(resultsEl, result);
      }
    };

    const renderResults = (query: string, options: { runSemantic?: boolean } = {}): void => {
      const requestId = ++activeRequestId;
      const initialState = buildSourceSearchModalState({ query, ...data });
      renderState(initialState);

      if (!options.runSemantic || !this.semanticSearch || !query.trim() || !hasSearchableSource) return;

      statusEl.textContent = `${initialState.message} Source semantic search is running...`;
      void buildSourceSearchModalQueryState({ query, ...data, semanticSearch: this.semanticSearch }).then((state) => {
        if (requestId !== activeRequestId) return;
        renderState(state);
      });
    };

    const searchSetting = new Setting(contentEl)
      .setName("Search sources")
      .setDesc("Search stored extracted source workspaces.")
      .addText((text) => {
        text.setPlaceholder("filename, section, phrase, or topic");
        text.inputEl.addEventListener("input", () => {
          currentQuery = text.inputEl.value;
          renderResults(currentQuery);
        });
        text.inputEl.focus();
      });

    if (this.semanticSearch) {
      searchSetting.addButton((button) => {
        button.setButtonText("Run semantic");
        button.onClick(() => renderResults(currentQuery, { runSemantic: true }));
      });
    }

    renderResults("");
  }

  private renderResult(containerEl: HTMLElement, result: SourceSearchModalResult): void {
    const resultEl = containerEl.createEl("div", { cls: "vaultseer-source-search-result" });

    resultEl.createEl("div", { text: result.filename, cls: "vaultseer-source-search-result-title" });
    resultEl.createEl("div", { text: result.sourcePath, cls: "vaultseer-source-search-result-path" });
    resultEl.createEl("div", { text: formatSourceLabel(result.source), cls: "vaultseer-source-search-result-source" });
    if (result.reason) {
      resultEl.createEl("div", { text: result.reason, cls: "vaultseer-source-search-result-reason" });
    }
    if (result.excerpt) {
      resultEl.createEl("p", { text: result.excerpt, cls: "vaultseer-source-search-result-excerpt" });
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatSourceLabel(source: SourceSearchModalResult["source"]): string {
  switch (source) {
    case "lexical":
      return "Lexical";
    case "semantic":
      return "Semantic";
    case "hybrid":
      return "Lexical + semantic";
  }
}
