import { ItemView, Notice, type App, type WorkspaceLeaf } from "obsidian";
import type { ChunkRecord, IndexHealth, LexicalIndexRecord, NoteRecord, VaultseerStore } from "@vaultseer/core";
import {
  buildWorkbenchState,
  type WorkbenchControl,
  type WorkbenchControlId,
  type WorkbenchLinkSuggestion,
  type WorkbenchQualityIssue,
  type WorkbenchRelatedNote,
  type WorkbenchTagSuggestion,
  type WorkbenchState
} from "./workbench-state";

export const VAULTSEER_WORKBENCH_VIEW_TYPE = "vaultseer-workbench";

type WorkbenchMirrorData = {
  health: IndexHealth;
  notes: NoteRecord[];
  chunks: ChunkRecord[];
  lexicalIndex: LexicalIndexRecord[];
};

export type WorkbenchControlHandlers = Record<WorkbenchControlId, () => Promise<void>>;

export class VaultseerWorkbenchView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly store: VaultseerStore,
    private readonly getActivePath: () => string | null,
    private readonly openNote: (path: string) => Promise<void>,
    private readonly controlHandlers: WorkbenchControlHandlers
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VAULTSEER_WORKBENCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Vaultseer Workbench";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("file-open", () => void this.refresh()));
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async refresh(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Vaultseer" });
    contentEl.createEl("p", { text: "Loading the indexed mirror..." });

    try {
      const data = await this.loadWorkbenchMirrorData();
      const state = buildWorkbenchState({
        activePath: this.getActivePath(),
        ...data
      });
      this.renderState(state);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer" });
      contentEl.createEl("p", { text: `Could not load workbench data: ${getErrorMessage(error)}` });
      new Notice("Vaultseer could not load workbench data.");
    }
  }

  private async loadWorkbenchMirrorData(): Promise<WorkbenchMirrorData> {
    const [health, notes, chunks, lexicalIndex] = await Promise.all([
      this.store.getHealth(),
      this.store.getNoteRecords(),
      this.store.getChunkRecords(),
      this.store.getLexicalIndexRecords()
    ]);

    return { health, notes, chunks, lexicalIndex };
  }

  private renderState(state: WorkbenchState): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Vaultseer" });
    this.renderControls(contentEl, state.controls);
    contentEl.createEl("p", { text: state.message });
    contentEl.createEl("p", { text: state.healthSummary, cls: "vaultseer-workbench-health" });

    if (state.status === "blocked" || !state.currentNote) return;

    this.renderCurrentNote(contentEl, state);
    this.renderWarnings(contentEl, state.warnings);
    this.renderLinks(contentEl, "Outgoing", state.outgoingLinks.map((link) => ({ path: link.targetPath, text: link.targetPath })));
    this.renderLinks(contentEl, "Backlinks", state.backlinks.map((path) => ({ path, text: path })));
    this.renderTextList(contentEl, "Unresolved", state.unresolvedLinks.map((link) => link.raw));
    this.renderQualityIssues(contentEl, state.qualityIssues);
    this.renderRelatedNotes(contentEl, state.relatedNotes);
    this.renderLinkSuggestions(contentEl, state.linkSuggestions);
    this.renderTagSuggestions(contentEl, state.tagSuggestions);
  }

  private renderControls(containerEl: HTMLElement, controls: WorkbenchControl[]): void {
    const toolbar = containerEl.createDiv({ cls: "vaultseer-workbench-controls" });

    for (const control of controls) {
      const button = toolbar.createEl("button", {
        text: control.label,
        title: control.disabledReason ?? control.description
      });
      button.disabled = control.disabled;
      button.addEventListener("click", async () => {
        await this.runControl(control);
      });
    }
  }

  private async runControl(control: WorkbenchControl): Promise<void> {
    if (control.disabled) return;

    try {
      await this.controlHandlers[control.id]();
    } catch (error) {
      new Notice(`Vaultseer ${control.label.toLowerCase()} failed: ${getErrorMessage(error)}`);
    }
  }

  private renderCurrentNote(containerEl: HTMLElement, state: Extract<WorkbenchState, { status: "ready" }>): void {
    const note = state.currentNote;
    if (!note) return;

    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: note.title });
    section.createEl("div", { text: note.path });
    this.renderTextList(section, "Tags", note.tags);
    this.renderTextList(section, "Aliases", note.aliases);
  }

  private renderWarnings(containerEl: HTMLElement, warnings: string[]): void {
    if (warnings.length === 0) return;
    this.renderTextList(containerEl, "Warnings", warnings);
  }

  private renderLinks(containerEl: HTMLElement, title: string, links: Array<{ path: string; text: string }>): void {
    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: title });

    if (links.length === 0) {
      section.createEl("p", { text: "None" });
      return;
    }

    const list = section.createEl("ul");
    for (const link of links) {
      const item = list.createEl("li");
      const button = item.createEl("button", { text: link.text });
      button.addEventListener("click", async () => {
        await this.openNote(link.path);
      });
    }
  }

  private renderTextList(containerEl: HTMLElement, title: string, values: string[]): void {
    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: title });

    if (values.length === 0) {
      section.createEl("p", { text: "None" });
      return;
    }

    const list = section.createEl("ul");
    for (const value of values) {
      list.createEl("li", { text: value });
    }
  }

  private renderRelatedNotes(containerEl: HTMLElement, relatedNotes: WorkbenchRelatedNote[]): void {
    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: "Related" });

    if (relatedNotes.length === 0) {
      section.createEl("p", { text: "None" });
      return;
    }

    const list = section.createEl("ul");
    for (const related of relatedNotes) {
      const item = list.createEl("li");
      const button = item.createEl("button", { text: related.title });
      button.addEventListener("click", async () => {
        await this.openNote(related.notePath);
      });
      item.createEl("div", { text: related.reason, cls: "vaultseer-workbench-related-reason" });
    }
  }

  private renderQualityIssues(containerEl: HTMLElement, qualityIssues: WorkbenchQualityIssue[]): void {
    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: "Sanity checks" });

    if (qualityIssues.length === 0) {
      section.createEl("p", { text: "None" });
      return;
    }

    const list = section.createEl("ul");
    for (const issue of qualityIssues) {
      const item = list.createEl("li");
      item.createEl("strong", { text: issue.severity });
      item.createSpan({ text: ` ${issue.message}` });
    }
  }

  private renderTagSuggestions(containerEl: HTMLElement, tagSuggestions: WorkbenchTagSuggestion[]): void {
    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: "Suggested tags" });

    if (tagSuggestions.length === 0) {
      section.createEl("p", { text: "None" });
      return;
    }

    const list = section.createEl("ul");
    for (const suggestion of tagSuggestions) {
      const item = list.createEl("li");
      item.createEl("strong", { text: suggestion.tag });
      item.createEl("div", {
        text: `${suggestion.reason} Confidence ${Math.round(suggestion.confidence * 100)}%.`,
        cls: "vaultseer-workbench-related-reason"
      });
    }
  }

  private renderLinkSuggestions(containerEl: HTMLElement, linkSuggestions: WorkbenchLinkSuggestion[]): void {
    const section = containerEl.createDiv({ cls: "vaultseer-workbench-section" });
    section.createEl("h3", { text: "Suggested links" });

    if (linkSuggestions.length === 0) {
      section.createEl("p", { text: "None" });
      return;
    }

    const list = section.createEl("ul");
    for (const suggestion of linkSuggestions) {
      const item = list.createEl("li");
      const button = item.createEl("button", {
        text: `${suggestion.unresolvedTarget} -> ${suggestion.suggestedTitle}`
      });
      button.addEventListener("click", async () => {
        await this.openNote(suggestion.suggestedPath);
      });
      item.createEl("div", {
        text: `${suggestion.reason} Confidence ${Math.round(suggestion.confidence * 100)}%.`,
        cls: "vaultseer-workbench-related-reason"
      });
    }
  }
}

export async function activateVaultseerWorkbench(app: App): Promise<WorkspaceLeaf | null> {
  const existingLeaf = app.workspace.getLeavesOfType(VAULTSEER_WORKBENCH_VIEW_TYPE)[0];
  const leaf = existingLeaf ?? app.workspace.getRightLeaf(false);
  if (!leaf) return null;

  await leaf.setViewState({ type: VAULTSEER_WORKBENCH_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
  return leaf;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
