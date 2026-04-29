import { describe, expect, it } from "vitest";
import { readVaultNoteInputs } from "../src/obsidian-adapter";

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

