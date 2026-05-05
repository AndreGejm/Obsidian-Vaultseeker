import { describe, expect, it } from "vitest";
import { buildInlineApprovalState } from "../src/inline-approval-state";

describe("buildInlineApprovalState", () => {
  it("routes current note update_note_tags inline", () => {
    const state = buildInlineApprovalState({
      operationType: "update_note_tags",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: false
    });

    expect(state.surface).toBe("inline");
    expect(state.message).toContain("current note");
  });

  it("routes current note update_note_links inline", () => {
    const state = buildInlineApprovalState({
      operationType: "update_note_links",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: false
    });

    expect(state.surface).toBe("inline");
    expect(state.message).toContain("current note");
  });

  it("routes current note rewrite_note_content inline", () => {
    const state = buildInlineApprovalState({
      operationType: "rewrite_note_content",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: false
    });

    expect(state.surface).toBe("inline");
    expect(state.message).toContain("current note");
  });

  it("routes multi-file updates to the review queue", () => {
    const state = buildInlineApprovalState({
      operationType: "update_note_links",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: true
    });

    expect(state.surface).toBe("review_queue");
  });

  it("routes different active notes to the review queue", () => {
    const state = buildInlineApprovalState({
      operationType: "update_note_tags",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/Timing.md",
      touchesMultipleFiles: false
    });

    expect(state.surface).toBe("review_queue");
  });

  it("routes create_note_from_source to the review queue even when target matches the active note", () => {
    const state = buildInlineApprovalState({
      operationType: "create_note_from_source",
      targetPath: "Notes/VHDL.md",
      activePath: "Notes/VHDL.md",
      touchesMultipleFiles: false
    });

    expect(state.surface).toBe("review_queue");
  });
});
