import { describe, expect, it, vi } from "vitest";
import {
  ApprovedScriptRegistryError,
  createApprovedScriptRegistry,
  normalizeApprovedScriptDefinitions
} from "../src/approved-script-registry";

describe("approved script registry", () => {
  it("normalizes safe manifest entries and lists only enabled scripts", () => {
    const definitions = normalizeApprovedScriptDefinitions([
      {
        id: "normalize-frontmatter",
        title: "Normalize frontmatter",
        description: "Return a frontmatter cleanup proposal.",
        scope: "active-note",
        permission: "active-note-proposal",
        inputSchema: {
          type: "object",
          properties: {
            targetPath: { type: "string" }
          },
          additionalProperties: false
        }
      },
      {
        id: "disabled-script",
        title: "Disabled script",
        description: "Hidden from the agent.",
        enabled: false
      }
    ]);

    const registry = createApprovedScriptRegistry({ definitions, handlers: {} });

    expect(registry.list()).toEqual([
      expect.objectContaining({
        id: "normalize-frontmatter",
        title: "Normalize frontmatter",
        scope: "active-note",
        permission: "active-note-proposal"
      })
    ]);
  });

  it("drops manifest entries that contain executable-shaped fields", () => {
    expect(
      normalizeApprovedScriptDefinitions([
        {
          id: "bad",
          title: "Bad",
          description: "Should not be accepted.",
          command: "powershell",
          args: ["-NoProfile"],
          path: "C:/tmp/tool.ps1"
        },
        {
          id: "also-bad",
          title: "Also bad",
          description: "Should not be accepted.",
          executable: "node",
          script: "tool.js"
        }
      ])
    ).toEqual([]);
  });

  it("rejects malformed script ids", () => {
    expect(
      normalizeApprovedScriptDefinitions([
        {
          id: "../escape",
          title: "Escape",
          description: "Invalid id."
        },
        {
          id: "Run Me",
          title: "Spaces",
          description: "Invalid id."
        }
      ])
    ).toEqual([]);
  });

  it("runs only trusted handlers selected by script id", async () => {
    const handler = vi.fn(async (input) => ({
      status: "completed" as const,
      scriptId: input.definition.id,
      output: { received: input.input }
    }));
    const registry = createApprovedScriptRegistry({
      definitions: normalizeApprovedScriptDefinitions([
        {
          id: "suggest-note-tags",
          title: "Suggest note tags",
          description: "Return deterministic tag candidates.",
          permission: "read-only"
        }
      ]),
      handlers: {
        "suggest-note-tags": handler
      }
    });

    await expect(registry.run({ scriptId: "suggest-note-tags", input: { targetPath: "Electronics/Resistors.md" } }))
      .resolves.toEqual({
        status: "completed",
        scriptId: "suggest-note-tags",
        output: { received: { targetPath: "Electronics/Resistors.md" } }
      });
    expect(handler).toHaveBeenCalledWith({
      definition: expect.objectContaining({ id: "suggest-note-tags" }),
      input: { targetPath: "Electronics/Resistors.md" }
    });
  });

  it("does not run unknown or unhandled script ids", async () => {
    const registry = createApprovedScriptRegistry({
      definitions: normalizeApprovedScriptDefinitions([
        {
          id: "known",
          title: "Known",
          description: "Known but not installed."
        }
      ]),
      handlers: {}
    });

    await expect(registry.run({ scriptId: "missing", input: {} })).rejects.toThrow(ApprovedScriptRegistryError);
    await expect(registry.run({ scriptId: "known", input: {} })).rejects.toThrow(
      "Approved script 'known' has no trusted handler installed."
    );
  });
});
