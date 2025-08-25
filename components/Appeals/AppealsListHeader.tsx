import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import OverflowMenu, { OverflowMenuItem } from '@/components/ui/OverflowMenu';

export type AppealsHeaderProps = {
  onCreate: () => void;
  title?: string;
  subtitle?: string;
  menuItems?: OverflowMenuItem[];
  showMenuButton?: boolean; // default true
};

export default function AppealsListHeader({
  onCreate,
  title = 'Обращения',
  subtitle = 'Создавайте тикеты, общайтесь и меняйте статусы',
  menuItems = [],
  showMenuButton = true,
}: AppealsHeaderProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  // есть ли вообще видимые пункты
  const hasVisibleItems = useMemo(
    () => (menuItems?.some((i) => i.visible !== false) ?? false),
    [menuItems]
  );

  const toggleMenu = () => setMenuVisible((v) => !v);
  const closeMenu = () => setMenuVisible(false);

  return (
    <Animated.View entering={FadeInDown.duration(250)} style={{ marginBottom: 16, zIndex: 2 }}>
      <LinearGradient
        colors={['#0EA5E9', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        {/* Кнопка меню в правом верхнем углу */}
        {showMenuButton && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть меню действий"
            onPress={toggleMenu}
            style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
            android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false, radius: 28 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color="#0B1220" />
          </Pressable>
        )}

        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>

        <View style={styles.headerButtonsRow}>
          {/* Единственная основная кнопка */}
          <Pressable
            onPress={onCreate}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            android_ripple={{ color: 'rgba(0,0,0,0.07)' }}
          >
            <Ionicons name="add" size={18} color="#0B1220" />
            <Text style={styles.primaryBtnText}>Создать</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Выпадающее меню (якорим к правому верхнему углу карточки) */}
      {showMenuButton && (
        <OverflowMenu
          visible={menuVisible}
          onClose={closeMenu}
          items={menuItems ?? []}
          anchorPosition={{ x: 12, y: 54 }}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 20,
    padding: 16,
    paddingTop: 18,
    overflow: 'hidden',
    position: 'relative',
    // Тени
    shadowColor: '#7C3AED',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  menuButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // чтобы ripple был круглый и не выходил за края
    // Тени/обводка по платформам — убираем тёмный ореол на Android
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 0,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.08)',
      },
      default: {},
    }),
    zIndex: 3,
  },
  headerTextBlock: {
    marginBottom: 12,
    paddingRight: 48, // чтобы текст не упирался в круглую кнопку
  },
  headerTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 12,
    marginTop: 4,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: '#0B1220',
    fontWeight: '800',
    marginLeft: 6,
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.96 },
});