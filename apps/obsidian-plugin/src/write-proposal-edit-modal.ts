import { App, Modal, Notice } from "obsidian";

export type VaultseerWriteProposalEditModalInput = {
  targetPath: string;
  initialContent: string;
  onSave: (editedContent: string) => Promise<void>;
};

export class VaultseerWriteProposalEditModal extends Modal {
  constructor(
    app: App,
    private readonly input: VaultseerWriteProposalEditModalInput
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vaultseer-write-proposal-edit-modal");
    contentEl.createEl("h2", { text: "Edit Proposal" });
    contentEl.createEl("p", { text: `Target note: ${this.input.targetPath}` });

    const textarea = contentEl.createEl("textarea", {
      cls: "vaultseer-write-proposal-edit-textarea"
    });
    textarea.value = this.input.initialContent;
    textarea.rows = 24;

    const actionsEl = contentEl.createEl("div", { cls: "vaultseer-write-proposal-edit-actions" });
    const saveButton = actionsEl.createEl("button", { text: "Save proposal edit" });
    saveButton.addEventListener("click", () => {
      void this.save(textarea.value);
    });

    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());

    textarea.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(editedContent: string): Promise<void> {
    try {
      await this.input.onSave(editedContent);
      this.close();
    } catch (error) {
      new Notice(`Vaultseer could not update the proposal: ${getErrorMessage(error)}`);
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
