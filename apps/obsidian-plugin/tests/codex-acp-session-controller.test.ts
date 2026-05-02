import { describe, expect, it, vi } from "vitest";
import {
  CodexAcpSessionController,
  type CodexAcpSessionClient,
  type CodexAcpTurnResult,
  type CodexAcpSessionUpdateListener
} from "../src/codex-acp-session-controller";
import type { CodexAcpSessionUpdate } from "../src/codex-acp-session-update-normalizer";
import type { CodexPromptPacket } from "../src/codex-prompt-packet";

describe("CodexAcpSessionController", () => {
  it("registers listener before prompt send, sends agentContent, and returns assistant text from streamed updates", async () => {
    const events: string[] = [];
    let listener: CodexAcpSessionUpdateListener | null = null;
    const client: CodexAcpSessionClient = {
      ensureSession: vi.fn(async () => {
        events.push("ensureSession");
        return { sessionId: "session-a" };
      }),
      subscribeToSessionUpdates: vi.fn((sessionId, updateListener) => {
        events.push(`subscribe:${sessionId}`);
        listener = updateListener;
        return () => events.push("unsubscribe");
      }),
      sendPrompt: vi.fn(async (input) => {
        events.push(`sendPrompt:${input.sessionId}:${input.prompt}`);
        listener?.({ type: "agent_message_chunk", sessionId: "session-a", text: "Hello" });
        listener?.({ type: "agent_message_chunk", sessionId: "session-a", text: " from Codex" });
        return completedTurn();
      })
    };
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(events).toEqual([
      "ensureSession",
      "subscribe:session-a",
      "sendPrompt:session-a:agent payload",
      "unsubscribe"
    ]);
    expect(client.sendPrompt).toHaveBeenCalledWith({
      sessionId: "session-a",
      prompt: "agent payload"
    });
    expect(response).toEqual({
      content: "Hello from Codex",
      toolRequests: []
    });
  });

  it("normalizes raw ACP sessionUpdate shapes before reducing", async () => {
    const client = clientWithUpdates([
      {
        sessionUpdate: "agent_message_chunk",
        sessionId: "session-a",
        content: { type: "text", text: "Raw " }
      },
      {
        sessionUpdate: "agent_message_chunk",
        sessionId: "session-a",
        content: { type: "text", text: "ACP" }
      }
    ]);
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(response.content).toBe("Raw ACP");
  });

  it("waits for the explicit Codex turn result before building the response", async () => {
    let listener: CodexAcpSessionUpdateListener | null = null;
    let completeTurn: ((result: CodexAcpTurnResult) => void) | null = null;
    const client: CodexAcpSessionClient = {
      ensureSession: vi.fn(async () => ({ sessionId: "session-a" })),
      subscribeToSessionUpdates: vi.fn((_sessionId, updateListener) => {
        listener = updateListener;
        return vi.fn();
      }),
      sendPrompt: vi.fn(
        () =>
          new Promise<CodexAcpTurnResult>((resolve) => {
            completeTurn = resolve;
            listener?.({ type: "agent_message_chunk", sessionId: "session-a", text: "Waiting" });
          })
      )
    };
    const controller = new CodexAcpSessionController(client);

    const responsePromise = controller.send(promptPacket());
    let settled = false;
    responsePromise.then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);

    completeTurn?.({ status: "completed", stopReason: "end_turn" });
    await expect(responsePromise).resolves.toEqual({
      content: "Waiting",
      toolRequests: []
    });
  });

  it("returns only pending or requested read-only tool requests and preserves explicit null input", async () => {
    const client = clientWithUpdates([
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-search",
        toolName: "search_notes",
        status: "pending",
        rawInput: { query: "vhdl" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-null",
        toolName: "inspect_current_note",
        status: "requested",
        rawInput: null
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-running",
        toolName: "search_sources",
        status: "running",
        rawInput: { query: "in progress" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-completed",
        toolName: "search_notes",
        status: "completed",
        rawInput: { query: "already done" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-failed",
        toolName: "search_notes",
        status: "failed",
        rawInput: { query: "failed" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-cancelled",
        toolName: "search_notes",
        status: "cancelled",
        rawInput: { query: "cancelled" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "allowed-missing-status",
        toolName: "search_notes",
        rawInput: { query: "missing status" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "disallowed-write",
        toolName: "write_file",
        status: "pending",
        rawInput: { path: "Notes/VHDL.md" }
      },
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "title-only",
        title: "search_notes",
        status: "pending",
        rawInput: { query: "unsafe title" }
      },
      {
        sessionUpdate: "tool_call",
        sessionId: "session-a",
        title: "search_sources",
        status: "pending",
        rawInput: { invocation: { tool: "search_sources" }, query: "datasheet" }
      }
    ]);
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(response.toolRequests).toEqual([
      {
        tool: "search_notes",
        input: { query: "vhdl" },
        toolCallId: "allowed-search",
        sessionId: "session-a",
        status: "pending"
      },
      {
        tool: "inspect_current_note",
        input: null,
        toolCallId: "allowed-null",
        sessionId: "session-a",
        status: "requested"
      }
    ]);
  });

  it("threads pending tool call provenance into chat adapter responses", async () => {
    const client = clientWithUpdates([
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "tool-read-1",
        toolName: "search_notes",
        status: "requested",
        kind: "read",
        rawInput: { query: "timing" }
      }
    ]);
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(response.toolRequests).toEqual([
      {
        tool: "search_notes",
        input: { query: "timing" },
        toolCallId: "tool-read-1",
        sessionId: "session-a",
        status: "requested",
        kind: "read",
        requestClass: "read"
      }
    ]);
  });

  it("omits proposal tool requests by default and can include them when explicitly enabled", async () => {
    const updates: CodexAcpSessionUpdate[] = [
      {
        type: "tool_call",
        sessionId: "session-a",
        toolCallId: "stage-1",
        toolName: "stage_suggestion",
        status: "pending",
        rawInput: { kind: "tag", value: "vhdl" }
      }
    ];

    await expect(new CodexAcpSessionController(clientWithUpdates(updates)).send(promptPacket())).resolves.toEqual({
      content: "Codex did not return visible assistant text.",
      toolRequests: []
    });

    await expect(
      new CodexAcpSessionController(clientWithUpdates(updates), { includeProposalTools: true }).send(promptPacket())
    ).resolves.toEqual({
      content: "Codex did not return visible assistant text.",
      toolRequests: [
        {
          tool: "stage_suggestion",
          input: { kind: "tag", value: "vhdl" },
          toolCallId: "stage-1",
          sessionId: "session-a",
          status: "pending"
        }
      ]
    });
  });

  it("ignores mismatched-session updates", async () => {
    const client = clientWithUpdates([
      { type: "agent_message_chunk", sessionId: "session-b", text: "Wrong session" },
      { type: "agent_message_chunk", sessionId: "session-a", text: "Right session" }
    ]);
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(response.content).toBe("Right session");
  });

  it("unsubscribes on success and on prompt failure", async () => {
    const successUnsubscribe = vi.fn();
    const successClient: CodexAcpSessionClient = {
      ensureSession: vi.fn(async () => ({ sessionId: "session-a" })),
      subscribeToSessionUpdates: vi.fn(() => successUnsubscribe),
      sendPrompt: vi.fn(async () => completedTurn())
    };

    await new CodexAcpSessionController(successClient).send(promptPacket());

    expect(successUnsubscribe).toHaveBeenCalledTimes(1);

    const failureUnsubscribe = vi.fn();
    const promptError = new Error("stdio closed");
    const failureClient: CodexAcpSessionClient = {
      ensureSession: vi.fn(async () => ({ sessionId: "session-a" })),
      subscribeToSessionUpdates: vi.fn(() => failureUnsubscribe),
      sendPrompt: vi.fn(async () => {
        throw promptError;
      })
    };

    await expect(new CodexAcpSessionController(failureClient).send(promptPacket())).rejects.toBe(promptError);
    expect(failureUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not send prompt if session creation fails", async () => {
    const sessionError = new Error("cannot create session");
    const client: CodexAcpSessionClient = {
      ensureSession: vi.fn(async () => {
        throw sessionError;
      }),
      subscribeToSessionUpdates: vi.fn(() => vi.fn()),
      sendPrompt: vi.fn(async () => completedTurn())
    };

    await expect(new CodexAcpSessionController(client).send(promptPacket())).rejects.toBe(sessionError);

    expect(client.subscribeToSessionUpdates).not.toHaveBeenCalled();
    expect(client.sendPrompt).not.toHaveBeenCalled();
  });

  it("uses neutral content when there is no assistant text", async () => {
    const client = clientWithUpdates([
      { type: "agent_thought_chunk", sessionId: "session-a", text: "Hidden reasoning" },
      { type: "plan", sessionId: "session-a", entries: [{ title: "Inspect note" }] }
    ]);
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(response).toEqual({
      content: "Codex did not return visible assistant text.",
      toolRequests: []
    });
  });

  it("surfaces process errors as visible content when there is no assistant text", async () => {
    const client = clientWithUpdates([
      {
        type: "process_error",
        sessionId: "session-a",
        error: { message: "spawn codex ENOENT", code: "ENOENT" }
      }
    ]);
    const controller = new CodexAcpSessionController(client);

    const response = await controller.send(promptPacket());

    expect(response).toEqual({
      content: "Codex process error: spawn codex ENOENT",
      toolRequests: []
    });
  });
});

function clientWithUpdates(updates: CodexAcpSessionUpdate[]): CodexAcpSessionClient {
  let listener: CodexAcpSessionUpdateListener | null = null;

  return {
    ensureSession: vi.fn(async () => ({ sessionId: "session-a" })),
    subscribeToSessionUpdates: vi.fn((_sessionId, updateListener) => {
      listener = updateListener;
      return vi.fn();
    }),
    sendPrompt: vi.fn(async () => {
      for (const update of updates) {
        listener?.(update);
      }
      return completedTurn();
    })
  };
}

function completedTurn(): CodexAcpTurnResult {
  return {
    status: "completed",
    stopReason: "end_turn"
  };
}

function promptPacket(): CodexPromptPacket {
  return {
    displayContent: "display payload",
    agentContent: "agent payload",
    contextSummary: {
      notePath: "Notes/VHDL.md",
      noteTitle: "VHDL",
      tagCount: 1,
      aliasCount: 0,
      headingCount: 0,
      linkCount: 0,
      noteChunkCount: 0,
      relatedNoteCount: 0,
      sourceExcerptCount: 0,
      truncated: false
    }
  };
}
