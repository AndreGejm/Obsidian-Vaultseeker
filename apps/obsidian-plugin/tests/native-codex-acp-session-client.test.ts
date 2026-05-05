import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCodexAcpLaunchCommand,
  NativeCodexAcpSessionClient,
  type NativeCodexAcpConnectionFactory
} from "../src/native-codex-acp-session-client";
import type { NativeCodexProcessSettings } from "../src/codex-process-manager";

describe("NativeCodexAcpSessionClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the native Codex process settings used by the client", () => {
    const client = new NativeCodexAcpSessionClient({
      getSettings: () =>
        settings({
          nativeCodexEnabled: false,
          codexCommand: "codex --acp",
          codexWorkingDirectory: "F:\\Workspace",
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        }),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: vi.fn()
    });

    expect(client.settings).toEqual({
      nativeCodexEnabled: false,
      codexCommand: "codex --acp",
      codexWorkingDirectory: "F:\\Workspace",
      codexModel: "gpt-5.4",
      codexReasoningEffort: "medium"
    });
  });

  it("builds a Codex ACP argv launch command with model and reasoning overrides", () => {
    expect(
      buildCodexAcpLaunchCommand(
        settings({
          codexCommand: '"C:\\Program Files\\Codex\\codex-acp.exe" --stdio',
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        })
      )
    ).toEqual({
      command: "C:\\Program Files\\Codex\\codex-acp.exe",
      args: [
        "--stdio",
        "-c",
        'model="gpt-5.4"',
        "-c",
        'model_reasoning_effort="medium"',
        "-c",
        "mcp_servers.mimir.enabled=false",
        "-c",
        "mcp_servers.image-console.enabled=false"
      ]
    });
  });

  it("keeps shell metacharacters as arguments instead of flattening them into a shell command", () => {
    expect(
      buildCodexAcpLaunchCommand(
        settings({
          codexCommand: "codex-acp ; calc",
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        }),
        { platform: "linux" }
      )
    ).toEqual({
      command: "codex-acp",
      args: [
        ";",
        "calc",
        "-c",
        'model="gpt-5.4"',
        "-c",
        'model_reasoning_effort="medium"',
        "-c",
        "mcp_servers.mimir.enabled=false",
        "-c",
        "mcp_servers.image-console.enabled=false"
      ]
    });
  });

  it("disables inherited Codex MCP servers so Vaultseer owns the agent tool surface", () => {
    expect(
      buildCodexAcpLaunchCommand(
        settings({
          codexCommand: "codex-acp",
          codexModel: "gpt-5.3-codex-spark",
          codexReasoningEffort: "low"
        }),
        { platform: "linux" }
      )
    ).toEqual({
      command: "codex-acp",
      args: [
        "-c",
        'model="gpt-5.3-codex-spark"',
        "-c",
        'model_reasoning_effort="low"',
        "-c",
        "mcp_servers.mimir.enabled=false",
        "-c",
        "mcp_servers.image-console.enabled=false"
      ]
    });
  });

  it("resolves the Windows npm codex-acp shim to the platform binary without shell execution", () => {
    const npmBin = "C:\\Users\\dev\\AppData\\Roaming\\npm";
    const binaryPath = `${npmBin}\\node_modules\\@zed-industries\\codex-acp\\node_modules\\@zed-industries\\codex-acp-win32-x64\\bin\\codex-acp.exe`;

    expect(
      buildCodexAcpLaunchCommand(
        settings({
          codexCommand: "codex-acp",
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        }),
        {
          platform: "win32",
          arch: "x64",
          pathEnv: npmBin,
          pathDelimiter: ";",
          fileExists: (path) => path === binaryPath
        }
      )
    ).toEqual({
      command: binaryPath,
      args: [
        "-c",
        'model="gpt-5.4"',
        "-c",
        'model_reasoning_effort="medium"',
        "-c",
        "mcp_servers.mimir.enabled=false",
        "-c",
        "mcp_servers.image-console.enabled=false"
      ]
    });
  });

  it("resolves the Windows npm codex-acp shim from APPDATA when PATH omits the npm bin", () => {
    const appDataPath = "C:\\Users\\dev\\AppData\\Roaming";
    const npmBin = `${appDataPath}\\npm`;
    const binaryPath = `${npmBin}\\node_modules\\@zed-industries\\codex-acp\\node_modules\\@zed-industries\\codex-acp-win32-x64\\bin\\codex-acp.exe`;

    expect(
      buildCodexAcpLaunchCommand(
        settings({
          codexCommand: "codex-acp",
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        }),
        {
          platform: "win32",
          arch: "x64",
          pathEnv: "",
          appDataPath,
          pathDelimiter: ";",
          fileExists: (path) => path === binaryPath
        }
      )
    ).toEqual({
      command: binaryPath,
      args: [
        "-c",
        'model="gpt-5.4"',
        "-c",
        'model_reasoning_effort="medium"',
        "-c",
        "mcp_servers.mimir.enabled=false",
        "-c",
        "mcp_servers.image-console.enabled=false"
      ]
    });
  });

  it("rejects non-Codex executables before launching a native process", () => {
    expect(() =>
      buildCodexAcpLaunchCommand(
        settings({
          codexCommand: "powershell -NoProfile"
        })
      )
    ).toThrow("Native Codex command must launch codex or codex-acp");
  });

  it("rejects disabled settings without creating a connection and marks runtime disabled", async () => {
    const createConnection = vi.fn();
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings({ nativeCodexEnabled: false }),
      getVaultBasePath: () => "F:\\Vault",
      createConnection
    });

    await expect(client.ensureSession()).rejects.toThrow("Native Codex chat is disabled");

    expect(createConnection).not.toHaveBeenCalled();
    expect(client.getState()).toEqual({
      status: "disabled",
      message: "Native Codex chat is disabled in Vaultseer settings.",
      processId: null
    });
  });

  it("initializes lazily, creates one session with cwd fallback, forwards text prompts, and reuses the session", async () => {
    const fake = createFakeConnection();
    const createConnection = vi.fn<NativeCodexAcpConnectionFactory>(async () => fake.connection);
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings({ codexWorkingDirectory: "   " }),
      getVaultBasePath: () => "F:\\Vault",
      createConnection
    });

    const firstSession = await client.ensureSession();
    await client.sendPrompt({ sessionId: firstSession.sessionId, prompt: "Hello Codex" });
    const secondSession = await client.ensureSession();
    await client.sendPrompt({ sessionId: secondSession.sessionId, prompt: "Reuse me" });

    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          "-c",
          'model="gpt-5.5"',
          "-c",
          'model_reasoning_effort="xhigh"',
          "mcp_servers.mimir.enabled=false",
          "mcp_servers.image-console.enabled=false"
        ]),
        cwd: "F:\\Vault"
      })
    );
    expect(fake.initialize).toHaveBeenCalledTimes(1);
    expect(fake.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCapabilities: {
          fs: {
            readTextFile: false,
            writeTextFile: false
          },
          terminal: false
        }
      })
    );
    expect(fake.newSession).toHaveBeenCalledTimes(1);
    expect(fake.newSession).toHaveBeenCalledWith({
      cwd: "F:\\Vault",
      mcpServers: []
    });
    expect(firstSession).toEqual({ sessionId: "session-a" });
    expect(secondSession).toEqual({ sessionId: "session-a" });
    expect(fake.prompt).toHaveBeenNthCalledWith(1, {
      sessionId: "session-a",
      prompt: [{ type: "text", text: "Hello Codex" }]
    });
    expect(fake.prompt).toHaveBeenNthCalledWith(2, {
      sessionId: "session-a",
      prompt: [{ type: "text", text: "Reuse me" }]
    });
    expect(client.getState()).toEqual({
      status: "running",
      message: "Codex is running.",
      processId: null
    });
  });

  it("fans out session updates only while subscribed and rejects ACP permission requests by default", async () => {
    const fake = createFakeConnection();
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async (options) => {
        fake.handler = options.handler;
        return fake.connection;
      }
    });
    const updates: unknown[] = [];

    const session = await client.ensureSession();
    fake.handler.sessionUpdate({
      sessionId: session.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "before subscribe" }
      }
    });
    const unsubscribe = client.subscribeToSessionUpdates(session.sessionId, (update) => updates.push(update));
    fake.handler.sessionUpdate({
      sessionId: session.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hello" }
      }
    });
    unsubscribe();
    fake.handler.sessionUpdate({
      sessionId: session.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "after unsubscribe" }
      }
    });

    await expect(
      fake.handler.requestPermission({
        sessionId: session.sessionId,
        toolCallId: "write-1",
        options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }]
      })
    ).resolves.toEqual({ outcome: { outcome: "cancelled" } });
    await expect(fake.handler.readTextFile({ path: "A.md" })).rejects.toThrow("disabled");
    await expect(fake.handler.writeTextFile({ path: "A.md", content: "nope" })).rejects.toThrow("disabled");
    await expect(fake.handler.createTerminal({ cwd: "F:\\Vault" })).rejects.toThrow("disabled");

    expect(updates).toEqual([
      {
        type: "agent_message_chunk",
        sessionId: "session-a",
        content: { type: "text", text: "hello" },
        text: "hello"
      }
    ]);
  });

  it("moves to failed state with a clear message when initialization fails", async () => {
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => {
        throw new Error("spawn codex-acp ENOENT");
      }
    });

    await expect(client.ensureSession()).rejects.toThrow("spawn codex-acp ENOENT");

    expect(client.getState()).toEqual({
      status: "failed",
      message: "spawn codex-acp ENOENT",
      processId: null
    });
  });

  it("moves to failed state with a clear message when ACP initialize rejects", async () => {
    const fake = createFakeConnection();
    fake.initialize.mockRejectedValueOnce(new Error("initialize handshake failed"));
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => fake.connection
    });

    await expect(client.ensureSession()).rejects.toThrow("initialize handshake failed");

    expect(client.getState()).toEqual({
      status: "failed",
      message: "initialize handshake failed",
      processId: null
    });
  });

  it("moves to failed state with a clear message when ACP session creation rejects", async () => {
    const fake = createFakeConnection();
    fake.newSession.mockRejectedValueOnce(new Error("new session rejected"));
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => fake.connection
    });

    await expect(client.ensureSession()).rejects.toThrow("new session rejected");

    expect(client.getState()).toEqual({
      status: "failed",
      message: "new session rejected",
      processId: null
    });
  });

  it("allows cold native startup to take longer than 30 seconds by default", async () => {
    vi.useFakeTimers();
    const fake = createFakeConnection();
    fake.initialize.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ protocolVersion: 1 }), 31_000))
    );
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => fake.connection
    });

    const sessionPromise = client.ensureSession();
    await vi.advanceTimersByTimeAsync(31_000);

    await expect(sessionPromise).resolves.toEqual({ sessionId: "session-a" });
    expect(client.getState()).toEqual({
      status: "running",
      message: "Codex is running.",
      processId: null
    });
  });

  it("times out stalled startup, disposes the active connection, and records failed state", async () => {
    vi.useFakeTimers();
    const fake = createFakeConnection();
    fake.initialize.mockImplementationOnce(() => new Promise(() => undefined));
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => fake.connection,
      startupTimeoutMs: 100
    });

    const sessionPromise = client.ensureSession();
    const rejection = expect(sessionPromise).rejects.toThrow("Native Codex startup timed out after 100ms");
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(client.getState()).toEqual({
      status: "failed",
      message: "Native Codex startup timed out after 100ms.",
      processId: null
    });
  });

  it("times out stalled prompts, disposes the connection, and records failed state", async () => {
    vi.useFakeTimers();
    const fake = createFakeConnection();
    fake.prompt.mockImplementationOnce(() => new Promise(() => undefined));
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => fake.connection,
      promptTimeoutMs: 100
    });

    const session = await client.ensureSession();
    const promptPromise = client.sendPrompt({ sessionId: session.sessionId, prompt: "hang" });
    const rejection = expect(promptPromise).rejects.toThrow("Native Codex prompt timed out after 100ms");
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(client.getState()).toEqual({
      status: "failed",
      message: "Native Codex prompt timed out after 100ms.",
      processId: null
    });
  });

  it("resets an initialized session by disposing the connection and starting fresh next time", async () => {
    const first = createFakeConnection({ sessionId: "session-a", processId: 101 });
    const second = createFakeConnection({ sessionId: "session-b", processId: 202 });
    const createConnection = vi.fn<NativeCodexAcpConnectionFactory>()
      .mockResolvedValueOnce(first.connection)
      .mockResolvedValueOnce(second.connection);
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection
    });

    await expect(client.ensureSession()).resolves.toEqual({ sessionId: "session-a" });
    expect(client.getState()).toEqual({
      status: "running",
      message: "Codex is running.",
      processId: 101
    });

    await client.resetSession();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(client.getState()).toEqual({
      status: "stopped",
      message: "Codex is stopped.",
      processId: null
    });

    await expect(client.ensureSession()).resolves.toEqual({ sessionId: "session-b" });
    expect(createConnection).toHaveBeenCalledTimes(2);
    expect(client.getState()).toEqual({
      status: "running",
      message: "Codex is running.",
      processId: 202
    });
  });

  it("keeps reset state when an abandoned startup later times out", async () => {
    vi.useFakeTimers();
    const fake = createFakeConnection({ processId: 101 });
    fake.initialize.mockImplementationOnce(() => new Promise(() => undefined));
    const client = new NativeCodexAcpSessionClient({
      getSettings: () => settings(),
      getVaultBasePath: () => "F:\\Vault",
      createConnection: async () => fake.connection,
      startupTimeoutMs: 100
    });

    const sessionPromise = client.ensureSession();
    const rejection = expect(sessionPromise).rejects.toThrow("Native Codex startup timed out after 100ms");
    await Promise.resolve();

    await client.resetSession();
    await vi.advanceTimersByTimeAsync(100);
    await rejection;

    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(client.getState()).toEqual({
      status: "stopped",
      message: "Codex is stopped.",
      processId: null
    });
  });
});

function settings(overrides: Partial<NativeCodexProcessSettings> = {}): NativeCodexProcessSettings {
  return {
    nativeCodexEnabled: true,
    codexCommand: "codex-acp",
    codexWorkingDirectory: "F:\\Configured",
    codexModel: "gpt-5.5",
    codexReasoningEffort: "xhigh",
    ...overrides
  };
}

function createFakeConnection(options: { sessionId?: string; processId?: number | null } = {}): {
  connection: Awaited<ReturnType<NativeCodexAcpConnectionFactory>>;
  initialize: ReturnType<typeof vi.fn>;
  newSession: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  handler: any;
} {
  const initialize = vi.fn(async () => ({ protocolVersion: 1 }));
  const newSession = vi.fn(async () => ({ sessionId: options.sessionId ?? "session-a" }));
  const prompt = vi.fn(async () => ({ stopReason: "end_turn" }));
  const dispose = vi.fn(async () => undefined);
  return {
    connection: {
      initialize,
      newSession,
      prompt,
      dispose,
      processId: options.processId ?? null
    },
    initialize,
    newSession,
    prompt,
    dispose,
    handler: null
  };
}
