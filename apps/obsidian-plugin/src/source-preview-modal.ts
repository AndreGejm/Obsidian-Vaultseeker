import { App, Modal, Notice } from "obsidian";
import type {
  SourceNoteProposal,
  SourceNoteProposalHeading,
  SourceNoteProposalLink,
  SourceNoteProposalRelatedNote,
  SourceNoteProposalTag,
  VaultseerStore
} from "@vaultseer/core";
import { mergeSuggestionRecords } from "@vaultseer/core";
import {
  buildSourcePreviewState,
  type SourcePreviewAttachment,
  type SourcePreviewChunkGroup,
  type SourcePreviewDiagnostic,
  type SourcePreviewSourceSummary,
  type SourcePreviewState
} from "./source-preview-state";
import { VaultseerSourceNoteWriteReviewModal } from "./source-note-write-review-modal";

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
      const [sources, chunks, notes, suggestions] = await Promise.all([
        this.store.getSourceRecords(),
        this.store.getSourceChunkRecords(),
        this.store.getNoteRecords(),
        this.store.getSuggestionRecords()
      ]);
      const state = buildSourcePreviewState({
        sourceId: this.sourceId,
        sources,
        chunks,
        notes,
        createdAt: new Date().toISOString()
      });
      if (state.suggestionRecords.length > 0) {
        await this.store.replaceSuggestionRecords(mergeSuggestionRecords(suggestions, state.suggestionRecords));
      }
      this.renderState(state);
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
    this.renderNoteProposal(contentEl, state.noteProposal, state.noteWriteReview);
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

  private renderNoteProposal(
    containerEl: HTMLElement,
    proposal: SourceNoteProposal | null,
    noteWriteReview: SourcePreviewState["noteWriteReview"]
  ): void {
    if (!proposal) return;

    const sectionEl = containerEl.createEl("section", { cls: "vaultseer-source-preview-note-proposal" });
    sectionEl.createEl("h3", { text: "Draft Note Proposal" });
    sectionEl.createEl("p", {
      text: "Read-only proposal. Vaultseer will not create or edit a note from this preview."
    });
    sectionEl.createEl("div", { text: `Title: ${proposal.title}` });

    if (noteWriteReview) {
      const reviewButton = sectionEl.createEl("button", { text: "Review guarded note creation" });
      reviewButton.addEventListener("click", () => {
        new VaultseerSourceNoteWriteReviewModal(this.app, noteWriteReview).open();
      });
    }

    if (proposal.summary) {
      sectionEl.createEl("h4", { text: "Summary" });
      sectionEl.createEl("p", { text: proposal.summary });
    }

    this.renderAliases(sectionEl, proposal.aliases);
    this.renderSuggestedTags(sectionEl, proposal.suggestedTags);
    this.renderSuggestedLinks(sectionEl, proposal.suggestedLinks);
    this.renderRelatedNotes(sectionEl, proposal.relatedNotes);
    this.renderOutline(sectionEl, proposal.outlineHeadings);

    sectionEl.createEl("h4", { text: "Markdown Preview" });
    sectionEl.createEl("pre", { text: proposal.markdownPreview });
  }

  private renderAliases(containerEl: HTMLElement, aliases: string[]): void {
    if (aliases.length === 0) return;
    containerEl.createEl("h4", { text: "Aliases" });
    const listEl = containerEl.createEl("ul");
    for (const alias of aliases) {
      listEl.createEl("li", { text: alias });
    }
  }

  private renderSuggestedTags(containerEl: HTMLElement, tags: SourceNoteProposalTag[]): void {
    containerEl.createEl("h4", { text: "Suggested Tags" });
    if (tags.length === 0) {
      containerEl.createEl("p", { text: "No existing vault tags matched this source strongly enough." });
      return;
    }

    const listEl = containerEl.createEl("ul");
    for (const tag of tags) {
      listEl.createEl("li", { text: `${tag.tag} (${formatConfidence(tag.confidence)}) - ${tag.reason}` });
    }
  }

  private renderSuggestedLinks(containerEl: HTMLElement, links: SourceNoteProposalLink[]): void {
    containerEl.createEl("h4", { text: "Suggested Links" });
    if (links.length === 0) {
      containerEl.createEl("p", { text: "No existing notes matched source terms strongly enough for link suggestions." });
      return;
    }

    const listEl = containerEl.createEl("ul");
    for (const link of links) {
      listEl.createEl("li", { text: `${link.linkText} -> ${link.notePath} (${formatConfidence(link.confidence)}) - ${link.reason}` });
    }
  }

  private renderRelatedNotes(containerEl: HTMLElement, relatedNotes: SourceNoteProposalRelatedNote[]): void {
    containerEl.createEl("h4", { text: "Related Notes" });
    if (relatedNotes.length === 0) {
      containerEl.createEl("p", { text: "No related notes found from the current vault mirror." });
      return;
    }

    const listEl = containerEl.createEl("ul");
    for (const note of relatedNotes) {
      listEl.createEl("li", { text: `${note.title} (${note.notePath}, ${formatConfidence(note.confidence)}) - ${note.reason}` });
    }
  }

  private renderOutline(containerEl: HTMLElement, headings: SourceNoteProposalHeading[]): void {
    containerEl.createEl("h4", { text: "Suggested Outline" });
    if (headings.length === 0) {
      containerEl.createEl("p", { text: "No source sections were available for an outline." });
      return;
    }

    const listEl = containerEl.createEl("ul");
    for (const heading of headings) {
      listEl.createEl("li", { text: `${heading.heading} (${heading.sourceSectionPath.join(" > ")})` });
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

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
