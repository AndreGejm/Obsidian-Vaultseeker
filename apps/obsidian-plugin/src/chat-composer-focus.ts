export type ChatComposerFocusScheduler = (callback: () => void, delay: number) => void;

export type RestoreChatComposerFocusOptions = {
  schedule?: ChatComposerFocusScheduler;
  delaysMs?: readonly number[];
};

const DEFAULT_FOCUS_RETRY_DELAYS_MS = [0, 40, 140, 360, 900] as const;

export function restoreChatComposerFocus(
  input: HTMLTextAreaElement,
  options: RestoreChatComposerFocusOptions = {}
): void {
  const schedule = options.schedule ?? ((callback, delay) => window.setTimeout(callback, delay));
  const delays = options.delaysMs ?? DEFAULT_FOCUS_RETRY_DELAYS_MS;

  for (const delay of delays) {
    schedule(() => focusComposerIfAvailable(input), delay);
  }
}

export function shouldSubmitChatComposerKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

function focusComposerIfAvailable(input: HTMLTextAreaElement): void {
  if (!input.isConnected || input.disabled) {
    return;
  }

  input.focus();
  const cursorPosition = input.value.length;
  input.setSelectionRange(cursorPosition, cursorPosition);
}
