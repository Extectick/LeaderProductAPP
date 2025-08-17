import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  onOpenFilter: () => void;
  onOpenPeriod: () => void;
  onOpenPresets: () => void;
  selectedCount: number;
  periodLabel: string;
};

/** Небольшая «пружинка» для кнопок */
const PressableScale: React.FC<{
  onPress?: () => void;
  style?: any;
  children: React.ReactNode;
}> = ({ onPress, style, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() =>
        Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }).start()
      }
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
};

export default function AnalyticsHeader({
  onOpenFilter,
  onOpenPeriod,
  onOpenPresets,
  selectedCount,
  periodLabel,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const styles = getStyles();

  return (
    <View style={{ marginBottom: 16 }}>
      <LinearGradient
        colors={['#0EA5E9', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        {/* Верхняя строка: заголовки + иконки */}
        <View style={styles.topRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Аналитика</Text>
            <Text style={styles.headerSubtitle}>Графики, разбивки и лента сканов</Text>
          </View>

          <View style={styles.iconsRight}>
            <PressableScale style={styles.iconBtn} onPress={onOpenPresets}>
              <Ionicons name="albums" size={18} color="#fff" />
            </PressableScale>

            <PressableScale style={styles.iconBtn} onPress={onOpenFilter}>
              <Ionicons name="funnel" size={18} color="#fff" />
              {selectedCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {selectedCount > 99 ? '99+' : selectedCount}
                  </Text>
                </View>
              )}
            </PressableScale>
          </View>
        </View>

        {/* Нижняя строка: кнопка периода */}
        <View style={styles.periodRow}>
          {/*
            Главные изменения:
            - alignSelf: 'flex-start' — кнопка занимает столько ширины, сколько нужно.
            - разрешаем перенос текста (убран numberOfLines), включён flexWrap.
            - сняты жёсткие maxWidth, текст больше не обрезается на узких экранах.
          */}
          <PressableScale onPress={onOpenPeriod} style={styles.periodBtn}>
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text
              style={styles.periodBtnText}
              // НЕ ставим numberOfLines — пусть переносится на 2 строки при необходимости
            >
              {periodLabel || 'Период'}
            </Text>
          </PressableScale>
        </View>
      </LinearGradient>
    </View>
  );
}

const getStyles = () =>
  StyleSheet.create({
    headerCard: {
      borderRadius: 20,
      padding: 16,
      overflow: 'hidden',
      ...Platform.select({
        web: { boxShadow: '0px 10px 20px rgba(0,0,0,0.25)' },
        ios: {
          shadowColor: '#7C3AED',
          shadowOpacity: 0.22,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        },
        android: { elevation: 5 },
      }),
    },

    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },

    headerTextBlock: {
      flex: 1,
      paddingRight: 56, // чтобы заголовок/подзаголовок не упирались в иконки
    },
    headerTitle: { color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: 0.2 },
    headerSubtitle: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: 12,
      marginTop: 4,
      flexWrap: 'wrap',
    },

    iconsRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 8,
    },

    iconBtn: {
      height: 36,
      width: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.75)',
      position: 'relative',
    },

    countBadge: {
      position: 'absolute',
      right: -4,
      top: -4,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: '#22C55E',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.85)',
    },
    countBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

    periodRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      flexWrap: 'wrap',
    },

    periodBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.75)',
      // НИЧЕГО не ограничиваем по ширине — кнопка подстраивается под содержание
      gap: 8,
    },
    periodBtnText: {
      color: '#fff',
      fontWeight: '700',
      flexShrink: 1,   // можно сжимать текстовый блок
      flexWrap: 'wrap',// и переносить на следующую строку
      lineHeight: 18,
      // без numberOfLines -> не будет троеточий
    },
  });
