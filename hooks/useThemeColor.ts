import { Colors } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';

type ThemeColors = typeof Colors.light;

export function useThemeColor(
  props: Partial<Record<keyof typeof Colors, string>>,
  colorName: keyof ThemeColors
) {
  const { theme } = useTheme();
  const colorFromProps = props[theme as keyof typeof Colors];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme as keyof typeof Colors][colorName];
  }
}
