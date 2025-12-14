import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';

type Props = {
  title: string;
  subtitle?: string;
  icon: string;
  showBack?: boolean;
  onBack?: () => void;
};

export function AppHeader({ title, subtitle, icon, showBack = true, onBack }: Props) {
  const { top } = useSafeAreaInsets();
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'secondaryText' as any);

  return (
    <View style={[styles.wrap, { paddingTop: Platform.OS === 'web' ? 12 : top + 6, backgroundColor: background }]}>
      <View style={[styles.card, { backgroundColor: cardBackground }]}>
        <View style={styles.row}>
          {showBack && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              onPress={onBack}
              style={({ pressed }) => [
                styles.backBtn,
                { backgroundColor: pressed ? '#EEF2FF' : '#F3F4F6' },
              ]}
            >
              <Ionicons name="arrow-back" size={18} color={textColor} />
            </Pressable>
          )}

          <LinearGradient
            colors={['#4F46E5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconBadge}
          >
            <Ionicons name={icon as any} size={18} color="#fff" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: secondary }]} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
});
