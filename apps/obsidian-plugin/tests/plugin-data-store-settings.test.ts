import { describe, expect, it, vi } from "vitest";
import { VaultseerPluginDataStore } from "../src/plugin-data-store";

describe("VaultseerPluginDataStore settings", () => {
  it("loads native Codex model settings from persisted plugin data", async () => {
    const store = new VaultseerPluginDataStore({
      loadData: vi.fn(async () => ({
        settings: {
          codexProvider: "openai",
          openAiApiKey: "sk-local",
          openAiBaseUrl: "https://api.openai.test/v1",
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        },
        index: null
      })),
      saveData: vi.fn()
    });

    await expect(store.loadSettings()).resolves.toEqual(
      expect.objectContaining({
        codexProvider: "openai",
        openAiApiKey: "sk-local",
        openAiBaseUrl: "https://api.openai.test/v1",
        codexModel: "gpt-5.4",
        codexReasoningEffort: "medium"
      })
    );
  });

  it("defaults native Codex chat to the fast Vaultseer helper profile", async () => {
    const store = new VaultseerPluginDataStore({
      loadData: async () => null,
      saveData: vi.fn()
    });

    await expect(store.loadSettings()).resolves.toEqual(
      expect.objectContaining({
        codexProvider: "acp",
        openAiApiKey: "",
        openAiBaseUrl: "https://api.openai.com/v1",
        codexModel: "gpt-5.3-codex-spark",
        codexReasoningEffort: "medium",
        approvedScripts: []
      })
    );
  });

  it("normalizes approved script settings and drops executable-shaped entries", async () => {
    const store = new VaultseerPluginDataStore({
      loadData: vi.fn(async () => ({
        settings: {
          approvedScripts: [
            {
              id: "normalize-frontmatter",
              title: "Normalize frontmatter",
              description: "Return a frontmatter proposal.",
              permission: "active-note-proposal"
            },
            {
              id: "bad-script",
              title: "Bad script",
              description: "Must be dropped.",
              command: "powershell"
            }
          ]
        },
        index: null
      })),
      saveData: vi.fn()
    });

    await expect(store.loadSettings()).resolves.toEqual(
      expect.objectContaining({
        approvedScripts: [
          expect.objectContaining({
            id: "normalize-frontmatter",
            title: "Normalize frontmatter",
            permission: "active-note-proposal",
            enabled: true
          })
        ]
      })
    );
  });
});
