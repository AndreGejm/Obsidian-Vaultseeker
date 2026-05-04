import { describe, expect, it } from "vitest";
import { formatCodexToolResultMessage } from "../src/codex-tool-result-message";

describe("formatCodexToolResultMessage", () => {
  it("formats note search results concisely without raw HTML", () => {
    const message = formatCodexToolResultMessage({
      ok: true,
      tool: "search_notes",
      output: {
        message: "1 result found.",
        results: [
          {
            title: "Timer <b>",
            notePath: "Notes/Timer.md",
            reason: "timer in title",
            excerpt: "Use <script>bad()</script> wisely."
          }
        ]
      }
    });

    expect(message).toContain("Tool result (search_notes)");
    expect(message).toContain("1 result found.");
    expect(message).toContain("Timer &lt;b&gt;");
    expect(message).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(message).not.toContain("<script>");
  });

  it("formats failed tool results as visible error messages", () => {
    expect(
      formatCodexToolResultMessage({
        ok: false,
        tool: "search_sources",
        message: "Source search unavailable"
      })
    ).toBe("Tool result (search_sources) failed: Source search unavailable");
  });

  it("shows when current-note inspection used live note text instead of only indexed chunks", () => {
    const message = formatCodexToolResultMessage({
      ok: true,
      tool: "inspect_current_note",
      output: {
        status: "ready",
        note: {
          path: "Electronics/Resistor Types.md",
          title: "Resistor Types",
          aliases: [],
          tags: ["electronics"],
          headings: [],
          links: []
        },
        liveNote: {
          source: "active_file",
          contentHash: "hash-live",
          text: "# Resistor Types\n\nResistors limit current and divide voltage.",
          truncated: false
        },
        noteChunks: [],
        relatedNotes: [],
        sourceExcerpts: []
      }
    });

    expect(message).toContain("Live note text: available");
    expect(message).toContain("Resistors limit current");
    expect(message).not.toContain("paste");
  });
});
