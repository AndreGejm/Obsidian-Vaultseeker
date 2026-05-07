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
    expect(state.activeNoteIndexed).toBe(true);
    expect(state.activeMode).toBe("chat");
    expect(state.modes).toHaveLength(7);
  });

  it("exposes unindexed active notes without relying on display labels", () => {
    const state = buildPluginStudioState({
      requestedMode: null,
      activePath: "Inbox/New note.md",
      notes: [{ path: "Notes/VHDL.md", title: "VHDL", aliases: [], tags: [] }],
      indexStatus: "ready",
      codexRuntimeStatus: "running"
    });

    expect(state.activeNoteLabel).toBe("Active note not indexed");
    expect(state.activeNotePath).toBe("Inbox/New note.md");
    expect(state.activeNoteIndexed).toBe(false);
    expect(state.activeMode).toBe("chat");
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
    expect(state.activeNoteIndexed).toBe(false);
    expect(state.modes.find((mode) => mode.id === "note")).toMatchObject({
      status: "blocked",
      selected: false
    });
    expect(state.modes.find((mode) => mode.id === "chat")).toMatchObject({
      selected: true
    });
    expect(state.modes.find((mode) => mode.id === "chat")?.status).toBe("degraded");
  });
});
