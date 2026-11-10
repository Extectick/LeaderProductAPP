import { helpAlbumLayout, helpImageAspectRatio, helpMediaPreviewBounds, type HelpAlbumLayout } from '../src/features/help/helpAlbumLayout';

const dimensions = (ratios: number[]) => ratios.map(ratio => ({ width: ratio * 1000, height: 1000 }));
function geometry(layout: HelpAlbumLayout, count: number, maxWidth: number) {
  expect(layout.items).toHaveLength(count);
  expect(layout.items.map(tile => tile.index)).toEqual(Array.from({ length: count }, (_, index) => index));
  expect(layout.width).toBeLessThanOrEqual(maxWidth + .001);
  expect(Number.isFinite(layout.height)).toBe(true);
  for (const tile of layout.items) {
    expect(tile.width).toBeGreaterThan(0); expect(tile.height).toBeGreaterThan(0);
    expect(tile.x).toBeGreaterThanOrEqual(0); expect(tile.y).toBeGreaterThanOrEqual(0);
    expect(tile.x + tile.width).toBeLessThanOrEqual(layout.width + .001);
    expect(tile.y + tile.height).toBeLessThanOrEqual(layout.height + .001);
  }
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    const a = layout.items[i], b = layout.items[j];
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    expect(overlapX > .001 && overlapY > .001).toBe(false);
  }
}

test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('%i-photo portrait/landscape albums fit small and large bubbles without overlap', count => {
  for (const width of [180, 310, 620]) for (const ratios of [Array(count).fill(.56), Array(count).fill(1.78), Array.from({ length: count }, (_, index) => [.6, 1.8, 1, .75, 2.4][index % 5])]) {
    const layout = helpAlbumLayout(dimensions(ratios), width);
    geometry(layout, count, width);
    if (count > 1) {
      expect(layout.width).toBe(width); expect(layout.height).toBeLessThanOrEqual(width * 1.5 + .001);
      expect(Math.min(...layout.items.map(tile => tile.width))).toBeGreaterThan(width * .1);
    }
  }
});
test('two wide photos stack, two portraits share a row, and widths respect mixed proportions', () => {
  expect(helpAlbumLayout(dimensions([1.8, 1.8]), 310).pattern).toBe('1-1');
  expect(helpAlbumLayout(dimensions([.6, .75]), 310).pattern).toBe('2');
  const mixed = helpAlbumLayout(dimensions([.6, 1.8]), 310);
  expect(mixed.items[1].width).toBeGreaterThan(mixed.items[0].width);
});
test('three and four images adapt their leading image into a column or a wide first row', () => {
  expect(helpAlbumLayout(dimensions([.65, 1.5, 1.5]), 310).pattern).toBe('side-2');
  expect(helpAlbumLayout(dimensions([1.8, 1, 1]), 310).pattern).toBe('1-2');
  expect(helpAlbumLayout(dimensions([.65, 1.5, 1.5, 1.5]), 310).pattern).toBe('side-3');
  expect(helpAlbumLayout(dimensions([1.8, .7, 1, 1.5]), 310).pattern).toBe('1-3');
  expect(helpAlbumLayout(dimensions([1, 1, 1, 1]), 310).pattern).toBe('2-2');
});
test('general partitions are deterministic and are selected by photo proportions', () => {
  const portraits = dimensions(Array(10).fill(.6)), landscapes = dimensions(Array(10).fill(1.8));
  const a = helpAlbumLayout(portraits, 310), b = helpAlbumLayout(landscapes, 310);
  expect(a).toEqual(helpAlbumLayout(portraits, 310));
  expect(a.pattern).not.toBe(b.pattern);
  expect(a.items.every(tile => tile.width !== tile.height)).toBe(true);
});
test('row fitting preserves consistent two-dp gutters and flush outside edges', () => {
  const layout = helpAlbumLayout(dimensions(Array(10).fill(.6)), 310);
  const tops = [...new Set(layout.items.map(tile => tile.y))].sort((a, b) => a - b);
  tops.forEach((top, index) => {
    const row = layout.items.filter(tile => tile.y === top);
    expect(row[0].x).toBe(0); expect(row.at(-1)!.x + row.at(-1)!.width).toBeCloseTo(310);
    row.slice(1).forEach((tile, column) => expect(tile.x - row[column].x - row[column].width).toBeCloseTo(2));
    if (index) { const previous = layout.items.find(tile => tile.y === tops[index - 1])!; expect(top - previous.y - previous.height).toBeCloseTo(2); }
  });
});
test('bad legacy metadata and extreme aspect ratios cannot produce NaN, overlap or invalid frame sizes', () => {
  const sizes = [{}, { width: null, height: null }, { width: 0, height: 50 }, { width: NaN, height: 20 }, { width: Infinity, height: 10 }, { width: 100000, height: 1 }, { width: 1, height: 100000 }];
  geometry(helpAlbumLayout(sizes, 310), sizes.length, 310);
  geometry(helpAlbumLayout(sizes, NaN), sizes.length, 1);
  expect(helpImageAspectRatio({ width: 0, height: 1 })).toBeNull();
  expect(helpAlbumLayout([], 310)).toMatchObject({ height: 0, items: [] });
});
test('single photos preserve the complete aspect ratio within the height limit', () => {
  const portrait = helpAlbumLayout(dimensions([.5]), 310);
  expect(portrait.width / portrait.height).toBeCloseTo(.5);
  expect(portrait.height).toBeGreaterThan(500);
  expect(portrait.height).toBeLessThanOrEqual(helpMediaPreviewBounds(310).maxHeight);
  expect(helpAlbumLayout(dimensions([2]), 310)).toMatchObject({ width: 310, height: 155 });
});


test('a portrait screenshot grows with actual column width across phone and desktop while remaining uncropped', () => {
  const screenshot = [{width: 1080, height: 2400}];
  const phone = helpMediaPreviewBounds(310), desktop = helpMediaPreviewBounds(760);
  const small = helpAlbumLayout(screenshot, phone.width, 2, phone.maxHeight);
  const large = helpAlbumLayout(screenshot, desktop.width, 2, desktop.maxHeight);
  expect(phone.width).toBe(310); expect(desktop.width).toBeLessThanOrEqual(640);
  for (const layout of [small, large]) {
    expect(layout.width / layout.height).toBeCloseTo(1080 / 2400);
    expect(layout.height).toBeLessThanOrEqual(760);
    geometry(layout, 1, desktop.width);
  }
  expect(small.width).toBeGreaterThan(220);
  expect(large.width).toBeGreaterThan(330);
  expect(large.height).toBeGreaterThan(small.height);
});
test('preview bounds follow a narrow chat pane even when its host is a large desktop', () => {
  const narrow = helpMediaPreviewBounds(240), wide = helpMediaPreviewBounds(1100);
  expect(narrow.width).toBe(240); expect(wide.width).toBe(640);
  for (const bounds of [narrow, wide]) {
    for (const ratio of [.45, 1, 1.8, 4]) {
      const layout = helpAlbumLayout(dimensions([ratio]), bounds.width, 2, bounds.maxHeight);
      expect(layout.width).toBeLessThanOrEqual(bounds.width);
      expect(layout.height).toBeLessThanOrEqual(bounds.maxHeight);
      expect(layout.width / layout.height).toBeCloseTo(ratio);
    }
  }
});
test('invalid bounds stay finite, and an explicit tighter image limit never changes proportions', () => {
  for (const width of [0, -50, NaN, Infinity]) {
    const bounds = helpMediaPreviewBounds(width);
    expect(bounds.width).toBe(1); expect(Number.isFinite(bounds.maxHeight)).toBe(true);
  }
  const constrained = helpAlbumLayout(dimensions([.5]), 620, 2, 440);
  expect(constrained).toMatchObject({width: 220, height: 440});
  for (const height of [0, -1, NaN, Infinity, 100000]) {
    const bounded = helpAlbumLayout(dimensions([.5]), 620, 2, height);
    expect(bounded.height).toBeGreaterThan(0); expect(bounded.height).toBeLessThanOrEqual(760);
    expect(bounded.width / bounded.height).toBeCloseTo(.5);
  }
});
