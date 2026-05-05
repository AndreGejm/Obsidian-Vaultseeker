export type StudioChatMarkdownRenderer = (
  content: string,
  containerEl: HTMLElement
) => void | Promise<void>;

export function renderStudioChatMessageBody(
  containerEl: HTMLElement,
  input: {
    content: string;
    renderMarkdown?: StudioChatMarkdownRenderer;
    onRenderError?: (error: unknown) => void;
  }
): HTMLElement {
  const bodyEl = containerEl.createDiv({ cls: "vaultseer-codex-message-body" });

  if (input.renderMarkdown === undefined) {
    renderPlainText(bodyEl, input.content);
    return bodyEl;
  }

  try {
    const result = input.renderMarkdown(input.content, bodyEl);
    if (isPromiseLike(result)) {
      void result.catch((error: unknown) => {
        input.onRenderError?.(error);
        renderPlainText(bodyEl, input.content);
      });
    }
  } catch (error) {
    input.onRenderError?.(error);
    renderPlainText(bodyEl, input.content);
  }

  return bodyEl;
}

function renderPlainText(containerEl: HTMLElement, content: string): void {
  containerEl.textContent = content;
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return typeof value === "object" && value !== null && typeof value.then === "function";
}
