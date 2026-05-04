import { describe, expect, it } from "vitest";
import { buildStudioModeDashboard } from "../src/studio-mode-dashboard";

describe("buildStudioModeDashboard", () => {
  it("offers concrete note-first actions for note mode", () => {
    const dashboard = buildStudioModeDashboard({
      mode: "note",
      activeNotePath: "Notes/VHDL.md",
      pendingWriteCount: 2
    });

    expect(dashboard.summary).toBe("Work from the active note first, then branch into search, review, and guarded changes.");
    expect(dashboard.cards.map((card) => [card.title, card.commandId, card.modeId])).toEqual([
      ["Open workbench", "open-workbench", undefined],
      ["Review pending changes", "open-write-review-queue", undefined],
      ["Search related notes", "search-index", undefined]
    ]);
  });

  it("turns empty Studio modes into actionable dashboards", () => {
    const search = buildStudioModeDashboard({
      mode: "search",
      activeNotePath: "Notes/VHDL.md",
      pendingWriteCount: 0
    });
    const sources = buildStudioModeDashboard({
      mode: "sources",
      activeNotePath: "Notes/VHDL.md",
      pendingWriteCount: 0
    });

    expect(search.cards.map((card) => card.commandId)).toEqual([
      "search-index",
      "search-source-workspaces",
      "rebuild-index"
    ]);
    expect(sources.cards.map((card) => card.commandId)).toEqual([
      "choose-text-source-file",
      "plan-source-extraction-queue",
      "search-source-workspaces",
      "plan-source-semantic-index"
    ]);
  });

  it("routes plan and release drafting through chat until dedicated write flows exist", () => {
    expect(
      buildStudioModeDashboard({
        mode: "plans",
        activeNotePath: "Notes/VHDL.md",
        pendingWriteCount: 0
      }).cards
    ).toEqual([
      {
        id: "chat-plan",
        title: "Plan with Vaultseer chat",
        description: "Use the active note and Vaultseer search context to draft a plan before saving anything.",
        buttonLabel: "Open Chat",
        modeId: "chat",
        tone: "primary"
      }
    ]);

    expect(
      buildStudioModeDashboard({
        mode: "releases",
        activeNotePath: "Notes/VHDL.md",
        pendingWriteCount: 0
      }).cards[0]?.modeId
    ).toBe("chat");
  });
});
