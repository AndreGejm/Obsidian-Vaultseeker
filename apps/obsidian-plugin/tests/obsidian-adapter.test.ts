import { describe, expect, it } from "vitest";
import { readVaultAssetRecords, readVaultNoteInputs } from "../src/obsidian-adapter";

describe("readVaultNoteInputs", () => {
  it("reads markdown files through Obsidian APIs and maps them to core inputs", async () => {
    const files = [
      {
        path: "A.md",
        basename: "A",
        stat: { ctime: 1, mtime: 2, size: 3 }
      },
      {
        path: "Folder/B.md",
        basename: "B",
        stat: { ctime: 4, mtime: 5, size: 6 }
      }
    ];

    const app = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (file: (typeof files)[number]) => `content:${file.path}`
      },
      metadataCache: {
        getFileCache: (file: (typeof files)[number]) => ({
          frontmatter: { tags: [file.basename.toLowerCase()] },
          tags: [{ tag: `#${file.basename.toLowerCase()}` }],
          links: [],
          headings: []
        })
      }
    };

    const inputs = await readVaultNoteInputs(app);

    expect(inputs.map((input) => input.path)).toEqual(["A.md", "Folder/B.md"]);
    expect(inputs[0]?.content).toBe("content:A.md");
    expect(inputs[1]?.metadata?.frontmatter).toEqual({ tags: ["b"] });
  });
});

describe("readVaultAssetRecords", () => {
  it("lists non-markdown vault assets through Obsidian metadata without reading file bytes", async () => {
    const files = [
      {
        path: "Images/resistor.png",
        name: "resistor.png",
        basename: "resistor",
        extension: "png",
        stat: { ctime: 1, mtime: 10, size: 2048 }
      },
      {
        path: "Docs/spec.pdf",
        name: "spec.pdf",
        basename: "spec",
        extension: "pdf",
        stat: { ctime: 2, mtime: 20, size: 4096 }
      },
      {
        path: ".obsidian/workspace.json",
        name: "workspace.json",
        basename: "workspace",
        extension: "json",
        stat: { ctime: 3, mtime: 30, size: 128 }
      },
      {
        path: "Notes/A.md",
        name: "A.md",
        basename: "A",
        extension: "md",
        stat: { ctime: 4, mtime: 40, size: 256 }
      }
    ];

    const app = {
      vault: {
        getMarkdownFiles: () => [],
        getFiles: () => files,
        cachedRead: async () => {
          throw new Error("asset registry must not read file bytes");
        }
      },
      metadataCache: {
        getFileCache: () => null
      }
    };

    const assets = readVaultAssetRecords(app, { extensions: [".png", ".pdf"] });

    expect(assets).toEqual([
      expect.objectContaining({
        path: "Docs/spec.pdf",
        filename: "spec.pdf",
        extension: ".pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        contentHash: "vault-file:4096:20"
      }),
      expect.objectContaining({
        path: "Images/resistor.png",
        filename: "resistor.png",
        extension: ".png",
        mimeType: "image/png",
        sizeBytes: 2048,
        contentHash: "vault-file:2048:10"
      })
    ]);
  });
});

