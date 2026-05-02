import { describe, expect, it } from "vitest";
import { buildStudioState } from "../src/studio/studio-state";

describe("buildStudioState", () => {
  it("opens current-note first when an active indexed note exists", () => {
    const state = buildStudioState({
      requestedMode: null,
      activePath: "Notes/VHDL.md",
      indexedNotePaths: ["Notes/VHDL.md"],
      codexRuntimeStatus: "stopped",
      indexStatus: "ready"
    });

    expect(state.activeMode).toBe("note");
    expect(state.currentNoteStatus).toBe("indexed");
    expect(state.availableModes.map((mode) => mode.id)).toEqual([
      "note",
      "chat",
      "search",
      "sources",
      "plans",
      "releases",
      "review"
    ]);
  });

  it("keeps chat visible but degraded when Codex is not running", () => {
    const state = buildStudioState({
      requestedMode: "chat",
      activePath: "Notes/VHDL.md",
      indexedNotePaths: ["Notes/VHDL.md"],
      codexRuntimeStatus: "failed",
      indexStatus: "ready"
    });

    expect(state.activeMode).toBe("chat");
    expect(state.modeSummaries.chat.status).toBe("degraded");
    expect(state.modeSummaries.chat.message).toContain("Codex");
  });

  it("explains each non-running Codex runtime state in chat mode", () => {
    const cases = [
      ["disabled", "Enable native Codex"],
      ["stopped", "Send a message to start Codex"],
      ["starting", "starting"],
      ["stopping", "stopping"],
      ["failed", "failed"]
    ] as const;

    for (const [codexRuntimeStatus, expectedMessage] of cases) {
      const state = buildStudioState({
        requestedMode: "chat",
        activePath: "Notes/VHDL.md",
        indexedNotePaths: ["Notes/VHDL.md"],
        codexRuntimeStatus,
        indexStatus: "ready"
      });

      expect(state.modeSummaries.chat.status).toBe("degraded");
      expect(state.modeSummaries.chat.message).toContain(expectedMessage);
    }
  });

  it("blocks note-specific modes when no note is active", () => {
    const state = buildStudioState({
      requestedMode: null,
      activePath: null,
      indexedNotePaths: ["Notes/VHDL.md"],
      codexRuntimeStatus: "stopped",
      indexStatus: "ready"
    });

    expect(state.currentNoteStatus).toBe("none");
    expect(state.modeSummaries.note.status).toBe("blocked");
  });
});
