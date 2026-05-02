import { describe, expect, it } from "vitest";
import { buildPluginStudioState } from "../src/studio-state";

describe("buildPluginStudioState", () => {
  it("summarizes active note and mode labels for the view", () => {
    const state = buildPluginStudioState({
      requestedMode: null,
      activePath: "Notes/VHDL.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      indexStatus: "ready",
      codexRuntimeStatus: "stopped"
    });

    expect(state.title).toBe("Vaultseer Studio");
    expect(state.activeNoteLabel).toBe("VHDL");
    expect(state.activeMode).toBe("note");
    expect(state.modes).toHaveLength(7);
  });
});
