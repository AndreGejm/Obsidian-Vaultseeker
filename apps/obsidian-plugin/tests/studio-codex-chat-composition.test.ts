import { describe, expect, it, vi } from "vitest";
import type { ActiveNoteContextPacket } from "@vaultseer/core";
import { createNativeStudioCodexChatAdapter, createVaultseerStudioCodexChatAdapter } from "../src/studio-codex-chat-composition";
import type { CodexAcpSessionClient, CodexAcpSessionUpdateListener } from "../src/codex-acp-session-controller";
import { createVaultseerAgentToolRegistry } from "../src/vaultseer-agent-tool-registry";

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

describe("createVaultseerStudioCodexChatAdapter", () => {
  it("uses the native OpenAI agent environment when OpenAI provider is selected and an API key is configured", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: "function_call",
            call_id: "call-inspect",
            name: "inspect_current_note",
            arguments: "{}"
          }
        ]
      }),
      text: async () => ""
    }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: "function_call",
              call_id: "call-inspect",
              name: "inspect_current_note",
              arguments: "{}"
            }
          ]
        }),
        text: async () => ""
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: "function_call",
              call_id: "call-stage",
              name: "stage_suggestion",
              arguments: JSON.stringify({
                kind: "rewrite",
                markdown: "# VHDL\n\nReviewed.",
                reason: "User asked for a current-note rewrite."
              })
            }
          ]
        }),
        text: async () => ""
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "I staged a rewrite for review." }]
            }
          ]
        }),
        text: async () => ""
      });
    const client = fakeAcpClient();
    const stageSuggestion = vi.fn(async () => ({ status: "planned" }));
    const registry = createVaultseerAgentToolRegistry({
      tools: {
        inspectCurrentNote: async () => ({ status: "ready" }),
        searchNotes: async () => ({ status: "ready", results: [] }),
        searchSources: async () => ({ status: "ready", results: [] }),
        stageSuggestion
      }
    });

    const adapter = createVaultseerStudioCodexChatAdapter({
      client,
      registry,
      getSettings: () => ({
        codexProvider: "openai",
        openAiApiKey: "sk-test",
        openAiBaseUrl: "https://api.openai.com/v1",
        codexModel: "gpt-5.4",
        codexReasoningEffort: "medium"
      }),
      fetch
    });
    const response = await adapter.send({
      message: "Review this note",
      context: readyContext()
    });

    expect(adapter.capabilities?.nativeToolLoop).toBe(true);
    expect(response).toEqual({
      content: "I staged a rewrite for review.",
      toolRequests: [],
      toolEvents: [
        expect.objectContaining({ tool: "inspect_current_note" }),
        expect.objectContaining({ tool: "stage_suggestion" })
      ]
    });
    expect(stageSuggestion).toHaveBeenCalledOnce();
    expect(client.ensureSession).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("falls back to the ACP adapter when OpenAI is not configured", async () => {
    const client = fakeAcpClient();
    const adapter = createVaultseerStudioCodexChatAdapter({
      client,
      registry: createVaultseerAgentToolRegistry({
        tools: {
          inspectCurrentNote: async () => ({ status: "ready" }),
          searchNotes: async () => ({ status: "ready", results: [] }),
          searchSources: async () => ({ status: "ready", results: [] }),
          stageSuggestion: async () => ({ status: "planned" })
        }
      }),
      getSettings: () => ({
        codexProvider: "acp",
        openAiApiKey: "",
        openAiBaseUrl: "https://api.openai.com/v1",
        codexModel: "gpt-5.4",
        codexReasoningEffort: "medium"
      }),
      fetch: vi.fn()
    });

    await adapter.send({ message: "Hello", context: readyContext() });

    expect(client.ensureSession).toHaveBeenCalledOnce();
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

function fakeAcpClient(): CodexAcpSessionClient {
  return {
    ensureSession: vi.fn(async () => ({ sessionId: "session-a" })),
    subscribeToSessionUpdates: vi.fn(() => vi.fn()),
    sendPrompt: vi.fn(async () => ({ status: "completed", stopReason: "end_turn" }))
  };
}
