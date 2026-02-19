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
    shellBackground: '#EEF4FF',
    topPadding: 18,
    horizontalPaddingMobile: 12,
    horizontalPaddingDesktop: 20,
    maxContentWidth: 1400,
  },
  card: {
    radius: 20,
    borderWidth: 1,
    borderColor: '#D5E0F1',
    background: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.085,
    shadowRadius: 14,
    shadowOffsetX: 0,
    shadowOffsetY: 8,
    minHeightRatio: 0.92,
    paddingHorizontal: 14,
    paddingVertical: 14,
    iconContainerSizeRatio: 0.34,
    iconContainerMinSize: 52,
    iconContainerMaxSize: 106,
    cloudDotSize: 18,
    cloudDotIconSize: 11,
    titleSize: 14,
    descSize: 12,
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
    enterDurationMs: 320,
    enterDelayStepMs: 34,
    hoverDurationMs: 170,
    pressDurationMs: 120,
    hoverLiftPx: 3,
    pressScale: 0.985,
  },
};
