import { describe, expect, it, vi } from "vitest";
import { restoreChatComposerFocus } from "../src/chat-composer-focus";

describe("restoreChatComposerFocus", () => {
  it("schedules multiple focus attempts so Obsidian pane updates do not strand the composer", () => {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    const input = fakeTextarea("draft");

    restoreChatComposerFocus(input, {
      schedule: (callback, delay) => {
        callbacks.push(callback);
        delays.push(delay);
      }
    });

    expect(delays).toEqual([0, 40, 140]);

    for (const callback of callbacks) {
      callback();
    }

    expect(input.focus).toHaveBeenCalledTimes(3);
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
