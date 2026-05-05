import { describe, expect, it } from "vitest";
import { OllamaEmbeddingProvider } from "../src/ollama-embedding-provider";

describe("OllamaEmbeddingProvider", () => {
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
      return Response.json({ embeddings: [[0.1, 0.2]] });
    } as typeof fetch;

    try {
      const provider = new OllamaEmbeddingProvider({
        endpoint: "http://localhost:11434",
        modelId: "nomic-embed-text"
      });

      await expect(provider.embedTexts(["Alpha note"])).resolves.toEqual([[0.1, 0.2]]);
      expect(calls).toEqual(["http://localhost:11434/api/embed"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("posts batched text to the local Ollama embed endpoint", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchImplementation = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body))
      });

      return Response.json({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4]
        ]
      });
    };

    const provider = new OllamaEmbeddingProvider({
      endpoint: "http://localhost:11434",
      modelId: "nomic-embed-text",
      fetchImplementation
    });

    await expect(provider.embedTexts(["Alpha note", "Beta note"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
    expect(requests).toEqual([
      {
        url: "http://localhost:11434/api/embed",
        body: {
          model: "nomic-embed-text",
          input: ["Alpha note", "Beta note"],
          truncate: true
        }
      }
    ]);
  });

  it("reports provider HTTP failures with a clear message", async () => {
    const provider = new OllamaEmbeddingProvider({
      endpoint: "http://localhost:11434/",
      modelId: "nomic-embed-text",
      fetchImplementation: async () => new Response("offline", { status: 503 })
    });

    await expect(provider.embedTexts(["Alpha note"])).rejects.toThrow("Ollama embedding request failed with status 503.");
  });
});
