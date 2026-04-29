import { describe, expect, it } from "vitest";
import { mapObsidianFileToNoteInput } from "../src/metadata-mapper";

describe("mapObsidianFileToNoteInput", () => {
  it("maps Obsidian cache data into core NoteRecordInput without normalizing in the adapter", () => {
    const input = mapObsidianFileToNoteInput(
      {
        path: "Literature/Ragnarok.md",
        basename: "Ragnarok",
        stat: {
          ctime: 100,
          mtime: 200,
          size: 300
        }
      },
      "Body text",
      {
        frontmatter: {
          tags: ["myth/norse"],
          aliases: ["Doom of the Gods"]
        },
        tags: [
          {
            tag: "#myth/norse",
            position: { start: { line: 3, col: 4 } }
          }
        ],
        links: [
          {
            link: "Viking Cosmology#World Tree",
            original: "[[Viking Cosmology#World Tree|Yggdrasil]]",
            displayText: "Yggdrasil",
            position: { start: { line: 6, col: 2 } }
          }
        ],
        headings: [
          {
            heading: "Notes",
            level: 2,
            position: { start: { line: 8, col: 1 } }
          }
        ]
      }
    );

    expect(input).toEqual({
      path: "Literature/Ragnarok.md",
      basename: "Ragnarok",
      content: "Body text",
      stat: {
        ctime: 100,
        mtime: 200,
        size: 300
      },
      metadata: {
        frontmatter: {
          tags: ["myth/norse"],
          aliases: ["Doom of the Gods"]
        },
        tags: ["#myth/norse"],
        aliases: ["Doom of the Gods"],
        links: [
          {
            raw: "[[Viking Cosmology#World Tree|Yggdrasil]]",
            target: "Viking Cosmology",
            heading: "World Tree",
            displayText: "Yggdrasil",
            position: { line: 6, column: 2 }
          }
        ],
        headings: [
          {
            heading: "Notes",
            level: 2,
            position: { line: 8, column: 1 }
          }
        ]
      }
    });
  });
});

