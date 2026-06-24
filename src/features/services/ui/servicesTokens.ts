export type ServiceDensity = 'medium';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function withOpacity(color: string, opacity: number) {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return color;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const safeOpacity = clamp(opacity, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

export const servicesTokens = {
  density: 'medium' as ServiceDensity,
  page: {
    shellBackground: '#F8FAFC',
    topPadding: 12,
    horizontalPaddingMobile: 14,
    horizontalPaddingDesktop: 20,
    maxContentWidth: 1400,
  },
  card: {
    radius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    background: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    minHeight: 108,
    minHeightRatio: 0.3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    iconContainerSizeRatio: 0.24,
    iconContainerMinSize: 48,
    iconContainerMaxSize: 52,
    iconRadius: 12,
    cloudDotSize: 18,
    cloudDotIconSize: 11,
    titleSize: 15,
    titleLineHeight: 19,
    descSize: 13,
    descLineHeight: 18,
    ctaHeight: 31,
    ctaRadius: 999,
  },
  quick: {
    cardRadius: 18,
    cardMinHeight: 122,
    cardPadding: 13,
    iconWrapSize: 34,
    iconSize: 19,
    cloudSize: 16,
  },
  shell: {
    panelRadius: 18,
    panelBorderColor: '#D7E3F6',
    panelBackground: '#F8FBFF',
    panelPadding: 12,
  },
  states: {
    disabledOpacity: 0.62,
    disabledBackground: '#F4F7FC',
    disabledBorder: '#CBD5E1',
    disabledText: '#64748B',
  },
  motion: {
    enterDurationMs: 180,
    enterDelayStepMs: 18,
    hoverDurationMs: 170,
    pressDurationMs: 120,
    hoverLiftPx: 0,
    pressScale: 0.985,
  },
};
