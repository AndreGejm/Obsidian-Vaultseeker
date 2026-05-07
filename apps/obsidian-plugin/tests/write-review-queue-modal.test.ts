import { describe, expect, it } from "vitest";
import {
  getWriteReviewQueueApplyButtonLabel,
  getWriteReviewQueueSummaryHelpText
} from "../src/write-review-queue-copy";

describe("write review queue modal copy", () => {
  it("uses active-note write wording for pending apply actions", () => {
    expect(getWriteReviewQueueApplyButtonLabel({ applyState: "not_applied" })).toBe("Write to note");
    expect(getWriteReviewQueueApplyButtonLabel({ applyState: "failed" })).toBe("Write to note");
    expect(getWriteReviewQueueApplyButtonLabel({ applyState: "applied" })).toBe("Written");
  });

  it("describes writing and draft editing without accept/review jargon", () => {
    expect(getWriteReviewQueueSummaryHelpText()).toBe(
      "Write to note applies the proposal after re-checking the target note. Edit draft updates the proposed Markdown before writing."
    );
  });
});
