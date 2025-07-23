// Colors.ts

export type ThemeKey = 'light' | 'dark' | 'orange' | 'leaderprod';

const tintColorLight = '#007AFF';
const tintColorDark = '#0A84FF';

export const Colors: Record<
  ThemeKey,
  {
    text: string;
    background: string;
    tint: string;
    icon: string;
    tabIconDefault: string;
    tabIconSelected: string;
    inputBackground: string;
    inputBorder: string;
    button: string;
    buttonText: string;
    buttonDisabled: string;
    secondaryText: string;
    error: string;
    disabledText: string;
    cardBackground: string;
    placeholder: string;
    shadow: string;
  }
> = {
  light: {
    text: '#1C1C1E',
    background: '#F9FAFB',
    tint: tintColorLight,
    icon: '#6C757D',
    tabIconDefault: '#ADB5BD',
    tabIconSelected: tintColorLight,
    inputBackground: '#FFFFFF',
    inputBorder: '#CED4DA',
    button: '#007AFF',
    buttonText: '#FFFFFF',
    buttonDisabled: '#B0C4DE',
    secondaryText: '#5F6368',
    error: '#E53935',
    disabledText: '#AAB0B6',
    cardBackground: '#FFFFFF',
    placeholder: '#6B7280',
    shadow: '#000000',
  },
  dark: {
    text: '#F4F4F5',
    background: '#0F0F11',
    tint: '#4F9CFF',
    icon: '#A1A1AA',
    tabIconDefault: '#5E6470',
    tabIconSelected: '#4F9CFF',
    inputBackground: '#1A1A1E',
    inputBorder: '#2D2F34',
    button: '#4F9CFF',
    buttonText: '#FFFFFF',
    buttonDisabled: '#3A3F4B',
    secondaryText: '#8B8B92',
    error: '#FF5C5C',
    disabledText: '#5B5B60',
    cardBackground: '#16171A',
    placeholder: '#A0AEC0',
    shadow: '#FFFFFF',
  },
  orange: {
    text: '#2D2D2D',
    background: '#FFF4E6',
    tint: '#FF6B00',
    icon: '#FF6B00',
    tabIconDefault: '#FFB347',
    tabIconSelected: '#FF6B00',
    inputBackground: '#FFF0D9',
    inputBorder: '#FFB347',
    button: '#FF6B00',
    buttonText: '#FFFFFF',
    buttonDisabled: '#FFD8A8',
    secondaryText: '#A0612C',
    error: '#D32F2F',
    disabledText: '#C49A6C',
    cardBackground: '#FFE8CC',
    placeholder: '#4B5563',
    shadow: '#000000',
  },
  leaderprod: {
    text: '#1C1C1C',
    background: '#F9FAF8',
    tint: '#FFA000',
    icon: '#5EBF4D',
    tabIconDefault: '#A0A0A0',
    tabIconSelected: '#FFA000',
    inputBackground: '#FFFFFF',
    inputBorder: '#DADADA',
    button: '#FFA000',
    buttonText: '#FFFFFF',
    buttonDisabled: '#FFD580',
    secondaryText: '#4E5D52',
    error: '#E53935',
    disabledText: '#B0B0B0',
    cardBackground: '#FFFFFF',
    placeholder: '#9CA3AF',
    shadow: '#000000',
  },
};

// Градиенты — массивы строго из двух цветов (кортежи)
export const gradientColors: Record<ThemeKey, readonly string[]> = {
  light: ['#FFFFFF', '#007AFF'],
  dark: ['#000000', '#0A84FF'],
  orange: ['#FFF4E6', '#FF6B00'],
  leaderprod: ['#5EBF4D', '#FFA000', '#F9FAF8'], // Три цвета
} as const;

