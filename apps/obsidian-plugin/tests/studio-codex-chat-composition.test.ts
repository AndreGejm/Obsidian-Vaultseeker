import { describe, expect, it, vi } from "vitest";
import type { ActiveNoteContextPacket } from "@vaultseer/core";
import { createNativeStudioCodexChatAdapter } from "../src/studio-codex-chat-composition";
import type { CodexAcpSessionClient, CodexAcpSessionUpdateListener } from "../src/codex-acp-session-controller";

describe("createNativeStudioCodexChatAdapter", () => {
  it("surfaces proposal tool calls through the configured native controller", async () => {
    let listener: CodexAcpSessionUpdateListener | null = null;
    const client: CodexAcpSessionClient = {
      ensureSession: vi.fn(async () => ({ sessionId: "session-a" })),
      subscribeToSessionUpdates: vi.fn((_sessionId, updateListener) => {
        listener = updateListener;
        return vi.fn();
      }),
      sendPrompt: vi.fn(async () => {
        listener?.({
          type: "tool_call",
          sessionId: "session-a",
          toolCallId: "stage-1",
          toolName: "stage_suggestion",
          status: "pending",
          rawInput: { kind: "tag", value: "vhdl" }
        });
        return { status: "completed", stopReason: "end_turn" };
      })
    };

    const response = await createNativeStudioCodexChatAdapter(client).send({
      message: "Stage this",
      context: readyContext()
    });

    expect(response.toolRequests).toEqual([
      {
        tool: "stage_suggestion",
        input: { kind: "tag", value: "vhdl" },
        toolCallId: "stage-1",
        sessionId: "session-a",
        status: "pending"
      }
    ]);
  });
});

function readyContext(): ActiveNoteContextPacket {
  return {
    status: "ready",
    message: "Active note context is ready.",
    note: {
      path: "Notes/VHDL.md",
      title: "VHDL",
      aliases: [],
      tags: ["#vhdl"],
      headings: [],
      links: []
    },
    noteChunks: [],
    relatedNotes: [],
    sourceExcerpts: []
  };
}
