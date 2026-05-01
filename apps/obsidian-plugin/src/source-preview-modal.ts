import { App, Modal, Notice } from "obsidian";
import type { VaultseerStore } from "@vaultseer/core";
import {
  buildSourcePreviewState,
  type SourcePreviewAttachment,
  type SourcePreviewChunkGroup,
  type SourcePreviewDiagnostic,
  type SourcePreviewSourceSummary,
  type SourcePreviewState
} from "./source-preview-state";

export class VaultseerSourcePreviewModal extends Modal {
  constructor(
    app: App,
    private readonly store: VaultseerStore,
    private readonly sourceId: string
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
    contentEl.createEl("h2", { text: "Vaultseer Source Preview" });
    contentEl.createEl("p", { text: "Loading source workspace..." });

    try {
      const [sources, chunks] = await Promise.all([
        this.store.getSourceRecords(),
        this.store.getSourceChunkRecords()
      ]);
      this.renderState(buildSourcePreviewState({ sourceId: this.sourceId, sources, chunks }));
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Source Preview" });
      contentEl.createEl("p", { text: `Could not load source preview: ${getErrorMessage(error)}` });
      new Notice("Vaultseer could not load the source preview.");
    }
  }

  private renderState(state: SourcePreviewState): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: state.title });
    contentEl.createEl("p", { text: state.message });

    if (state.source) {
      this.renderSourceSummary(contentEl, state.source);
    }

    this.renderDiagnostics(contentEl, state.diagnostics);
    this.renderAttachments(contentEl, state.attachments);
    this.renderMarkdownPreview(contentEl, state.markdownPreview);
    this.renderChunkGroups(contentEl, state.chunkGroups);
  }

  private renderSourceSummary(containerEl: HTMLElement, source: SourcePreviewSourceSummary): void {
    const sectionEl = containerEl.createEl("section", { cls: "vaultseer-source-preview-summary" });
    sectionEl.createEl("h3", { text: "Source" });
    sectionEl.createEl("div", { text: source.sourcePath });
    sectionEl.createEl("div", { text: `Status: ${source.status}` });
    sectionEl.createEl("div", { text: `Extractor: ${source.extractor}` });
    sectionEl.createEl("div", { text: `Imported: ${source.importedAt}` });
    sectionEl.createEl("div", { text: `Size: ${formatBytes(source.sizeBytes)}` });
  }

  private renderDiagnostics(containerEl: HTMLElement, diagnostics: SourcePreviewDiagnostic[]): void {
    const sectionEl = containerEl.createEl("section", { cls: "vaultseer-source-preview-diagnostics" });
    sectionEl.createEl("h3", { text: "Diagnostics" });

    if (diagnostics.length === 0) {
      sectionEl.createEl("p", { text: "No extraction diagnostics are stored for this source." });
      return;
    }

    const listEl = sectionEl.createEl("ul");
    for (const diagnostic of diagnostics) {
      listEl.createEl("li", {
        text: `${diagnostic.severity}: ${diagnostic.code} at ${diagnostic.location}: ${diagnostic.message}`
      });
    }
  }

  private renderAttachments(containerEl: HTMLElement, attachments: SourcePreviewAttachment[]): void {
    const sectionEl = containerEl.createEl("section", { cls: "vaultseer-source-preview-attachments" });
    sectionEl.createEl("h3", { text: "Attachments" });

    if (attachments.length === 0) {
      sectionEl.createEl("p", { text: "No staged attachments are stored for this source." });
      return;
    }

    const listEl = sectionEl.createEl("ul");
    for (const attachment of attachments) {
      const mimeType = attachment.mimeType ? `, ${attachment.mimeType}` : "";
      listEl.createEl("li", {
        text: `${attachment.kind}: ${attachment.filename}${mimeType} at ${attachment.location} (${attachment.stagedPath})`
      });
    }
  }

  private renderMarkdownPreview(containerEl: HTMLElement, markdownPreview: string): void {
    const sectionEl = containerEl.createEl("section", { cls: "vaultseer-source-preview-markdown" });
    sectionEl.createEl("h3", { text: "Extracted Markdown" });

    if (!markdownPreview.trim()) {
      sectionEl.createEl("p", { text: "No extracted Markdown is stored for this source." });
      return;
    }

    sectionEl.createEl("pre", { text: markdownPreview });
  }

  private renderChunkGroups(containerEl: HTMLElement, groups: SourcePreviewChunkGroup[]): void {
    const sectionEl = containerEl.createEl("section", { cls: "vaultseer-source-preview-chunks" });
    sectionEl.createEl("h3", { text: "Search Chunks" });

    if (groups.length === 0) {
      sectionEl.createEl("p", { text: "No searchable chunks are stored for this source." });
      return;
    }

    for (const group of groups) {
      const groupEl = sectionEl.createEl("section", { cls: "vaultseer-source-preview-chunk-group" });
      groupEl.createEl("h4", { text: group.label });

      for (const chunk of group.chunks) {
        const chunkEl = groupEl.createEl("article", { cls: "vaultseer-source-preview-chunk" });
        chunkEl.createEl("div", { text: `Chunk ${chunk.ordinal + 1} · ${chunk.location}` });
        chunkEl.createEl("p", { text: chunk.text });
      }
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
