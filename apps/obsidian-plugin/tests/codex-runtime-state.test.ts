import { describe, expect, it } from "vitest";
import { canStartCodexRuntime, formatCodexRuntimeFailure, transitionCodexRuntime } from "../src/codex-runtime-state";

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

  it("labels OpenAI quota failures as provider quota issues", () => {
    expect(formatCodexRuntimeFailure("OpenAI Responses API request failed with status 429")).toBe(
      "OpenAI quota or billing is not available."
    );
    expect(formatCodexRuntimeFailure("insufficient_quota")).toBe("OpenAI quota or billing is not available.");
  });

  it("labels native bridge timeouts as bridge startup timeouts", () => {
    expect(formatCodexRuntimeFailure("Native Codex startup timed out after 120000ms.")).toBe(
      "Native Codex bridge timed out while starting."
    );
  });
});
