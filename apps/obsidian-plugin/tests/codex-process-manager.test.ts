import { describe, expect, it } from "vitest";
import { CodexProcessManager } from "../src/codex-process-manager";

describe("CodexProcessManager", () => {
  it("reports stopped when disabled", async () => {
    let launchCalls = 0;
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: false,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => {
        launchCalls += 1;
        return { processId: 123 };
      },
      stop: async () => undefined
    });

    const result = await manager.start();

    expect(result.status).toBe("disabled");
    expect(launchCalls).toBe(0);
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

  it("does not launch twice when already running", async () => {
    let launchCalls = 0;
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => {
        launchCalls += 1;
        return { processId: launchCalls };
      },
      stop: async () => undefined
    });

    const first = await manager.start();
    const second = await manager.start();

    expect(launchCalls).toBe(1);
    expect(first.processId).toBe(1);
    expect(second.status).toBe("running");
    expect(second.processId).toBe(1);
  });

  it("passes the running process id when stop succeeds", async () => {
    let stoppedProcessId: number | null | undefined;
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => ({ processId: 123 }),
      stop: async (processId) => {
        stoppedProcessId = processId;
      }
    });

    await manager.start();
    const result = await manager.stop();

    expect(stoppedProcessId).toBe(123);
    expect(result.status).toBe("stopped");
    expect(result.processId).toBeNull();
  });

  it("returns failed and preserves process id when stop fails", async () => {
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => ({ processId: 123 }),
      stop: async () => {
        throw new Error("codex would not exit");
      }
    });

    await manager.start();
    const result = await manager.stop();

    expect(result.status).toBe("failed");
    expect(result.status).not.toBe("stopping");
    expect(result.message).toContain("codex would not exit");
    expect(result.processId).toBe(123);
  });

  it("returns failed with launch message when launch fails", async () => {
    const manager = new CodexProcessManager({
      getSettings: () => ({
        nativeCodexEnabled: true,
        codexCommand: "codex",
        codexWorkingDirectory: "F:\\Dev\\Obsidian"
      }),
      launch: async () => {
        throw new Error("codex was not found");
      },
      stop: async () => undefined
    });

    const result = await manager.start();

    expect(result.status).toBe("failed");
    expect(result.message).toContain("codex was not found");
  });
});
