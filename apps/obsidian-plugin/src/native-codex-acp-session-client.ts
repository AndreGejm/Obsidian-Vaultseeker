import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as acp from "@agentclientprotocol/sdk";
import type {
  CodexAcpSendPromptInput,
  CodexAcpSessionClient,
  CodexAcpSessionHandle,
  CodexAcpSessionUpdateListener,
  CodexAcpSessionUnsubscribe,
  CodexAcpTurnResult
} from "./codex-acp-session-controller";
import type { CodexAcpSessionUpdate } from "./codex-acp-session-update-normalizer";
import type { NativeCodexProcessSettings } from "./codex-process-manager";
import type { CodexRuntimeState } from "./codex-runtime-state";

export type NativeCodexAcpConnection = {
  initialize(input: unknown): Promise<unknown>;
  newSession(input: { cwd: string; mcpServers: unknown[] }): Promise<{ sessionId: string }>;
  prompt(input: { sessionId: string; prompt: Array<{ type: "text"; text: string }> }): Promise<{ stopReason?: string }>;
};

export type NativeCodexAcpClientHandler = {
  sessionUpdate(input: NativeCodexAcpSessionNotification): Promise<void> | void;
  requestPermission(input: unknown): Promise<{ outcome: { outcome: "cancelled" } }>;
  readTextFile(input: unknown): Promise<never>;
  writeTextFile(input: unknown): Promise<never>;
  createTerminal(input: unknown): Promise<never>;
  extNotification(method: string, params: Record<string, unknown>): Promise<void>;
};

export type NativeCodexAcpConnectionFactoryOptions = {
  command: string;
  cwd: string;
  handler: NativeCodexAcpClientHandler;
};

export type NativeCodexAcpConnectionFactory = (
  options: NativeCodexAcpConnectionFactoryOptions
) => Promise<NativeCodexAcpConnection>;

export type NativeCodexAcpSessionClientOptions = {
  getSettings: () => NativeCodexProcessSettings;
  getVaultBasePath: () => string | null;
  createConnection?: NativeCodexAcpConnectionFactory;
};

type NativeCodexAcpSessionNotification = {
  sessionId: string;
  update: Record<string, unknown> & { sessionUpdate?: string; content?: unknown };
};

const DISABLED_STATE: CodexRuntimeState = {
  status: "disabled",
  message: "Native Codex chat is disabled in Vaultseer settings.",
  processId: null
};

const STOPPED_STATE: CodexRuntimeState = {
  status: "stopped",
  message: "Codex is stopped.",
  processId: null
};

const STARTING_STATE: CodexRuntimeState = {
  status: "starting",
  message: "Starting Codex.",
  processId: null
};

const RUNNING_STATE: CodexRuntimeState = {
  status: "running",
  message: "Codex is running.",
  processId: null
};

export class NativeCodexAcpSessionClient implements CodexAcpSessionClient {
  private connection: NativeCodexAcpConnection | null = null;
  private session: CodexAcpSessionHandle | null = null;
  private sessionPromise: Promise<CodexAcpSessionHandle> | null = null;
  private state: CodexRuntimeState = STOPPED_STATE;
  private readonly listenersBySessionId = new Map<string, Set<CodexAcpSessionUpdateListener>>();

  constructor(private readonly options: NativeCodexAcpSessionClientOptions) {}

  get settings(): NativeCodexProcessSettings {
    const settings = this.options.getSettings();
    return {
      nativeCodexEnabled: settings.nativeCodexEnabled,
      codexCommand: settings.codexCommand,
      codexWorkingDirectory: settings.codexWorkingDirectory
    };
  }

  getState(): CodexRuntimeState {
    return this.state;
  }

  async ensureSession(): Promise<CodexAcpSessionHandle> {
    if (this.session !== null) {
      return this.session;
    }

    if (this.sessionPromise !== null) {
      return this.sessionPromise;
    }

    const settings = this.options.getSettings();
    if (!settings.nativeCodexEnabled) {
      this.state = DISABLED_STATE;
      throw new Error(DISABLED_STATE.message);
    }

    this.state = STARTING_STATE;
    this.sessionPromise = this.startSession(settings);

    try {
      this.session = await this.sessionPromise;
      this.state = RUNNING_STATE;
      return this.session;
    } catch (error) {
      this.connection = null;
      this.session = null;
      this.state = {
        status: "failed",
        message: getErrorMessage(error),
        processId: null
      };
      throw error;
    } finally {
      this.sessionPromise = null;
    }
  }

  subscribeToSessionUpdates(
    sessionId: string,
    listener: CodexAcpSessionUpdateListener
  ): CodexAcpSessionUnsubscribe {
    let listeners = this.listenersBySessionId.get(sessionId);
    if (listeners === undefined) {
      listeners = new Set();
      this.listenersBySessionId.set(sessionId, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.listenersBySessionId.delete(sessionId);
      }
    };
  }

  async sendPrompt(input: CodexAcpSendPromptInput): Promise<CodexAcpTurnResult> {
    const session = await this.ensureSession();
    const connection = this.connection;
    if (connection === null || input.sessionId !== session.sessionId) {
      throw new Error("Codex ACP session is not initialized.");
    }

    const result = await connection.prompt({
      sessionId: input.sessionId,
      prompt: [{ type: "text", text: input.prompt }]
    });

    return {
      status: "completed",
      ...(result.stopReason === undefined ? {} : { stopReason: result.stopReason })
    };
  }

  private async startSession(settings: NativeCodexProcessSettings): Promise<CodexAcpSessionHandle> {
    const cwd = resolveWorkingDirectory(settings.codexWorkingDirectory, this.options.getVaultBasePath());
    const handler = createDenyByDefaultClientHandler((update) => this.forwardSessionUpdate(update));
    const createConnection = this.options.createConnection ?? createNativeCodexAcpConnection;
    const connection = await createConnection({
      command: settings.codexCommand,
      cwd,
      handler
    });

    this.connection = connection;
    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false
        }
      },
      clientInfo: {
        name: "vaultseer-studio",
        title: "Vaultseer Studio",
        version: "0.0.0"
      }
    });
    const session = await connection.newSession({
      cwd,
      mcpServers: []
    });
    return { sessionId: session.sessionId };
  }

  private forwardSessionUpdate(update: CodexAcpSessionUpdate): void {
    const listeners =
      typeof update.sessionId === "string" ? this.listenersBySessionId.get(update.sessionId) : undefined;
    if (listeners === undefined) {
      return;
    }

    for (const listener of listeners) {
      listener(update);
    }
  }
}

export async function createNativeCodexAcpConnection(
  options: NativeCodexAcpConnectionFactoryOptions
): Promise<NativeCodexAcpConnection> {
  const child = spawn(options.command, {
    cwd: options.cwd,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stream = acp.ndJsonStream(createWritableProcessStream(child), createReadableProcessStream(child));
  return new acp.ClientSideConnection(() => options.handler as unknown as acp.Client, stream);
}

function createDenyByDefaultClientHandler(
  emitSessionUpdate: (update: CodexAcpSessionUpdate) => void
): NativeCodexAcpClientHandler {
  return {
    sessionUpdate(input) {
      emitSessionUpdate(normalizeNativeSessionNotification(input));
    },
    async requestPermission() {
      return { outcome: { outcome: "cancelled" } };
    },
    async readTextFile() {
      throw new Error("Client file reads are disabled for Vaultseer Codex ACP.");
    },
    async writeTextFile() {
      throw new Error("Client file writes are disabled for Vaultseer Codex ACP.");
    },
    async createTerminal() {
      throw new Error("Client terminal access is disabled for Vaultseer Codex ACP.");
    },
    async extNotification() {
      return undefined;
    }
  };
}

function normalizeNativeSessionNotification(input: NativeCodexAcpSessionNotification): CodexAcpSessionUpdate {
  const updateType = input.update.sessionUpdate;
  const { sessionUpdate: _sessionUpdate, ...update } = input.update;
  const base = {
    ...update,
    sessionId: input.sessionId
  };

  if (
    (updateType === "agent_message_chunk" ||
      updateType === "agent_thought_chunk" ||
      updateType === "user_message_chunk") &&
    isTextContent(input.update.content)
  ) {
    return {
      ...base,
      type: updateType,
      text: input.update.content.text
    };
  }

  if (typeof updateType === "string") {
    return {
      ...base,
      type: updateType
    } as CodexAcpSessionUpdate;
  }

  return base as CodexAcpSessionUpdate;
}

function resolveWorkingDirectory(configuredWorkingDirectory: string, vaultBasePath: string | null): string {
  const trimmed = configuredWorkingDirectory.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  if (vaultBasePath !== null && vaultBasePath.trim().length > 0) {
    return vaultBasePath;
  }

  throw new Error("Native Codex working directory is not configured and this vault has no local base path.");
}

function createWritableProcessStream(child: ChildProcessWithoutNullStreams): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      child.stdin.write(chunk);
    },
    close() {
      child.stdin.end();
    }
  });
}

function createReadableProcessStream(child: ChildProcessWithoutNullStreams): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on("data", (chunk: Uint8Array) => {
        controller.enqueue(chunk);
      });
      child.stdout.on("end", () => {
        controller.close();
      });
      child.stdout.on("error", (error) => {
        controller.error(error);
      });
    }
  });
}

function isTextContent(value: unknown): value is { type: "text"; text: string } {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Codex ACP session failed.";
}
