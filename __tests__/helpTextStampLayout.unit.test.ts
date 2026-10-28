import { helpTextStampLayout } from '../src/features/help/helpTextStampLayout';

describe('message timestamp uses the last line instead of a permanent footer', () => {
  test('a short outgoing number reserves real metadata width plus a pixel-rounding margin', () => {
    const lines = { end: 25.714286, maxEnd: 25.714286, count: 1 };
    const first = helpTextStampLayout({ availableWidth: 334, contentWidth: 68, lines, stampWidth: 43.428574 });
    expect(first.minWidth).toBe(101);
    expect(first.inline).toBe(false);
    const settled = helpTextStampLayout({ availableWidth: 334, contentWidth: first.minWidth - 22 - .19, lines, stampWidth: 43.428574 });
    expect(settled.inline).toBe(true);
    expect(settled.minWidth).toBe(first.minWidth);
  });

  test('multiline messages expand only enough to accommodate the last line and metadata', () => {
    const lines = { end: 180, maxEnd: 205, count: 3 };
    const result = helpTextStampLayout({ availableWidth: 334, contentWidth: 205, lines, stampWidth: 43 });
    expect(result.minWidth).toBe(254);
    expect(helpTextStampLayout({ availableWidth: 334, contentWidth: 232, lines, stampWidth: 43 }).inline).toBe(true);
  });

  test('a full final line keeps a footer and never exceeds the available chat width', () => {
    const result = helpTextStampLayout({ availableWidth: 320, contentWidth: 298, lines: { end: 290, maxEnd: 295, count: 4 }, stampWidth: 43 });
    expect(result).toEqual({ minWidth: 320, inline: false });
  });

  test('edited labels and accessibility font scale use measured metadata instead of a fixed spacer', () => {
    const lines = { end: 45, maxEnd: 45, count: 1 };
    expect(helpTextStampLayout({ availableWidth: 320, contentWidth: 120, lines, stampWidth: 45 }).inline).toBe(true);
    const edited = helpTextStampLayout({ availableWidth: 320, contentWidth: 120, lines, stampWidth: 110 });
    expect(edited).toEqual({ minWidth: 186, inline: false });
    expect(helpTextStampLayout({ availableWidth: 320, contentWidth: 164, lines, stampWidth: 110 }).inline).toBe(true);
  });

  test('media captions use their existing media width; unknown line data cannot overlap text', () => {
    expect(helpTextStampLayout({ availableWidth: 320, contentWidth: 120, lines: { end: 110, maxEnd: 110, count: 1 }, stampWidth: 45, allowExpansion: false })).toEqual({ minWidth: 90, inline: false });
    expect(helpTextStampLayout({ availableWidth: 320, contentWidth: 120, lines: null, stampWidth: 45 }).inline).toBe(false);
  });
});
