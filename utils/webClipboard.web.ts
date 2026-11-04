async function copyTextWithSelection(text: string): Promise<void> {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement ? activeElement : null;
  const inputSelection = input ? { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection } : null;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  Object.assign(field.style, { position: 'fixed', left: '-10000px', top: '0', opacity: '0' });
  document.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    if (!document.execCommand?.('copy')) {
      throw new DOMException('Браузер не разрешил копирование в буфер обмена.', 'NotAllowedError');
    }
  } finally {
    field.remove();
    activeElement?.focus({ preventScroll: true });
    if (input && inputSelection?.start != null && inputSelection.end != null) {
      input.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
    }
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}

/** Expo LogBox calls writeText directly, even on HTTP LAN development URLs. */
export function installWebClipboardFallback(): void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined' || navigator.clipboard) return;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copyTextWithSelection },
  });
}

installWebClipboardFallback();
