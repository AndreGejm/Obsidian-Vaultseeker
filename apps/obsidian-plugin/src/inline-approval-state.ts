import type { VaultWriteOperationType } from "@vaultseer/core";

export type InlineApprovalSurface = "inline" | "review_queue";

export type BuildInlineApprovalStateInput = {
  operationType: VaultWriteOperationType;
  targetPath: string;
  activePath: string | null;
  touchesMultipleFiles: boolean;
};

export type InlineApprovalState = {
  surface: InlineApprovalSurface;
  message: string;
};

export function buildInlineApprovalState(input: BuildInlineApprovalStateInput): InlineApprovalState {
  if (
    input.targetPath !== input.activePath ||
    input.touchesMultipleFiles ||
    input.operationType !== "update_note_tags"
  ) {
    return {
      surface: "review_queue",
      message: "This change belongs in the guarded review queue."
    };
  }

  return {
    surface: "inline",
    message: "This current note change can be reviewed inline."
  };
}
