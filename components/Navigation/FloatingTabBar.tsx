import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MotiView } from 'moti';
import React, { useCallback, useContext, useMemo, useState, useEffect } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import type { BottomTabItem, TabAccent } from './bottomTabsConfig';
import type { ThemeKey } from '@/constants/Colors';

const BASE_SIDE_MARGIN = 10;
const BASE_BOTTOM_MARGIN = 10;
const BAR_RADIUS = 22;
const ITEM_RADIUS = 14;
const BLUR_INTENSITY = 36;
const GLASS_PADDING = 8;
const ITEM_VERTICAL_PADDING = 6;
const ICON_SIZE = 20;
const ROW_HEIGHT = ICON_SIZE + ITEM_VERTICAL_PADDING * 2;
const PILL_HEIGHT = ROW_HEIGHT + 8;
const SURFACE_OPACITY_LIGHT = 0.82;
const SURFACE_OPACITY_DARK = 0.6;
const SURFACE_OPACITY_ANDROID_BUMP = 0.08;

export const FLOATING_TAB_BAR_HEIGHT =
  GLASS_PADDING * 2 + ITEM_VERTICAL_PADDING * 2 + ICON_SIZE;
export const FLOATING_TAB_BAR_BOTTOM_OFFSET = BASE_BOTTOM_MARGIN;

const normalizePath = (path: string) => {
  if (!path) return '/';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
};

const isActivePath = (pathname: string, matchPath: string) => {
  const cleanPath = normalizePath(pathname);
  const cleanMatch = normalizePath(matchPath);
  return cleanPath === cleanMatch || cleanPath.startsWith(`${cleanMatch}/`);
};

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

const isAndroid = Platform.OS === 'android';

const resolveTabTint = (
  accent: TabAccent | undefined,
  fallback: string,
  themeKey: ThemeKey
) => {
  if (!accent) return fallback;
  if (typeof accent === 'string') return accent;
  return (
    accent[themeKey] ??
    accent.light ??
    accent.dark ??
    accent.orange ??
    accent.leaderprod ??
    fallback
  );
};

const getActiveBackground = (accent: string, isDark: boolean) =>
  withOpacity(accent, isDark ? 0.28 : 0.2);

type Props = BottomTabBarProps & {
  items: BottomTabItem[];
};

export default function FloatingTabBar({ items, state, navigation, insets }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const setTabBarHeight = useContext(BottomTabBarHeightCallbackContext);
  const [rowWidth, setRowWidth] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const isAppealChat = useMemo(() => {
    const clean = normalizePath(pathname || '');
    if (!clean.startsWith('/services/appeals/')) return false;
    const parts = clean.split('/').filter(Boolean);
    if (parts.length < 3) return false;
    const tail = parts[2];
    return tail !== 'new' && tail !== 'index';
  }, [pathname]);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  const { theme } = useTheme();
  const themeKey = (theme || 'light') as ThemeKey;

  const isDark = theme === 'dark';
  const borderColor = withOpacity(textColor, isDark ? 0.12 : 0.18);
  const inactiveText = withOpacity(textColor, isDark ? 0.68 : 0.72);
  const bottomOffset = BASE_BOTTOM_MARGIN + insets.bottom;
  const sideOffset = BASE_SIDE_MARGIN + Math.max(insets.left, insets.right);

  const routesByName = useMemo(() => {
    return new Map(state.routes.map((route) => [route.name, route]));
  }, [state.routes]);

  const activeIndex = useMemo(
    () => items.findIndex((item) => isActivePath(pathname, item.matchPath)),
    [items, pathname]
  );
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
  const activeAccent = resolveTabTint(
    activeItem?.activeTint,
    tintColor,
    themeKey
  );
  const activeBackground = getActiveBackground(activeAccent, isDark);
  const itemWidthPercent = items.length > 0 ? 100 / items.length : 100;
  const pillInset = 2;
  const itemWidth = rowWidth > 0 ? rowWidth / Math.max(items.length, 1) : 0;
  const pillWidth = Math.max(itemWidth - pillInset * 2, 0);
  const pillTranslate = itemWidth * Math.max(activeIndex, 0) + pillInset;
  const pillTop = (ROW_HEIGHT - PILL_HEIGHT) / 2;
  const baseSurfaceOpacity = isDark ? SURFACE_OPACITY_DARK : SURFACE_OPACITY_LIGHT;
  const surfaceOverlayOpacity = Math.min(
    baseSurfaceOpacity + (isAndroid ? SURFACE_OPACITY_ANDROID_BUMP : 0),
    0.95
  );
  const surfaceColor = withOpacity(backgroundColor, surfaceOverlayOpacity);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      // Maintain accurate height for useBottomTabBarHeight consumers.
      setTabBarHeight?.(event.nativeEvent.layout.height);
    },
    [setTabBarHeight]
  );

  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    setRowWidth(event.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (isAppealChat) {
      setTabBarHeight?.(0);
    }
  }, [isAppealChat, setTabBarHeight]);

  if (isAppealChat) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="box-none"
        style={[styles.positioner, { left: sideOffset, right: sideOffset, bottom: bottomOffset }]}
      >
        <MotiView
          animate={{
            opacity: keyboardVisible ? 0 : 1,
            translateY: keyboardVisible ? 18 : 0,
          }}
          transition={{ type: 'timing', duration: 180 }}
          pointerEvents={keyboardVisible ? 'none' : 'auto'}
          style={styles.barWrap}
        >
          <View style={styles.shadowShell} onLayout={handleLayout}>
            <LiquidGlassSurface
              blurTint={isDark ? 'dark' : 'light'}
              blurIntensity={BLUR_INTENSITY}
              overlayColor={surfaceColor}
              borderColor={borderColor}
              webBackdropFilter="blur(22px) saturate(160%)"
              style={styles.glassShell}
            >
            <View style={styles.row} onLayout={handleRowLayout}>
              {pillWidth > 0 ? (
                <MotiView
                  pointerEvents="none"
                  animate={{
                    translateX: pillTranslate,
                    opacity: activeIndex >= 0 ? 1 : 0,
                    backgroundColor: activeBackground,
                  }}
                  transition={{ type: 'timing', duration: 240 }}
                  style={[
                    styles.activePill,
                    {
                      width: pillWidth,
                      left: 0,
                      top: pillTop,
                      height: PILL_HEIGHT,
                    },
                  ]}
                />
              ) : null}
              {items.map((item) => {
                const route = routesByName.get(item.routeName);
                if (!route) return null;
                const isActive = isActivePath(pathname, item.matchPath);
                const activeTint = resolveTabTint(
                  item.activeTint,
                  tintColor,
                  themeKey
                );
                const inactiveTint = resolveTabTint(
                  item.inactiveTint,
                  inactiveText,
                  themeKey
                );
                const onPress = () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });

                  if (!isActive && !event.defaultPrevented) {
                    if (Platform.OS !== 'web') {
                      void Haptics.selectionAsync();
                    }
                    router.push(item.href);
                  }
                };

                const onLongPress = () => {
                  navigation.emit({ type: 'tabLongPress', target: route.key });
                };

                  return (
                    <Pressable
                      key={item.routeName}
                      accessibilityRole="tab"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: isActive }}
                      onPress={onPress}
                      onLongPress={onLongPress}
                      style={[styles.item, { width: `${itemWidthPercent}%` }]}
                    >
                      {({ pressed, hovered }) => (
                        <MotiView
                          style={styles.itemContent}
                          animate={{
                            scale: pressed ? 0.94 : hovered ? 1.04 : 1,
                            opacity: pressed ? 0.9 : 1,
                          }}
                          transition={{ type: 'timing', duration: 120 }}
                        >
                          <View style={styles.iconWrap}>
                            <Ionicons
                              name={item.icon}
                              size={ICON_SIZE}
                              color={inactiveTint}
                            />
                            <MotiView
                              pointerEvents="none"
                              animate={{
                                opacity: isActive ? 1 : 0,
                                scale: isActive ? 1 : 0.92,
                              }}
                              transition={{ type: 'timing', duration: 180 }}
                              style={styles.activeIconOverlay}
                            >
                              <Ionicons
                                name={item.icon}
                                size={ICON_SIZE}
                                color={activeTint}
                              />
                            </MotiView>
                          </View>
                      </MotiView>
                    )}
                  </Pressable>
                );
              })}
            </View>
            </LiquidGlassSurface>
          </View>
        </MotiView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
  },
  shadowShell: {
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: BAR_RADIUS,
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
    borderRadius: BAR_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: GLASS_PADDING,
    paddingVertical: GLASS_PADDING,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    height: ROW_HEIGHT,
  },
  barWrap: {
    width: '100%',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: ITEM_VERTICAL_PADDING,
    paddingHorizontal: 4,
    borderRadius: ITEM_RADIUS,
    ...(Platform.select({
      web: { cursor: 'pointer' } as ViewStyle,
    }) ?? {}),
  },
  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    position: 'absolute',
    borderRadius: ITEM_RADIUS,
  },
  iconWrap: {
    width: ICON_SIZE + 6,
    height: ICON_SIZE + 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
