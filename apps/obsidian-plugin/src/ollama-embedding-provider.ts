import type { EmbeddingProviderPort } from "@vaultseer/core";

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type OllamaEmbeddingProviderOptions = {
  endpoint: string;
  modelId: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[];
  data?: Array<{
    embedding?: number[];
  }>;
};

export class OllamaEmbeddingProvider implements EmbeddingProviderPort {
  private readonly baseUrl: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(private readonly options: OllamaEmbeddingProviderOptions) {
    const endpoint = options.endpoint.trim();
    if (!endpoint) {
      throw new Error("Ollama embedding endpoint is required.");
    }
    this.baseUrl = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.requestJson<OllamaEmbedResponse>("/api/embed", {
      model: this.options.modelId,
      input: texts,
      truncate: true
    });
    const embeddings = extractEmbeddings(response);

    if (embeddings.length === 0) {
      throw new Error("Ollama embedding provider returned no embeddings.");
    }

    return embeddings;
  }

  private async requestJson<T>(relativePath: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(new URL(relativePath, this.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding request failed with status ${response.status}.`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Ollama embedding request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractEmbeddings(response: OllamaEmbedResponse): number[][] {
  if (Array.isArray(response.embeddings)) {
    return response.embeddings;
  }

  if (Array.isArray(response.embedding)) {
    return [response.embedding];
  }

  if (Array.isArray(response.data)) {
    return response.data
      .map((item) => item.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding));
  }

  return [];
}
