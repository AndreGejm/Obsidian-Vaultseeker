import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import type { NativeCodexProcessSettings } from "./codex-process-manager";

export type NativeCodexSetupStatus = "disabled" | "ready" | "blocked";

export type NativeCodexSetupCheckStatus = "pass" | "warning" | "fail";

export type NativeCodexSetupCheck = {
  id: "enabled" | "command" | "working-directory";
  status: NativeCodexSetupCheckStatus;
  label: string;
  detail: string;
};

export type NativeCodexSetupSummary = {
  status: NativeCodexSetupStatus;
  message: string;
  checks: NativeCodexSetupCheck[];
  commandExecutable: string | null;
  workingDirectory: string | null;
};

export type NativeCodexSetupCheckInput = {
  settings: NativeCodexProcessSettings;
  vaultBasePath: string | null;
  commandExists: (commandExecutable: string) => Promise<boolean>;
  pathExists: (folderPath: string) => Promise<boolean>;
};

export async function buildNativeCodexSetupSummary(
  input: NativeCodexSetupCheckInput
): Promise<NativeCodexSetupSummary> {
  if (!input.settings.nativeCodexEnabled) {
    return {
      status: "disabled",
      message: "Native Codex is disabled in Vaultseer settings.",
      checks: [
        {
          id: "enabled",
          status: "warning",
          label: "Native Codex",
          detail: "Disabled in Vaultseer settings."
        }
      ],
      commandExecutable: null,
      workingDirectory: null
    };
  }

  const checks: NativeCodexSetupCheck[] = [
    {
      id: "enabled",
      status: "pass",
      label: "Native Codex",
      detail: "Enabled in Vaultseer settings."
    }
  ];

  const commandExecutable = extractNativeCodexExecutable(input.settings.codexCommand);
  if (commandExecutable === null) {
    checks.push({
      id: "command",
      status: "fail",
      label: "Codex command",
      detail: "No command is configured."
    });
  } else {
    const exists = await input.commandExists(commandExecutable).catch(() => false);
    checks.push({
      id: "command",
      status: exists ? "pass" : "fail",
      label: "Codex command",
      detail: exists ? `Found ${commandExecutable}.` : `Could not find ${commandExecutable}.`
    });
  }

  const workingDirectory = resolveNativeCodexWorkingDirectory(input.settings.codexWorkingDirectory, input.vaultBasePath);
  if (workingDirectory === null) {
    checks.push({
      id: "working-directory",
      status: "fail",
      label: "Working folder",
      detail: "No working folder is configured and this vault has no local folder fallback."
    });
  } else {
    const exists = await input.pathExists(workingDirectory).catch(() => false);
    checks.push({
      id: "working-directory",
      status: exists ? "pass" : "fail",
      label: "Working folder",
      detail: exists ? `Using ${workingDirectory}.` : `Could not find ${workingDirectory}.`
    });
  }

  const firstFailure = checks.find((check) => check.status === "fail");
  if (firstFailure !== undefined) {
    return {
      status: "blocked",
      message: `Native Codex setup is blocked at ${firstFailure.label.toLowerCase()}: ${firstFailure.detail}`,
      checks,
      commandExecutable,
      workingDirectory
    };
  }

  return {
    status: "ready",
    message: "Native Codex setup is ready.",
    checks,
    commandExecutable,
    workingDirectory
  };
}

export function formatNativeCodexSetupNotice(summary: NativeCodexSetupSummary): string {
  if (summary.status === "ready") {
    return `Vaultseer native Codex is ready: ${summary.commandExecutable} in ${summary.workingDirectory}.`;
  }

  if (summary.status === "disabled") {
    return "Vaultseer native Codex is disabled. Enable it in settings before using Studio chat.";
  }

  return `Vaultseer native Codex setup needs attention: ${summary.message.replace(/^Native Codex setup is blocked at /, "")}`;
}

export function extractNativeCodexExecutable(command: string): string | null {
  const trimmed = command.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith('"')) {
    const closingQuote = trimmed.indexOf('"', 1);
    if (closingQuote > 1) {
      return trimmed.slice(1, closingQuote);
    }
  }

  return trimmed.split(/\s+/)[0] ?? null;
}

export async function nativeCodexCommandExists(commandExecutable: string): Promise<boolean> {
  if (hasPathSeparator(commandExecutable)) {
    return nativeCodexFileExists(commandExecutable);
  }

  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";
  return new Promise((resolve) => {
    execFile(lookupCommand, [commandExecutable], { windowsHide: true }, (error) => {
      resolve(error === null);
    });
  });
}

async function nativeCodexFileExists(filePath: string): Promise<boolean> {
  try {
    const entry = await stat(filePath);
    return entry.isFile();
  } catch {
    return false;
  }
}

export async function nativeCodexPathExists(folderPath: string): Promise<boolean> {
  try {
    const entry = await stat(folderPath);
    return entry.isDirectory();
  } catch {
    return false;
  }
}

function resolveNativeCodexWorkingDirectory(configuredWorkingDirectory: string, vaultBasePath: string | null): string | null {
  const configured = configuredWorkingDirectory.trim();
  if (configured.length > 0) return configured;

  const fallback = vaultBasePath?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
}

function hasPathSeparator(value: string): boolean {
  return value.includes("\\") || value.includes("/");
}
