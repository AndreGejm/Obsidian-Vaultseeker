import { App, Modal, Notice, Setting } from "obsidian";
import type { ChunkRecord, IndexHealth, LexicalIndexRecord, NoteRecord, VaultseerStore } from "@vaultseer/core";
import { buildSearchModalState, type SearchModalResult } from "./search-modal-state";

type SearchMirrorData = {
  health: IndexHealth;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexRecord[];
};

export class VaultseerSearchModal extends Modal {
  constructor(
    app: App,
    private readonly store: VaultseerStore,
    private readonly openNote: (path: string) => Promise<void>
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
    contentEl.createEl("h2", { text: "Vaultseer Search" });
    contentEl.createEl("p", { text: "Loading the indexed mirror..." });

    try {
      const data = await this.loadSearchMirrorData();
      this.renderSearch(data);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Search" });
      contentEl.createEl("p", { text: `Could not load the indexed mirror: ${getErrorMessage(error)}` });
      new Notice("Vaultseer could not load search data.");
    }
  }

  private async loadSearchMirrorData(): Promise<SearchMirrorData> {
    const [health, notes, chunks, lexicalIndex] = await Promise.all([
      this.store.getHealth(),
      this.store.getNoteRecords(),
      this.store.getChunkRecords(),
      this.store.getLexicalIndexRecords()
    ]);

    return { health, notes, chunks, lexicalIndex };
  }

  private renderSearch(data: SearchMirrorData): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Vaultseer Search" });

    const statusEl = contentEl.createEl("p");
    const resultsEl = contentEl.createEl("div");

    const renderResults = (query: string): void => {
      const state = buildSearchModalState({ query, ...data });
      statusEl.textContent = state.message;
      resultsEl.empty();

      if (state.status === "blocked") return;

      for (const result of state.results) {
        this.renderResult(resultsEl, result);
      }
    };

    new Setting(contentEl)
      .setName("Search")
      .setDesc("Search the last read-only Vaultseer index.")
      .addText((text) => {
        text.setPlaceholder("tag, title, alias, or topic");
        text.inputEl.addEventListener("input", () => renderResults(text.inputEl.value));
        text.inputEl.focus();
      });

    renderResults("");
  }

  private renderResult(containerEl: HTMLElement, result: SearchModalResult): void {
    const resultEl = containerEl.createEl("div", { cls: "vaultseer-search-result" });

    const openButton = resultEl.createEl("button", { text: result.title });
    openButton.addEventListener("click", async () => {
      await this.openNote(result.notePath);
      this.close();
    });

    resultEl.createEl("div", { text: result.notePath, cls: "vaultseer-search-result-path" });
    if (result.reason) {
      resultEl.createEl("div", { text: result.reason, cls: "vaultseer-search-result-reason" });
    }
    if (result.excerpt) {
      resultEl.createEl("p", { text: result.excerpt, cls: "vaultseer-search-result-excerpt" });
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
