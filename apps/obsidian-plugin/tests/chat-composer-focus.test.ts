import { describe, expect, it, vi } from "vitest";
import { restoreChatComposerFocus, shouldSubmitChatComposerKey } from "../src/chat-composer-focus";

describe("restoreChatComposerFocus", () => {
  it("schedules enough focus attempts so delayed Obsidian pane updates do not strand the composer", () => {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    const input = fakeTextarea("draft");

    restoreChatComposerFocus(input, {
      schedule: (callback, delay) => {
        callbacks.push(callback);
        delays.push(delay);
      }
    });

    expect(delays).toEqual([0, 40, 140, 360, 900]);

    for (const callback of callbacks) {
      callback();
    }

    expect(input.focus).toHaveBeenCalledTimes(5);
    expect(input.setSelectionRange).toHaveBeenLastCalledWith(5, 5);
  });

  it("does not focus a disconnected or disabled composer", () => {
    const callbacks: Array<() => void> = [];
    const disconnected = fakeTextarea("gone", { isConnected: false });
    const disabled = fakeTextarea("disabled", { disabled: true });

    restoreChatComposerFocus(disconnected, {
      schedule: (callback) => callbacks.push(callback)
    });
    restoreChatComposerFocus(disabled, {
      schedule: (callback) => callbacks.push(callback)
    });

    for (const callback of callbacks) {
      callback();
    }

    expect(disconnected.focus).not.toHaveBeenCalled();
    expect(disabled.focus).not.toHaveBeenCalled();
  });
});

describe("shouldSubmitChatComposerKey", () => {
  it("submits on plain Enter", () => {
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "Enter" }))).toBe(true);
  });

  it("keeps a newline on Shift+Enter", () => {
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "Enter", shiftKey: true }))).toBe(false);
  });

  it("does not submit modified, composing, or non-Enter key presses", () => {
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "Enter", ctrlKey: true }))).toBe(false);
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "Enter", altKey: true }))).toBe(false);
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "Enter", metaKey: true }))).toBe(false);
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "Enter", isComposing: true }))).toBe(false);
    expect(shouldSubmitChatComposerKey(fakeKeyboardEvent({ key: "a" }))).toBe(false);
  });
});

function fakeTextarea(
  value: string,
  overrides: Partial<Pick<HTMLTextAreaElement, "disabled" | "isConnected">> = {}
): HTMLTextAreaElement {
  return {
    value,
    disabled: overrides.disabled ?? false,
    isConnected: overrides.isConnected ?? true,
    focus: vi.fn(),
    setSelectionRange: vi.fn()
  } as unknown as HTMLTextAreaElement;
}

function fakeKeyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: overrides.key ?? "",
    shiftKey: overrides.shiftKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    altKey: overrides.altKey ?? false,
    metaKey: overrides.metaKey ?? false,
    isComposing: overrides.isComposing ?? false
  } as KeyboardEvent;
}
