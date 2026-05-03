import { describe, expect, it } from "vitest";
import {
  getVaultseerQuickCommands,
  groupVaultseerStudioCommands,
  VAULTSEER_STUDIO_COMMAND_DEFINITIONS
} from "../src/studio-command-catalog";

describe("VAULTSEER_STUDIO_COMMAND_DEFINITIONS", () => {
  it("exposes the current Vaultseer command surface for Studio chat selection", () => {
    expect(VAULTSEER_STUDIO_COMMAND_DEFINITIONS.map((command) => command.id)).toEqual([
      "rebuild-index",
      "clear-index",
      "show-index-health",
      "search-index",
      "search-source-workspaces",
      "open-write-review-queue",
      "import-active-text-source",
      "choose-text-source-file",
      "plan-source-extraction-queue",
      "show-source-extraction-queue-status",
      "run-source-extraction-batch",
      "recover-source-extraction-queue",
      "cancel-source-extraction-queue",
      "open-workbench",
      "open-studio",
      "check-native-codex-setup",
      "reset-native-codex-session",
      "plan-semantic-index",
      "run-semantic-index-batch",
      "cancel-semantic-index-queue",
      "plan-source-semantic-index",
      "run-source-semantic-index-batch",
      "cancel-source-semantic-index-queue"
    ]);
  });

  it("keeps command ids unique", () => {
    const ids = VAULTSEER_STUDIO_COMMAND_DEFINITIONS.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("groups commands by user workflow for chat help and menus", () => {
    const groups = groupVaultseerStudioCommands(VAULTSEER_STUDIO_COMMAND_DEFINITIONS);

    expect(groups.map((group) => group.label)).toEqual([
      "Notes and search",
      "Sources and extraction",
      "Review and writes",
      "Semantic indexing",
      "Studio and Codex"
    ]);
    expect(groups[0]?.commands.map((command) => command.id)).toEqual([
      "rebuild-index",
      "clear-index",
      "show-index-health",
      "search-index",
      "search-source-workspaces",
      "open-workbench"
    ]);
  });

  it("marks a small current-note-first quick action set", () => {
    expect(getVaultseerQuickCommands(VAULTSEER_STUDIO_COMMAND_DEFINITIONS).map((command) => command.id)).toEqual([
      "rebuild-index",
      "search-index",
      "search-source-workspaces",
      "open-write-review-queue",
      "plan-semantic-index"
    ]);
  });
});
