import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_RADIUS = 22;
const BLUR_INTENSITY = 36;
const SURFACE_OPACITY_LIGHT = 0.82;
const SURFACE_OPACITY_DARK = 0.6;
const SURFACE_OPACITY_ANDROID_BUMP = 0.08;
const HEADER_TOP_PADDING_WEB = 10;
const HEADER_TOP_PADDING_NATIVE_EXTRA = 4;
const HEADER_WRAP_BOTTOM = 8;
const HEADER_CONTENT_GAP = 8;

const withOpacity = (color: string, opacity: number) => {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

type Props = {
  title: string;
  subtitle?: string;
  icon: string;
  showBack?: boolean;
  onBack?: () => void;
  compact?: boolean;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
};

type HeaderOffsetOptions = {
  compact?: boolean;
  hasSubtitle?: boolean;
  extraGap?: number;
};

export function getAppHeaderOverlayOffset(
  topInset: number,
  { compact = false, hasSubtitle = false, extraGap = HEADER_CONTENT_GAP }: HeaderOffsetOptions = {}
) {
  const topPadding = Platform.OS === 'web' ? HEADER_TOP_PADDING_WEB : topInset + HEADER_TOP_PADDING_NATIVE_EXTRA;
  // Keep header over content and only reserve a small page inset.
  // Full header height creates a visible "background strip" above content.
  const compactInset = compact ? 8 : 10;
  const subtitleInset = hasSubtitle ? 4 : 0;
  return Math.round(topPadding + HEADER_WRAP_BOTTOM + compactInset + subtitleInset + extraGap);
}

export function AppHeader({
  title,
  subtitle,
  icon,
  showBack = true,
  onBack,
  compact = false,
  leftSlot,
  rightSlot,
  bottomSlot,
}: Props) {
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isAndroid = Platform.OS === 'android';

  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'secondaryText' as any);

  const sidePadding = Platform.OS === 'web' ? 16 : 12;
  const topPadding = Platform.OS === 'web' ? HEADER_TOP_PADDING_WEB : top + HEADER_TOP_PADDING_NATIVE_EXTRA;
  const titleSize = compact ? 17 : Platform.OS === 'web' ? 18 : 19;
  const subtitleSize = compact ? 11 : 12;

  const baseSurfaceOpacity = isDark ? SURFACE_OPACITY_DARK : SURFACE_OPACITY_LIGHT;
  const surfaceOverlayOpacity = Math.min(
    baseSurfaceOpacity + (isAndroid ? SURFACE_OPACITY_ANDROID_BUMP : 0),
    0.95
  );
  const surfaceOverlayColor = withOpacity(background, surfaceOverlayOpacity);
  const blurIntensity = BLUR_INTENSITY;
  const blurTint = isDark ? 'dark' : 'light';
  const borderColor = withOpacity(textColor, isDark ? 0.12 : 0.18);
  const backBg = withOpacity(textColor, isDark ? 0.16 : 0.08);

  const headerContent = (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            disabled={!onBack}
            onPress={onBack}
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: pressed ? withOpacity(textColor, isDark ? 0.24 : 0.14) : backBg },
            ]}
          >
            <Ionicons name="arrow-back" size={18} color={textColor} />
          </Pressable>
        ) : null}

        {leftSlot}

        <LinearGradient
          colors={['#4F46E5', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBadge}
        >
          <Ionicons name={icon as any} size={18} color="#fff" />
        </LinearGradient>

        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: textColor, fontSize: titleSize }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: secondary, fontSize: subtitleSize }]}
              numberOfLines={compact ? 1 : 2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightSlot}
      </View>

      {bottomSlot ? <View style={styles.bottomSlot}>{bottomSlot}</View> : null}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: topPadding, paddingHorizontal: sidePadding }]}>
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 220 }}
      >
        <View style={styles.shadowShell}>
          <LiquidGlassSurface
            borderColor={borderColor}
            overlayColor={surfaceOverlayColor}
            blurTint={blurTint}
            blurIntensity={blurIntensity}
            webBackdropFilter="blur(22px) saturate(160%)"
            style={styles.glassShell}
          >
            {headerContent}
          </LiquidGlassSurface>
        </View>
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 8,
  },
  shadowShell: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: HEADER_RADIUS,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    ...(Platform.select({
      web: {
        boxShadow: '0 14px 28px rgba(0, 0, 0, 0.22)',
      } as ViewStyle,
    }) ?? {}),
  },
  glassShell: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: HEADER_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  card: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardCompact: {
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    lineHeight: 23,
  },
  subtitle: {
    marginTop: 2,
    fontWeight: '600',
    opacity: 0.95,
  },
  bottomSlot: {
    marginTop: 10,
  },
});
