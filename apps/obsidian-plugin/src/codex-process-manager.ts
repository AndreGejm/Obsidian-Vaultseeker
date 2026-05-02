import type { CodexRuntimeState } from "./codex-runtime-state";
import { canStartCodexRuntime, transitionCodexRuntime } from "./codex-runtime-state";

export type NativeCodexProcessSettings = {
  nativeCodexEnabled: boolean;
  codexCommand: string;
  codexWorkingDirectory: string;
};

export type CodexLaunchResult = {
  processId: number | null;
};

export type CodexProcessLauncher = {
  getSettings(): NativeCodexProcessSettings;
  launch(settings: NativeCodexProcessSettings): Promise<CodexLaunchResult>;
  stop(processId: number | null): Promise<void>;
};

export class CodexProcessManager {
  private state: CodexRuntimeState = { status: "stopped", message: "Codex is stopped.", processId: null };

  constructor(private readonly launcher: CodexProcessLauncher) {}

  getState(): CodexRuntimeState {
    return this.state;
  }

  async start(): Promise<CodexRuntimeState> {
    const settings = this.launcher.getSettings();
    if (!settings.nativeCodexEnabled) {
      this.state = { status: "disabled", message: "Native Codex chat is disabled in Vaultseer settings.", processId: null };
      return this.state;
    }

    if (!canStartCodexRuntime({ status: this.state.status, configured: true }) || this.state.processId !== null) {
      return this.state;
    }

    this.state = transitionCodexRuntime(this.state, { type: "start_requested" });
    try {
      const result = await this.launcher.launch(settings);
      this.state = transitionCodexRuntime(this.state, { type: "started", processId: result.processId });
    } catch (error) {
      this.state = transitionCodexRuntime(this.state, {
        type: "launch_failed",
        message: error instanceof Error ? error.message : "Codex launch failed."
      });
    }
    return this.state;
  }

  async stop(): Promise<CodexRuntimeState> {
    const previousState = this.state;
    this.state = transitionCodexRuntime(this.state, { type: "stop_requested" });
    try {
      await this.launcher.stop(this.state.processId);
      this.state = transitionCodexRuntime(this.state, { type: "stopped" });
    } catch (error) {
      this.state = {
        status: "failed",
        message: error instanceof Error ? error.message : "Codex stop failed.",
        processId: previousState.processId
      };
    }
    return this.state;
  }
}
