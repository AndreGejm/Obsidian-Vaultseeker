import type { WriteReviewQueueApplyState } from "./write-review-queue-state";

export function getWriteReviewQueueApplyButtonLabel(item: { applyState: WriteReviewQueueApplyState }): string {
  return item.applyState === "applied" ? "Written" : "Write to note";
}

export function getWriteReviewQueueSummaryHelpText(): string {
  return "Write to note applies the proposal after re-checking the target note. Edit draft updates the proposed Markdown before writing.";
}
