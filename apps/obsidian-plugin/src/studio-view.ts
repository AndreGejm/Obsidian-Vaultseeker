import { ItemView, Notice, type App, type WorkspaceLeaf } from "obsidian";
import type { CodexRuntimeStatus, IndexHealth, NoteRecord, StudioModeId, VaultseerStore } from "@vaultseer/core";
import { buildPluginStudioState, type PluginStudioState } from "./studio-state";

export const VAULTSEER_STUDIO_VIEW_TYPE = "vaultseer-studio";

export class VaultseerStudioView extends ItemView {
  private activeMode: StudioModeId | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly store: VaultseerStore,
    private readonly getActivePath: () => string | null,
    private readonly getCodexRuntimeStatus: () => CodexRuntimeStatus
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VAULTSEER_STUDIO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Vaultseer Studio";
  }

  getIcon(): string {
    return "compass";
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
    contentEl.createEl("h2", { text: "Vaultseer Studio" });
    contentEl.createEl("p", { text: "Loading Studio..." });

    try {
      const [health, notes] = await Promise.all([this.store.getHealth(), this.store.getNoteRecords()]);
      this.render(health, notes);
    } catch (error) {
      contentEl.empty();
      contentEl.createEl("h2", { text: "Vaultseer Studio" });
      contentEl.createEl("p", { text: `Could not load Studio state: ${getErrorMessage(error)}` });
      new Notice("Vaultseer Studio could not load.");
    }
  }

  private render(health: IndexHealth, notes: NoteRecord[]): void {
    const state = buildPluginStudioState({
      requestedMode: this.activeMode,
      activePath: this.getActivePath(),
      notes,
      indexStatus: health.status,
      codexRuntimeStatus: this.getCodexRuntimeStatus()
    });

    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: state.title });
    contentEl.createEl("p", { text: `Current note: ${state.activeNoteLabel}` });
    this.renderModeButtons(contentEl, state);
    this.renderSelectedMode(contentEl, state);
  }

  private renderModeButtons(containerEl: HTMLElement, state: PluginStudioState): void {
    const nav = containerEl.createDiv({ cls: "vaultseer-studio-nav" });

    for (const mode of state.modes) {
      const button = nav.createEl("button", {
        text: mode.label,
        title: mode.message,
        cls: mode.selected ? "vaultseer-studio-mode-selected" : ""
      });
      button.setAttribute("aria-pressed", String(mode.selected));
      button.addEventListener("click", async () => {
        this.activeMode = mode.id;
        await this.refresh();
      });
    }
  }

  private renderSelectedMode(containerEl: HTMLElement, state: PluginStudioState): void {
    const selectedMode = state.modes.find((mode) => mode.selected) ?? state.modes[0];
    const body = containerEl.createDiv({ cls: "vaultseer-studio-body" });

    body.createEl("h3", { text: selectedMode?.label ?? "Note" });
    body.createEl("p", { text: selectedMode?.message ?? "Mode is ready." });
  }
}

export async function activateVaultseerStudio(app: App): Promise<WorkspaceLeaf | null> {
  const existingLeaf = app.workspace.getLeavesOfType(VAULTSEER_STUDIO_VIEW_TYPE)[0];
  const leaf = existingLeaf ?? app.workspace.getRightLeaf(false);
  if (!leaf) return null;

  await leaf.setViewState({ type: VAULTSEER_STUDIO_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
  return leaf;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
