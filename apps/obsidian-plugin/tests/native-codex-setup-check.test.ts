import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildNativeCodexSetupSummary,
  extractNativeCodexExecutable,
  formatNativeCodexSetupNotice,
  nativeCodexCommandExists,
  type NativeCodexSetupCheckInput
} from "../src/native-codex-setup-check";
import type { NativeCodexProcessSettings } from "../src/codex-process-manager";

describe("native Codex setup check", () => {
  it("reports disabled native Codex without requiring command or folder checks", async () => {
    const summary = await buildNativeCodexSetupSummary(
      input({
        nativeCodexEnabled: false,
        commandExists: async () => {
          throw new Error("command check should not run");
        },
        pathExists: async () => {
          throw new Error("path check should not run");
        }
      })
    );

    expect(summary.status).toBe("disabled");
    expect(summary.message).toContain("disabled");
    expect(summary.checks).toEqual([
      {
        id: "enabled",
        status: "warning",
        label: "Native Codex",
        detail: "Disabled in Vaultseer settings."
      }
    ]);
  });

  it("passes when enabled, the command is available, and the vault folder is used as cwd fallback", async () => {
    const summary = await buildNativeCodexSetupSummary(
      input({
        codexWorkingDirectory: "   ",
        vaultBasePath: "F:\\Dev\\Obsidian",
        commandExists: async (command) => command === "codex-acp",
        pathExists: async (folder) => folder === "F:\\Dev\\Obsidian"
      })
    );

    expect(summary.status).toBe("ready");
    expect(summary.commandExecutable).toBe("codex-acp");
    expect(summary.workingDirectory).toBe("F:\\Dev\\Obsidian");
    expect(summary.message).toContain("ready");
  });

  it("blocks startup when enabled but the command cannot be found", async () => {
    const summary = await buildNativeCodexSetupSummary(
      input({
        commandExists: async () => false,
        pathExists: async () => true
      })
    );

    expect(summary.status).toBe("blocked");
    expect(summary.message).toContain("command");
    expect(summary.checks).toContainEqual({
      id: "command",
      status: "fail",
      label: "Codex command",
      detail: "Could not find codex-acp."
    });
  });

  it("blocks startup when no working directory can be resolved", async () => {
    const summary = await buildNativeCodexSetupSummary(
      input({
        codexWorkingDirectory: "",
        vaultBasePath: null,
        commandExists: async () => true,
        pathExists: async () => {
          throw new Error("path check should not run");
        }
      })
    );

    expect(summary.status).toBe("blocked");
    expect(summary.message).toContain("working folder");
    expect(summary.workingDirectory).toBeNull();
  });

  it("blocks startup when the working directory path exists but is not a folder", async () => {
    const summary = await buildNativeCodexSetupSummary(
      input({
        codexWorkingDirectory: "F:\\Dev\\Obsidian\\README.md",
        commandExists: async () => true,
        pathExists: async () => false
      })
    );

    expect(summary.status).toBe("blocked");
    expect(summary.message).toContain("working folder");
    expect(summary.checks).toContainEqual({
      id: "working-directory",
      status: "fail",
      label: "Working folder",
      detail: "Could not find F:\\Dev\\Obsidian\\README.md."
    });
  });

  it("extracts executable names from simple and quoted commands", () => {
    expect(extractNativeCodexExecutable("codex-acp")).toBe("codex-acp");
    expect(extractNativeCodexExecutable("codex-acp --model gpt-5.4")).toBe("codex-acp");
    expect(extractNativeCodexExecutable('"C:\\Users\\vikel\\AppData\\Roaming\\npm\\codex-acp.cmd" --flag')).toBe(
      "C:\\Users\\vikel\\AppData\\Roaming\\npm\\codex-acp.cmd"
    );
    expect(extractNativeCodexExecutable("   ")).toBeNull();
  });

  it("formats a compact operator notice", async () => {
    const summary = await buildNativeCodexSetupSummary(
      input({
        commandExists: async () => true,
        pathExists: async () => true
      })
    );

    expect(formatNativeCodexSetupNotice(summary)).toBe("Vaultseer native Codex is ready: codex-acp in F:\\Configured.");
  });

  it("accepts an absolute executable file path as a command", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "vaultseer-codex-command-"));
    const commandPath = path.join(tempDir, "codex-acp.cmd");
    await writeFile(commandPath, "@echo off\r\n", "utf8");

    try {
      await expect(nativeCodexCommandExists(commandPath)).resolves.toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function input(
  overrides: Partial<Omit<NativeCodexSetupCheckInput, "settings"> & NativeCodexProcessSettings> = {}
): NativeCodexSetupCheckInput {
  const {
    nativeCodexEnabled,
    codexCommand,
    codexWorkingDirectory,
    vaultBasePath,
    commandExists,
    pathExists
  } = overrides;

  return {
    settings: {
      nativeCodexEnabled: nativeCodexEnabled ?? true,
      codexCommand: codexCommand ?? "codex-acp",
      codexWorkingDirectory: codexWorkingDirectory ?? "F:\\Configured"
    },
    vaultBasePath: "vaultBasePath" in overrides ? vaultBasePath ?? null : "F:\\Vault",
    commandExists: commandExists ?? (async () => true),
    pathExists: pathExists ?? (async () => true)
  };
}
