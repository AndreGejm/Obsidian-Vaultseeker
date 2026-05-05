import { describe, expect, it, vi } from "vitest";
import { renderStudioChatMessageBody } from "../src/studio-chat-message-view";

describe("renderStudioChatMessageBody", () => {
  it("delegates chat Markdown to the supplied renderer inside a selectable message body", () => {
    const container = fakeContainer();
    const markdown = ["- review the note", "", "```markdown", "# Heading", "```"].join("\n");
    const renderMarkdown = vi.fn((content: string, bodyEl: HTMLElement) => {
      bodyEl.textContent = `rendered:${content}`;
    });

    const bodyEl = renderStudioChatMessageBody(container as unknown as HTMLElement, {
      content: markdown,
      renderMarkdown
    });

    expect(renderMarkdown).toHaveBeenCalledWith(markdown, bodyEl);
    expect(container.children).toHaveLength(1);
    expect(container.children[0]?.className).toBe("vaultseer-codex-message-body");
    expect(bodyEl.textContent).toBe(`rendered:${markdown}`);
  });

  it("falls back to plain text when Markdown rendering fails", () => {
    const container = fakeContainer();
    const onRenderError = vi.fn();

    const bodyEl = renderStudioChatMessageBody(container as unknown as HTMLElement, {
      content: "**still readable**",
      renderMarkdown: () => {
        throw new Error("renderer unavailable");
      },
      onRenderError
    });

    expect(bodyEl.textContent).toBe("**still readable**");
    expect(onRenderError).toHaveBeenCalledWith(expect.any(Error));
  });
});

function fakeContainer(): FakeElement {
  return {
    className: "",
    textContent: "",
    children: [],
    createDiv(options: { cls?: string } = {}) {
      const child = fakeContainer();
      child.className = options.cls ?? "";
      this.children.push(child);
      return child as unknown as HTMLElement;
    }
  };
}

interface FakeElement {
  className: string;
  textContent: string;
  children: FakeElement[];
  createDiv(options?: { cls?: string }): HTMLElement;
}
