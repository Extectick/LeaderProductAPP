/** @jest-environment jsdom */
import { installWebClipboardFallback } from '../utils/webClipboard.web';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
  document.execCommand = jest.fn(() => true);
});

test('HTTP browser copies text without the secure-context Clipboard API', async () => {
  let copied = '';
  (document.execCommand as jest.Mock).mockImplementation(command => {
    expect(command).toBe('copy');
    copied = (document.activeElement as HTMLTextAreaElement).value;
    return true;
  });
  installWebClipboardFallback();
  await navigator.clipboard.writeText('Ошибка Expo\nТекст для копирования');
  expect(copied).toBe('Ошибка Expo\nТекст для копирования');
  expect(document.querySelector('textarea')).toBeNull();
});

test('copy preserves composer focus and its selection', async () => {
  const input = document.createElement('textarea');
  input.value = 'Черновик сообщения';
  document.body.appendChild(input);
  input.focus();
  input.setSelectionRange(2, 7, 'backward');
  installWebClipboardFallback();
  await navigator.clipboard.writeText('Другая строка');
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('Черновик сообщения');
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 7, 'backward']);
  expect(document.querySelectorAll('textarea')).toHaveLength(1);
});

test('copy restores the document selection', async () => {
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Выбранный текст';
  document.body.appendChild(paragraph);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  document.getSelection()!.addRange(range);
  installWebClipboardFallback();
  await navigator.clipboard.writeText('Скопированный текст');
  expect(document.getSelection()!.toString()).toBe('Выбранный текст');
});

test('does not replace the browser Clipboard API', async () => {
  const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  installWebClipboardFallback();
  expect(navigator.clipboard).toBe(clipboard);
  await navigator.clipboard.writeText('Текст');
  expect(clipboard.writeText).toHaveBeenCalledWith('Текст');
  expect(document.execCommand).not.toHaveBeenCalled();
});

test('denied copying rejects and removes the temporary field', async () => {
  (document.execCommand as jest.Mock).mockReturnValue(false);
  installWebClipboardFallback();
  await expect(navigator.clipboard.writeText('Текст')).rejects.toMatchObject({ name: 'NotAllowedError' });
  expect(document.querySelector('textarea')).toBeNull();
});
