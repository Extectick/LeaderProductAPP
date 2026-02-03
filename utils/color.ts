type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB | null {
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;
  const full = cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function mixHex(base: string, mixWith: string, amount: number) {
  const b = hexToRgb(base);
  const m = hexToRgb(mixWith);
  if (!b || !m) return base;
  const r = Math.round(b.r + (m.r - b.r) * amount);
  const g = Math.round(b.g + (m.g - b.g) * amount);
  const b2 = Math.round(b.b + (m.b - b.b) * amount);
  return `rgb(${r}, ${g}, ${b2})`;
}

export function tintColor(base: string, amount = 0.12) {
  return mixHex(base, '#ffffff', amount);
}

export function shadeColor(base: string, amount = 0.12) {
  return mixHex(base, '#000000', amount);
}
