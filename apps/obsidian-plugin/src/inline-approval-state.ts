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
    !canReviewInline(input.operationType)
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

function canReviewInline(operationType: VaultWriteOperationType): boolean {
  switch (operationType) {
    case "update_note_tags":
    case "update_note_links":
    case "rewrite_note_content":
      return true;
    case "create_note_from_source":
      return false;
  }
}
