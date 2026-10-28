export type HelpAlbumDimensions = { width?: number | null; height?: number | null };
export type HelpAlbumTile = { index: number; x: number; y: number; width: number; height: number };
export type HelpAlbumLayout = { width: number; height: number; items: HelpAlbumTile[]; pattern: string };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function helpImageAspectRatio(item: HelpAlbumDimensions): number | null {
  return typeof item.width === 'number' && typeof item.height === 'number'
    && Number.isFinite(item.width) && Number.isFinite(item.height) && item.width > 0 && item.height > 0
    ? clamp(item.width / item.height, .05, 20) : null;
}

function rows(ratios: number[], counts: number[], width: number, gap: number): HelpAlbumLayout {
  const items: HelpAlbumTile[] = []; let index = 0, y = 0;
  for (const count of counts) {
    // Extreme panoramas and tall scans stay usable thumbnails. The full image
    // remains available in the viewer; only album thumbnails are center-cropped.
    const weights = ratios.slice(index, index + count).map(ratio => clamp(ratio, .62, 1.95));
    const sum = weights.reduce((total, ratio) => total + ratio, 0);
    const usable = width - gap * (count - 1);
    const height = clamp(usable / sum, width * .18, width * .72);
    let x = 0;
    weights.forEach((weight, column) => {
      const tileWidth = column === count - 1 ? width - x : usable * weight / sum;
      items.push({ index: index++, x, y, width: tileWidth, height }); x += tileWidth + gap;
    });
    y += height + gap;
  }
  return { width, height: y - gap, items, pattern: counts.join('-') };
}

function fitHeight(layout: HelpAlbumLayout, maxHeight: number, gap: number): HelpAlbumLayout {
  if (layout.height <= maxHeight) return layout;
  const rowTops = [...new Set(layout.items.map(tile => tile.y))].sort((a, b) => a - b);
  const rowHeights = rowTops.map(top => layout.items.find(tile => tile.y === top)!.height);
  const scale = (maxHeight - gap * (rowTops.length - 1)) / rowHeights.reduce((sum, height) => sum + height, 0);
  const tops = new Map<number, number>(); let y = 0;
  rowTops.forEach((top, row) => { tops.set(top, y); y += rowHeights[row] * scale + gap; });
  return { ...layout, height: maxHeight, items: layout.items.map(tile => ({ ...tile, y: tops.get(tile.y)!, height: tile.height * scale })) };
}

function side(ratios: number[], width: number, gap: number): HelpAlbumLayout {
  const rightRatios = ratios.slice(1).map(value => clamp(value, .6, 2.1));
  const inverse = rightRatios.reduce((sum, ratio) => sum + 1 / ratio, 0);
  const idealHeight = (width - gap + gap * (rightRatios.length - 1) / inverse) / (ratios[0] + 1 / inverse);
  const height = clamp(idealHeight, width * .72, width * 1.25);
  const left = clamp(height * ratios[0], width * .38, width * .64), right = width - left - gap;
  const items: HelpAlbumTile[] = [{ index: 0, x: 0, y: 0, width: left, height }];
  const usable = height - gap * (rightRatios.length - 1); let y = 0;
  rightRatios.forEach((ratio, index) => {
    const tileHeight = index === rightRatios.length - 1 ? height - y : usable / ratio / inverse;
    items.push({ index: index + 1, x: left + gap, y, width: right, height: tileHeight }); y += tileHeight + gap;
  });
  return { width, height, items, pattern: `side-${rightRatios.length}` };
}

function partitions(count: number, prefix: number[] = []): number[][] {
  if (!count) return prefix.length >= 2 ? [prefix] : [];
  if (prefix.length === 4) return [];
  return Array.from({ length: Math.min(4, count) }, (_, i) => i + 1)
    .flatMap(size => partitions(count - size, [...prefix, size]));
}

function cost(layout: HelpAlbumLayout, ratios: number[], counts: number[]): number {
  const target = layout.width * (ratios.length <= 6 ? 1.08 : 1.35);
  let value = Math.pow((layout.height - target) / target, 2) * 2;
  for (const tile of layout.items) {
    const crop = Math.log((tile.width / tile.height) / ratios[tile.index]);
    value += crop * crop / ratios.length;
    // Avoid a tiny strip or a very narrow hit target even when it mathematically
    // improves the aspect fit of its neighbouring panorama.
    value += Math.pow(Math.max(0, .19 - tile.width / layout.width), 2) * 60;
    value += Math.pow(Math.max(0, .22 - tile.height / layout.width), 2) * 35;
  }
  for (let row = 0; row < counts.length; row++) {
    if (counts[row] === 1) value += .13;
    if (row && counts[row] < counts[row - 1]) value += .045;
  }
  return value;
}

/**
 * Aspect-aware, order-preserving album geometry for 1–10 photos. Composition
 * principles were checked against Telegram Android GroupedMessages.calculate:
 * https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/messenger/MessageObject.java
 * This is an independent implementation with a crop/size cost and dp geometry.
 */
export function helpAlbumLayout(dimensions: HelpAlbumDimensions[], availableWidth: number, spacing = 2): HelpAlbumLayout {
  const width = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 1;
  const gap = clamp(Number.isFinite(spacing) ? spacing : 2, 0, width / 16);
  const ratios = dimensions.slice(0, 10).map(item => helpImageAspectRatio(item) ?? 1);
  if (!ratios.length) return { width, height: 0, items: [], pattern: 'empty' };
  if (ratios.length === 1) {
    const height = Math.min(350, width / ratios[0]), singleWidth = Math.min(width, height * ratios[0]);
    return { width: singleWidth, height, items: [{ index: 0, x: 0, y: 0, width: singleWidth, height }], pattern: 'single' };
  }
  if (ratios.length === 2) {
    const stacked = ratios.every(ratio => ratio > 1.55) && Math.abs(Math.log(ratios[0] / ratios[1])) < .3;
    return fitHeight(rows(ratios, stacked ? [1, 1] : [2], width, gap), width * 1.18, gap);
  }
  if (ratios.length === 3) return ratios[0] < .85 ? side(ratios, width, gap) : fitHeight(rows(ratios, [1, 2], width, gap), width * 1.25, gap);
  if (ratios.length === 4) {
    if (ratios[0] < .8) return side(ratios, width, gap);
    return fitHeight(rows(ratios, ratios[0] > 1.2 ? [1, 3] : [2, 2], width, gap), width * 1.25, gap);
  }
  let best: HelpAlbumLayout | undefined, bestCost = Infinity;
  for (const counts of partitions(ratios.length)) {
    const candidate = fitHeight(rows(ratios, counts, width, gap), width * 1.5, gap);
    const score = cost(candidate, ratios, counts);
    if (score < bestCost) { best = candidate; bestCost = score; }
  }
  return best!;
}
