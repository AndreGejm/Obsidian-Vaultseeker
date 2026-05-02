import { describe, expect, it } from "vitest";
import { CodexProcessManager } from "../src/codex-process-manager";

describe("CodexProcessManager", () => {
  it("reports stopped when disabled", async () => {
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: false,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => ({ processId: 123 }),
      stop: async () => undefined
    });

    const result = await manager.start();

    expect(result.status).toBe("disabled");
  });

  it("moves to running when launch succeeds", async () => {
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => ({ processId: 123 }),
      stop: async () => undefined
    });

    const result = await manager.start();

    expect(result.status).toBe("running");
    expect(result.processId).toBe(123);
  });
});
