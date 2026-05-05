import type { StudioStatusStripItem } from "./studio-status-strip";

export function renderStudioStatusStrip(containerEl: HTMLElement, items: StudioStatusStripItem[]): void {
  const stripEl = containerEl.createDiv({ cls: "vaultseer-studio-status-strip" });

  for (const item of items) {
    const itemEl = stripEl.createDiv({
      cls: `vaultseer-studio-status-item vaultseer-studio-status-${item.tone}`
    });
    itemEl.createEl("span", { text: item.label, cls: "vaultseer-studio-status-label" });
    itemEl.createEl("strong", { text: item.value, cls: "vaultseer-studio-status-value" });
  }
}
