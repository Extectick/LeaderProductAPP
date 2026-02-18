import { tabScreens } from '@/constants/tabScreens';
import type { ThemeKey } from '@/constants/Colors';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname, useRouter, type RelativePathString } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { bottomTabItems, type TabAccent } from './bottomTabsConfig';
import {
  WEB_SIDEBAR_COLLAPSE_STORAGE_KEY,
  WEB_SIDEBAR_COLLAPSED_WIDTH,
  WEB_SIDEBAR_EXPANDED_WIDTH,
  emitWebSidebarState,
  getPersistedWebSidebarCollapsed,
} from './sidebarEvents';

const DEFAULT_ICON_BG = '#E8EDF6';

function withOpacity(color: string, opacity: number) {
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
  if (Number.isNaN(int)) return color;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function resolveTabTint(
  accent: TabAccent | undefined,
  fallback: string,
  themeKey: ThemeKey
) {
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
}

export default function WebSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => getPersistedWebSidebarCollapsed());
  const router = useRouter();
  const pathname = usePathname();
  const widthAnim = useRef(
    new Animated.Value(collapsed ? WEB_SIDEBAR_COLLAPSED_WIDTH : WEB_SIDEBAR_EXPANDED_WIDTH)
  ).current;
  const collapsedRef = useRef(collapsed);
  const { isAdmin } = useIsAdmin();
  const { theme } = useTheme();
  const themeKey = (theme || 'light') as ThemeKey;

  const bgColor = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const secondaryText = useThemeColor({}, 'secondaryText');
  const tintColor = useThemeColor({}, 'tint');
  const borderColor = useThemeColor({}, 'inputBorder');

  const emitSidebarState = useCallback(
    (phase: 'start' | 'progress' | 'end', width: number, nextCollapsed = collapsedRef.current) => {
      emitWebSidebarState({
        phase,
        collapsed: nextCollapsed,
        width: Math.max(0, Math.round(width)),
      });
    },
    []
  );

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  useEffect(() => {
    const listenerId = widthAnim.addListener(({ value }) => {
      emitSidebarState('progress', value);
    });
    return () => {
      widthAnim.removeListener(listenerId);
    };
  }, [emitSidebarState, widthAnim]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WEB_SIDEBAR_COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    const targetWidth = collapsed ? WEB_SIDEBAR_COLLAPSED_WIDTH : WEB_SIDEBAR_EXPANDED_WIDTH;
    widthAnim.stopAnimation((currentWidth) => {
      emitSidebarState('start', currentWidth, collapsed);
      Animated.timing(widthAnim, {
        toValue: targetWidth,
        duration: 220,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          emitSidebarState('end', targetWidth, collapsed);
          return;
        }
        widthAnim.stopAnimation((lastWidth) => {
          emitSidebarState('end', lastWidth, collapsedRef.current);
        });
      });
    });
  }, [collapsed, emitSidebarState, widthAnim]);

  const labelOpacity = widthAnim.interpolate({
    inputRange: [84, 264],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const labelTranslateX = widthAnim.interpolate({
    inputRange: [84, 264],
    outputRange: [-8, 0],
    extrapolate: 'clamp',
  });

  const getIsActive = (path: string) => {
    if (!pathname) return false;
    if (path === '/home') return pathname === '/home' || pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const visibleItems = tabScreens.filter(({ sidebar }) => (sidebar.path === '/admin' ? isAdmin : true));
  const activeSidebarPath =
    visibleItems.find(({ sidebar }) => getIsActive(sidebar.path))?.sidebar.path || '/home';
  const activeTabMeta = bottomTabItems.find((item) => item.matchPath === activeSidebarPath);
  const activeAccent = resolveTabTint(activeTabMeta?.activeTint, tintColor, themeKey);

  return (
    <Animated.View
      style={[
        styles.sidebar,
        {
          width: widthAnim,
          backgroundColor: bgColor,
          borderRightColor: borderColor,
        },
      ]}
    >
      <View style={styles.brandBlock}>
        <Pressable
          onPress={() => router.push('/home')}
          style={(state: any) => [styles.brandPressable, state.hovered ? styles.brandHovered : null]}
        >
          <View style={[styles.brandIcon, { borderColor: `${tintColor}33` }]}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.brandLogo}
              contentFit="contain"
            />
          </View>
          <Animated.View
            style={[
              styles.brandTextWrap,
              { opacity: labelOpacity, transform: [{ translateX: labelTranslateX }] },
            ]}
          >
            <Text numberOfLines={1} style={[styles.brandTitle, { color: textColor }]}>
              Лидер Продукт
            </Text>
            <Text numberOfLines={1} style={[styles.brandSub, { color: secondaryText }]}>
              Рабочая панель
            </Text>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={() => setCollapsed((prev) => !prev)}
          style={(state: any) => [
            styles.collapseBtn,
            {
              borderColor: borderColor,
              backgroundColor: state.hovered ? `${tintColor}12` : 'transparent',
            },
            state.pressed ? styles.collapseBtnPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          <Ionicons
            name={collapsed ? 'chevron-forward-outline' : 'chevron-back-outline'}
            size={16}
            color={textColor}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.menuScroll}
        contentContainerStyle={styles.menuScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {visibleItems.map(({ sidebar }) => {
          const isActive = getIsActive(sidebar.path);
          const tabMeta = bottomTabItems.find((item) => item.matchPath === sidebar.path);
          const itemActiveAccent = resolveTabTint(tabMeta?.activeTint, tintColor, themeKey);
          const itemInactiveAccent = resolveTabTint(tabMeta?.inactiveTint, '#334155', themeKey);
          return (
            <Pressable
              key={sidebar.path}
              onPress={() => router.push(sidebar.path as RelativePathString)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={(state: any) => [
                styles.item,
                {
                  borderColor: isActive
                    ? withOpacity(itemActiveAccent, 0.45)
                    : state.hovered
                      ? withOpacity(itemActiveAccent, 0.25)
                      : borderColor,
                  backgroundColor: isActive
                    ? withOpacity(itemActiveAccent, 0.15)
                    : state.hovered
                      ? withOpacity(itemActiveAccent, 0.08)
                      : 'transparent',
                },
                state.pressed ? styles.itemPressed : null,
              ]}
            >
              <View
                style={[
                  styles.iconBox,
                  {
                    backgroundColor: isActive
                      ? itemActiveAccent
                      : DEFAULT_ICON_BG,
                  },
                ]}
              >
                <Ionicons
                  name={sidebar.icon as any}
                  size={18}
                  color={isActive ? '#FFFFFF' : itemInactiveAccent}
                />
              </View>

              <Animated.View
                style={[
                  styles.itemTextWrap,
                  {
                    opacity: labelOpacity,
                    transform: [{ translateX: labelTranslateX }],
                  },
                ]}
              >
                <Text numberOfLines={1} style={[styles.label, { color: textColor }]}>
                  {sidebar.label}
                </Text>
                <Text numberOfLines={1} style={[styles.itemSub, { color: secondaryText }]}>
                  {sidebar.path === '/home'
                    ? 'Сводка дня'
                    : sidebar.path === '/services'
                      ? 'Модули и доступы'
                      : sidebar.path === '/tasks'
                        ? 'Мои поручения'
                        : sidebar.path === '/profile'
                          ? 'Профиль и настройки'
                          : 'Управление системой'}
                </Text>
              </Animated.View>

              {isActive ? <View style={[styles.activeLine, { backgroundColor: itemActiveAccent }]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: borderColor }]}>
        <Animated.View
          style={[
            styles.footerTextWrap,
            {
              opacity: labelOpacity,
              transform: [{ translateX: labelTranslateX }],
            },
          ]}
        >
          <Text numberOfLines={1} style={[styles.footerTitle, { color: textColor }]}>
            Desktop Navigation
          </Text>
          <Text numberOfLines={1} style={[styles.footerSub, { color: secondaryText }]}>
            Быстрый доступ к разделам
          </Text>
        </Animated.View>
        <View style={[styles.footerDot, { backgroundColor: activeAccent }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderRightWidth: 1,
    paddingTop: 14,
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 10,
  },
  brandBlock: {
    gap: 10,
  },
  brandPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  brandHovered: {
    backgroundColor: '#F5F8FD',
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 26,
    height: 26,
  },
  brandTextWrap: {
    gap: 1,
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  brandSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  collapseBtn: {
    alignSelf: 'flex-start',
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollContent: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 8,
  },
  item: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  itemPressed: {
    transform: [{ scale: 0.985 }],
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemTextWrap: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 0,
    flexShrink: 1,
  },
  itemSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  activeLine: {
    position: 'absolute',
    right: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 999,
  },
  footer: {
    borderTopWidth: 1,
    marginTop: 2,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  footerTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  footerSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});
