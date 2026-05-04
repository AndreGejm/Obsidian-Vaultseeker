import { App, SuggestModal } from "obsidian";
import {
  buildChatImageAttachmentItems,
  type ChatImageAttachmentItem
} from "./chat-image-attachment";
import type { VaultAssetRecord } from "./obsidian-adapter";

export class VaultseerChatImageAttachmentModal extends SuggestModal<ChatImageAttachmentItem> {
  private readonly items: ChatImageAttachmentItem[];

  constructor(
    app: App,
    assets: VaultAssetRecord[],
    private readonly onAttach: (asset: VaultAssetRecord) => Promise<void>
  ) {
    super(app);
    this.limit = 50;
    this.emptyStateText = "No supported vault images found.";
    this.setPlaceholder("Choose a vault image to attach to the next Vaultseer message");
    this.items = buildChatImageAttachmentItems(assets);
  }

  getSuggestions(query: string): ChatImageAttachmentItem[] {
    const terms = normalizeQuery(query);
    if (terms.length === 0) return this.items.slice(0, this.limit);

    return this.items
      .filter((item) => {
        const haystack = `${item.filename} ${item.path} ${item.mimeType}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, this.limit);
  }

  renderSuggestion(item: ChatImageAttachmentItem, el: HTMLElement): void {
    el.createEl("div", { text: item.displayName, cls: "vaultseer-image-attachment-title" });
    el.createEl("div", { text: item.path, cls: "vaultseer-image-attachment-path" });
    el.createEl("div", { text: item.detail, cls: "vaultseer-image-attachment-detail" });
  }

  onChooseSuggestion(item: ChatImageAttachmentItem): void {
    void this.onAttach(item.asset);
  }
}

function normalizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}
