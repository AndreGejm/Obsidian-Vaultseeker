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

  it("marks note mode blocked when no note is active", () => {
    const state = buildPluginStudioState({
      requestedMode: null,
      activePath: null,
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      indexStatus: "ready",
      codexRuntimeStatus: "stopped"
    });

    expect(state.activeNoteLabel).toBe("No active note");
    expect(state.activeNotePath).toBeNull();
    expect(state.modes.find((mode) => mode.id === "note")).toMatchObject({
      status: "blocked",
      selected: true
    });
    expect(state.modes.find((mode) => mode.id === "chat")?.status).toBe("degraded");
  });
});
