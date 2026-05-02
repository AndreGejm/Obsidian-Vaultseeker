import { describe, expect, it } from "vitest";
import { canStartCodexRuntime, transitionCodexRuntime } from "../src/codex-runtime-state";

describe("codex runtime state", () => {
  it("allows start from stopped when launcher is configured", () => {
    expect(canStartCodexRuntime({ status: "stopped", configured: true })).toBe(true);
  });

  it("does not allow start when disabled or unconfigured", () => {
    expect(canStartCodexRuntime({ status: "disabled", configured: true })).toBe(false);
    expect(canStartCodexRuntime({ status: "stopped", configured: false })).toBe(false);
  });

  it("records failed launch with a user-visible message", () => {
    const state = transitionCodexRuntime(
      { status: "starting", message: "Starting Codex.", processId: null },
      { type: "launch_failed", message: "codex.exe was not found" }
    );

    expect(state.status).toBe("failed");
    expect(state.message).toContain("codex.exe");
  });
});
