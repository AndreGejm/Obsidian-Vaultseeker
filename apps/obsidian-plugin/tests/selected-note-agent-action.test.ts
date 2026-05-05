import { describe, expect, it, vi } from "vitest";
import {
  addSelectedNoteActionMenuItems,
  buildSelectedNoteAgentActionDisplayMessage,
  buildSelectedNoteAgentActionPrompt,
  MAX_SELECTED_NOTE_AGENT_ACTION_CHARS,
  SELECTED_NOTE_AGENT_ACTIONS
} from "../src/selected-note-agent-action";

describe("buildSelectedNoteAgentActionPrompt", () => {
  it("builds a rewrite task that keeps the selected passage scoped to the active note", () => {
    const prompt = buildSelectedNoteAgentActionPrompt({
      action: "suggest_rewrite",
      activePath: "Electronics/Resistor Types.md",
      selectedText: "Carbon composition resistors are noisy but handle pulses."
    });

    expect(prompt).toContain("Vaultseer selected-section rewrite task");
    expect(prompt).toContain("Active note: Electronics/Resistor Types.md");
    expect(prompt).toContain("Carbon composition resistors are noisy but handle pulses.");
    expect(prompt).toContain("stage_suggestion");
    expect(prompt).toContain("Do not apply the edit directly");
  });

  it("builds a fact-check task that treats web verification as primary and note content as context", () => {
    const prompt = buildSelectedNoteAgentActionPrompt({
      action: "fact_check",
      activePath: "Electronics/Resistor Types.md",
      selectedText: "All wirewound resistors are safe for high-frequency use."
    });

    expect(prompt).toContain("Vaultseer selected-section fact-check task");
    expect(prompt).toContain("Use web research as the primary verification source");
    expect(prompt).toContain("Use the selected passage and active note only as context");
    expect(prompt).toContain("Search Vaultseer notes, indexed chunks, and extracted source workspaces as supporting evidence");
    expect(prompt).toContain("If web research is unavailable in this agent session, say so clearly");
    expect(prompt).toContain("supported, contradicted, unsupported, or unclear");
  });

  it("caps very large selections before sending them to the agent", () => {
    const prompt = buildSelectedNoteAgentActionPrompt({
      action: "suggest_rewrite",
      activePath: "Long.md",
      selectedText: "a".repeat(MAX_SELECTED_NOTE_AGENT_ACTION_CHARS + 50)
    });

    expect(prompt).toContain("Selection was truncated");
    expect(prompt).toContain("a".repeat(MAX_SELECTED_NOTE_AGENT_ACTION_CHARS));
    expect(prompt).not.toContain("a".repeat(MAX_SELECTED_NOTE_AGENT_ACTION_CHARS + 1));
  });

  it("builds a distinct task prompt for every selected-text action", () => {
    const expectations = [
      ["ask_about_selection", "Vaultseer selected-section question task", "Answer the user's likely question"],
      ["find_related_notes", "Vaultseer selected-section related-notes task", "Find notes and chunks"],
      ["find_supporting_sources", "Vaultseer selected-section supporting-sources task", "Search extracted source workspaces"],
      ["suggest_links", "Vaultseer selected-section link-suggestion task", "Suggest meaningful Obsidian wikilinks"],
      ["suggest_tags", "Vaultseer selected-section tag-suggestion task", "Suggest sparse frontmatter tags"],
      ["create_note_from_selection", "Vaultseer selected-section note-creation task", "Draft a new note from this selected passage"],
      ["extract_claims", "Vaultseer selected-section claim-extraction task", "Extract factual claims"],
      ["explain_selection", "Vaultseer selected-section explanation task", "Explain this selected passage"],
      ["turn_into_checklist", "Vaultseer selected-section checklist task", "Turn this selected passage into a checklist"]
    ] as const;

    for (const [action, title, instruction] of expectations) {
      const prompt = buildSelectedNoteAgentActionPrompt({
        action,
        activePath: "Electronics/Resistor Types.md",
        selectedText: "Selected electronics detail."
      });

      expect(prompt).toContain(title);
      expect(prompt).toContain(instruction);
      expect(prompt).toContain("Active note: Electronics/Resistor Types.md");
      expect(prompt).toContain("Selected electronics detail.");
    }
  });
});

describe("addSelectedNoteActionMenuItems", () => {
  it("adds every selected-text action for nonblank selected text", async () => {
    const clicks: Array<() => Promise<void> | void> = [];
    const onAction = vi.fn(async () => undefined);
    const menu = createFakeMenu(clicks);

    const added = addSelectedNoteActionMenuItems({
      menu,
      activePath: "Electronics/Resistor Types.md",
      selectedText: "A selected section.",
      onAction
    });

    expect(added).toBe(true);
    expect(menu.titles).toEqual(SELECTED_NOTE_AGENT_ACTIONS.map((action) => action.menuTitle));

    for (const click of clicks) {
      await click();
    }

    expect(onAction).toHaveBeenNthCalledWith(1, {
      action: "suggest_rewrite",
      activePath: "Electronics/Resistor Types.md",
      selectedText: "A selected section."
    });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      action: "fact_check",
      activePath: "Electronics/Resistor Types.md",
      selectedText: "A selected section."
    });
    expect(onAction).toHaveBeenLastCalledWith({
      action: "turn_into_checklist",
      activePath: "Electronics/Resistor Types.md",
      selectedText: "A selected section."
    });
  });

  it("does not add actions without an active note or selected text", () => {
    const onAction = vi.fn();

    expect(
      addSelectedNoteActionMenuItems({
        menu: createFakeMenu([]),
        activePath: null,
        selectedText: "A selected section.",
        onAction
      })
    ).toBe(false);
    expect(
      addSelectedNoteActionMenuItems({
        menu: createFakeMenu([]),
        activePath: "Electronics/Resistor Types.md",
        selectedText: "   ",
        onAction
      })
    ).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("buildSelectedNoteAgentActionDisplayMessage", () => {
  it("shows a concise user-facing chat message instead of the internal agent prompt", () => {
    const message = buildSelectedNoteAgentActionDisplayMessage({
      action: "fact_check",
      activePath: "Electronics/Resistor Types.md",
      selectedText: "All wirewound resistors are safe for high-frequency use.\n\nThis extra context should be previewed only."
    });

    expect(message).toContain("Fact check selected text");
    expect(message).toContain("Electronics/Resistor Types.md");
    expect(message).toContain("All wirewound resistors are safe");
    expect(message).not.toContain("Vaultseer selected-section fact-check task");
    expect(message).not.toContain("Selected passage:");
  });
});

function createFakeMenu(clicks: Array<() => Promise<void> | void>): {
  titles: string[];
  addItem: (callback: (item: FakeMenuItem) => void) => void;
} {
  return {
    titles: [],
    addItem(callback) {
      const item: FakeMenuItem = {
        setTitle: (title) => {
          this.titles.push(title);
          return item;
        },
        setIcon: () => item,
        onClick: (handler) => {
          clicks.push(handler);
          return item;
        }
      };
      callback(item);
    }
  };
}

type FakeMenuItem = {
  setTitle: (title: string) => FakeMenuItem;
  setIcon: (icon: string) => FakeMenuItem;
  onClick: (handler: () => Promise<void> | void) => FakeMenuItem;
};
