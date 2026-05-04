import { AcpCodexChatAdapter, type CodexChatAdapter } from "./codex-chat-adapter";
import { CodexAcpSessionController, type CodexAcpSessionClient } from "./codex-acp-session-controller";
import { OpenAiResponsesAgentProvider, type OpenAiResponsesFetch } from "./openai-responses-agent-provider";
import type { VaultseerSettings } from "./settings-model";
import { VaultseerAgentEnvironment } from "./vaultseer-agent-environment";
import type { VaultseerAgentToolRegistry } from "./vaultseer-agent-tool-registry";

export function createNativeStudioCodexChatAdapter(client: CodexAcpSessionClient): CodexChatAdapter {
  return new AcpCodexChatAdapter(new CodexAcpSessionController(client, { includeProposalTools: true }));
}

export function createVaultseerStudioCodexChatAdapter(input: {
  client: CodexAcpSessionClient;
  registry: VaultseerAgentToolRegistry;
  getSettings: () => Pick<
    VaultseerSettings,
    "codexProvider" | "openAiApiKey" | "openAiBaseUrl" | "codexModel" | "codexReasoningEffort"
  >;
  fetch?: OpenAiResponsesFetch;
}): CodexChatAdapter {
  const acpAdapter = createNativeStudioCodexChatAdapter(input.client);
  const nativeEnvironment = new VaultseerAgentEnvironment({
    registry: input.registry,
    providerFactory: () => {
      const settings = input.getSettings();
      return new OpenAiResponsesAgentProvider({
        apiKey: settings.openAiApiKey,
        baseUrl: settings.openAiBaseUrl,
        model: settings.codexModel,
        reasoningEffort: settings.codexReasoningEffort,
        ...(input.fetch ? { fetch: input.fetch } : {})
      });
    }
  });

  return {
    get capabilities() {
      const settings = input.getSettings();
      return {
        nativeToolLoop: settings.codexProvider === "openai" && settings.openAiApiKey.trim().length > 0
      };
    },
    send: async (request) => {
      const settings = input.getSettings();
      if (settings.codexProvider !== "openai" || settings.openAiApiKey.trim().length === 0) {
        return acpAdapter.send(request);
      }

      if (request.context.status !== "ready") {
        return {
          content: request.context.message,
          toolRequests: []
        };
      }

      try {
        return await nativeEnvironment.send(request);
      } catch (error) {
        return {
          content: `OpenAI Codex chat could not respond: ${getErrorMessage(error)}.`,
          toolRequests: [],
          toolEvents: []
        };
      }
    }
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return "unknown error";
}
