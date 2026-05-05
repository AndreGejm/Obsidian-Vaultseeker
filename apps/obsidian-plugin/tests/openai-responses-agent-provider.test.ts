import { describe, expect, it, vi } from "vitest";
import { OpenAiResponsesAgentProvider } from "../src/openai-responses-agent-provider";

describe("OpenAiResponsesAgentProvider", () => {
  it("calls the default browser fetch with the global receiver", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async function (
      this: unknown,
      input: string | URL | Request,
      _init?: RequestInit
    ): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      calls.push(String(input));
      return Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text: "Ready." }] }]
      });
    } as typeof fetch;

    try {
      const provider = new OpenAiResponsesAgentProvider({
        apiKey: "sk-test",
        model: "gpt-5.4",
        reasoningEffort: "low"
      });

      await expect(provider.respond({ messages: [], tools: [] })).resolves.toEqual({ message: "Ready." });
      expect(calls).toEqual(["https://api.openai.com/v1/responses"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("posts a Responses API request with function tools and parses text plus tool calls", async () => {
    const fetch = vi.fn(async () => responseJson({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "I will inspect the note." }]
        },
        {
          type: "function_call",
          call_id: "call-inspect",
          name: "inspect_current_note",
          arguments: "{}"
        }
      ]
    }));
    const provider = new OpenAiResponsesAgentProvider({
      apiKey: "sk-test",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      fetch
    });

    await expect(
      provider.respond({
        messages: [{ role: "user", content: "review this note" }],
        tools: [
          {
            type: "function",
            name: "inspect_current_note",
            description: "Inspect the active note.",
            parameters: { type: "object", properties: {}, additionalProperties: false }
          }
        ]
      })
    ).resolves.toEqual({
      message: "I will inspect the note.",
      toolCalls: [{ id: "call-inspect", name: "inspect_current_note", input: {} }]
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json"
        }),
        body: expect.any(String)
      })
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      model: "gpt-5.4",
      input: [{ role: "user", content: "review this note" }],
      reasoning: { effort: "medium" },
      tools: [expect.objectContaining({ type: "function", name: "inspect_current_note" })]
    });
  });

  it("maps tool result messages to function_call_output items", async () => {
    const fetch = vi.fn(async () => responseJson({ output: [{ type: "message", content: [{ type: "output_text", text: "Done." }] }] }));
    const provider = new OpenAiResponsesAgentProvider({
      apiKey: "sk-test",
      model: "gpt-5.4",
      reasoningEffort: "low",
      fetch
    });

    await provider.respond({
      messages: [
        { role: "user", content: "search" },
        { role: "tool", name: "search_notes", toolCallId: "call-search", content: "{\"ok\":true}" }
      ],
      tools: []
    });

    expect(JSON.parse(fetch.mock.calls[0][1].body).input).toEqual([
      { role: "user", content: "search" },
      { type: "function_call_output", call_id: "call-search", output: "{\"ok\":true}" }
    ]);
  });

  it("serializes multimodal user content parts for Responses image input", async () => {
    const fetch = vi.fn(async () => responseJson({ output: [{ type: "message", content: [{ type: "output_text", text: "I can see it." }] }] }));
    const provider = new OpenAiResponsesAgentProvider({
      apiKey: "sk-test",
      model: "gpt-5.4",
      reasoningEffort: "low",
      fetch
    });

    await provider.respond({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this diagram?" },
            { type: "image_url", imageUrl: "data:image/png;base64,abc123", detail: "high" }
          ]
        }
      ],
      tools: []
    });

    expect(JSON.parse(fetch.mock.calls[0][1].body).input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "What is this diagram?" },
          { type: "input_image", image_url: "data:image/png;base64,abc123", detail: "high" }
        ]
      }
    ]);
  });

  it("preserves prior Responses output items before returning tool outputs", async () => {
    const firstOutput = [
      {
        type: "reasoning",
        id: "rs_1",
        summary: []
      },
      {
        type: "function_call",
        call_id: "call-search",
        name: "search_notes",
        arguments: "{\"query\":\"resistor\"}"
      }
    ];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(responseJson({ output: firstOutput }))
      .mockResolvedValueOnce(
        responseJson({ output: [{ type: "message", content: [{ type: "output_text", text: "Found notes." }] }] })
      );
    const provider = new OpenAiResponsesAgentProvider({
      apiKey: "sk-test",
      model: "gpt-5.4",
      reasoningEffort: "low",
      fetch
    });

    await provider.respond({
      messages: [{ role: "user", content: "find resistor notes" }],
      tools: []
    });
    await provider.respond({
      messages: [
        { role: "user", content: "find resistor notes" },
        { role: "assistant", content: "" },
        { role: "tool", name: "search_notes", toolCallId: "call-search", content: "{\"results\":[]}" }
      ],
      tools: []
    });

    expect(JSON.parse(fetch.mock.calls[1][1].body).input).toEqual([
      { role: "user", content: "find resistor notes" },
      ...firstOutput,
      { type: "function_call_output", call_id: "call-search", output: "{\"results\":[]}" }
    ]);
  });

  it("throws a useful error for missing API key and failed API responses", async () => {
    const missingKeyProvider = new OpenAiResponsesAgentProvider({
      apiKey: " ",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      fetch: vi.fn()
    });

    await expect(missingKeyProvider.respond({ messages: [], tools: [] })).rejects.toThrow("API key");

    const failedProvider = new OpenAiResponsesAgentProvider({
      apiKey: "sk-test",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      fetch: vi.fn(async () => ({
        ok: false,
        status: 429,
        text: async () => "rate limit"
      }))
    });

    await expect(failedProvider.respond({ messages: [], tools: [] })).rejects.toThrow("429");
  });
});

function responseJson(value: unknown): ResponseLike {
  return {
    ok: true,
    status: 200,
    json: async () => value,
    text: async () => JSON.stringify(value)
  };
}

type ResponseLike = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text: () => Promise<string>;
};
