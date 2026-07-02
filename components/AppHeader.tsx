import { useTheme } from '@/context/ThemeContext';
import { useNotificationViewport } from '@/context/NotificationViewportContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import AppStatusIndicator from '@/src/shared/ui/AppStatusIndicator';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import React from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  tight?: boolean;
  dense?: boolean;
  leftSlot?: React.ReactNode;
  titleSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
  surfaceVisible?: boolean;
  entranceMotion?: 'slide' | 'fade' | 'none';
  horizontalPadding?: number;
  variant?: 'default' | 'document';
  showServerStatus?: boolean;
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
  tight = false,
  dense = false,
  leftSlot,
  titleSlot,
  rightSlot,
  bottomSlot,
  surfaceVisible = true,
  entranceMotion = 'slide',
  horizontalPadding,
  variant = 'default',
  showServerStatus = true,
}: Props) {
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { setHeaderBottomOffset } = useNotificationViewport();
  const isDark = theme === 'dark';
  const isAndroid = Platform.OS === 'android';
  const isMobileWidth = width < 720;
  const isDocument = variant === 'document';

  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'secondaryText' as any);

  const sidePadding = horizontalPadding ?? (Platform.OS === 'web' ? (tight ? 12 : 16) : 12);
  const topPadding = Platform.OS === 'web' ? HEADER_TOP_PADDING_WEB : top + HEADER_TOP_PADDING_NATIVE_EXTRA;
  const useCompactHeaderText = tight || compact || dense || isMobileWidth;
  const titleSize = isDocument ? 15 : dense ? 15 : useCompactHeaderText ? 16 : Platform.OS === 'web' ? 18 : 19;
  const subtitleSize = useCompactHeaderText ? 11 : 12;
  const titleLines = useCompactHeaderText ? 1 : 2;
  const subtitleLines = useCompactHeaderText ? 1 : compact ? 1 : 2;

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
  const handleWrapLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      setHeaderBottomOffset(y + height);
    },
    [setHeaderBottomOffset]
  );

  React.useEffect(() => {
    return () => {
      setHeaderBottomOffset(0);
    };
  }, [setHeaderBottomOffset]);

  const headerContent = (
    <View style={[styles.card, compact && styles.cardCompact, tight && styles.cardTight, dense && styles.cardDense, isDocument && styles.cardDocument]}>
      <View style={[styles.row, tight && styles.rowTight, dense && styles.rowDense, isDocument && styles.rowDocument]}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            disabled={!onBack}
            onPress={onBack}
            style={({ pressed }) => [
              styles.backBtn,
              dense && styles.backBtnDense,
              { backgroundColor: pressed ? withOpacity(textColor, isDark ? 0.24 : 0.14) : backBg },
            ]}
          >
            <Ionicons name="arrow-back" size={18} color={textColor} />
          </Pressable>
        ) : null}

        {leftSlot}

        {titleSlot ? (
          <View style={styles.customTitleWrap}>{titleSlot}</View>
        ) : (
          <>
            <LinearGradient
              colors={['#4F46E5', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.iconBadge, dense && styles.iconBadgeDense]}
            >
              <Ionicons name={icon as any} size={dense ? 16 : 18} color="#fff" />
            </LinearGradient>

            <View style={styles.textWrap}>
              <Text
                style={[styles.title, tight && styles.titleTight, { color: textColor, fontSize: titleSize }]}
                numberOfLines={titleLines}
                ellipsizeMode="tail"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.subtitle, tight && styles.subtitleTight, { color: secondary, fontSize: subtitleSize }]}
                  numberOfLines={subtitleLines}
                  ellipsizeMode="tail"
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </>
        )}

        <View style={[styles.rightCluster, tight && styles.rightClusterTight, dense && styles.rightClusterDense]}>
          {showServerStatus ? <AppStatusIndicator /> : null}
          {rightSlot}
        </View>
      </View>

      {bottomSlot ? <View style={[styles.bottomSlot, tight && styles.bottomSlotTight, isDocument && styles.bottomSlotDocument]}>{bottomSlot}</View> : null}
    </View>
  );

  const shellContent = isDocument ? (
    <View style={styles.documentShell}>
      <LiquidGlassSurface
        borderColor={borderColor}
        overlayColor={surfaceOverlayColor}
        blurTint={blurTint}
        blurIntensity={blurIntensity}
        webBackdropFilter="blur(22px) saturate(160%)"
        style={styles.documentGlassShell}
      >
        {headerContent}
      </LiquidGlassSurface>
    </View>
  ) : surfaceVisible ? (
    <View style={[styles.shadowShell, dense && styles.shadowShellDense]}>
      <LiquidGlassSurface
        borderColor={borderColor}
        overlayColor={surfaceOverlayColor}
        blurTint={blurTint}
        blurIntensity={blurIntensity}
        webBackdropFilter="blur(22px) saturate(160%)"
        style={[styles.glassShell, dense && styles.glassShellDense]}
      >
        {headerContent}
      </LiquidGlassSurface>
    </View>
  ) : (
    <View
      style={[
        styles.plainShell,
        dense && styles.plainShellDense,
        {
          borderColor,
          backgroundColor: surfaceOverlayColor,
        },
      ]}
    >
      {headerContent}
    </View>
  );

  const animatedShell =
    entranceMotion === 'none' ? (
      shellContent
    ) : (
      <MotiView
        from={entranceMotion === 'fade' ? { opacity: 0 } : { opacity: 0, translateY: -8 }}
        animate={entranceMotion === 'fade' ? { opacity: 1 } : { opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: entranceMotion === 'fade' ? 160 : 220 }}
      >
        {shellContent}
      </MotiView>
    );

  return (
    <View
      pointerEvents="box-none"
      onLayout={handleWrapLayout}
      style={[styles.wrap, tight && styles.wrapTight, isDocument && styles.wrapDocument, { paddingTop: topPadding, paddingHorizontal: sidePadding }]}
    >
      {animatedShell}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 8,
  },
  wrapTight: {
    paddingBottom: 8,
  },
  wrapDocument: {
    paddingBottom: 0,
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
  shadowShellDense: {
    borderRadius: 14,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    ...(Platform.select({
      web: {
        boxShadow: '0 4px 10px rgba(15, 23, 42, 0.14)',
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
  glassShellDense: {
    borderRadius: 14,
  },
  plainShell: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: HEADER_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  plainShellDense: {
    borderRadius: 14,
  },
  card: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardCompact: {
    paddingVertical: 10,
  },
  cardTight: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cardDense: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cardDocument: {
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTight: {
    gap: 8,
  },
  rowDense: {
    gap: 8,
  },
  rowDocument: {
    minHeight: 38,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  customTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightClusterTight: {
    gap: 6,
  },
  rightClusterDense: {
    gap: 6,
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
  backBtnDense: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeDense: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  title: {
    fontWeight: '800',
    lineHeight: 23,
  },
  titleTight: {
    lineHeight: 19,
  },
  subtitle: {
    marginTop: 2,
    fontWeight: '600',
    opacity: 0.95,
    lineHeight: 15,
  },
  subtitleTight: {
    marginTop: 1,
    lineHeight: 14,
  },
  bottomSlot: {
    marginTop: 10,
  },
  bottomSlotTight: {
    marginTop: 6,
  },
  bottomSlotDocument: {
    marginTop: 8,
  },
  documentShell: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
    ...(Platform.select({
      web: {
        boxShadow: '0 8px 18px rgba(15, 23, 42, 0.14)',
      } as ViewStyle,
    }) ?? {}),
  },
  documentGlassShell: {
    borderRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
});
