import { describe, expect, it, vi } from "vitest";
import { VaultseerPluginDataStore } from "../src/plugin-data-store";

describe("VaultseerPluginDataStore settings", () => {
  it("loads native Codex model settings from persisted plugin data", async () => {
    const store = new VaultseerPluginDataStore({
      loadData: vi.fn(async () => ({
        settings: {
          codexModel: "gpt-5.4",
          codexReasoningEffort: "medium"
        },
        index: null
      })),
      saveData: vi.fn()
    });

    await expect(store.loadSettings()).resolves.toEqual(
      expect.objectContaining({
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
        codexModel: "gpt-5.3-codex-spark",
        codexReasoningEffort: "medium"
      })
    );
  });
});
