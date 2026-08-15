import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CounterpartyCardTab } from '../model/counterpartyCard.types';

const TABS: Array<{ key: CounterpartyCardTab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = [
  { key: 'overview', label: 'Обзор', icon: 'view-dashboard-outline' },
  { key: 'finance', label: 'Деньги', icon: 'wallet-outline' },
  { key: 'activity', label: 'Активность', icon: 'tools' },
  { key: 'profile', label: 'Информация', icon: 'card-account-details-outline' },
];

export function CounterpartyBottomTabs({ active, onSelect }: { active: CounterpartyCardTab; onSelect: (tab: CounterpartyCardTab) => void }) {
  const [width, setWidth] = React.useState(0);
  const translate = React.useRef(new Animated.Value(0)).current;
  const layoutReadyRef = React.useRef(false);
  const index = Math.max(0, TABS.findIndex((item) => item.key === active));

  React.useEffect(() => {
    if (!width) return;
    const target = index * (width / TABS.length);
    translate.stopAnimation();
    if (!layoutReadyRef.current) {
      layoutReadyRef.current = true;
      translate.setValue(target);
      return;
    }
    Animated.timing(translate, {
      toValue: target,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, translate, width]);

  React.useEffect(() => () => translate.stopAnimation(), [translate]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.root}>
      {width > 0 ? <Animated.View pointerEvents="none" style={[styles.indicator, { left: 4, width: width / TABS.length - 8, transform: [{ translateX: translate }] }]} /> : null}
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onSelect(tab.key)} style={styles.tab}>
            <MaterialCommunityIcons name={tab.icon} size={22} color={selected ? '#2563EB' : '#64748B'} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.label, selected && styles.activeLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const COUNTERPARTY_TABS = TABS;

const styles = StyleSheet.create({
  root: { position: 'relative', minHeight: 66, flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#DCE5F1', backgroundColor: 'rgba(255,255,255,0.98)', paddingHorizontal: 4, paddingTop: 5 },
  indicator: { position: 'absolute', top: 4, bottom: 4, borderRadius: 13, backgroundColor: '#EAF2FF' },
  tab: { zIndex: 1, flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  label: { width: '100%', color: '#64748B', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  activeLabel: { color: '#2563EB', fontWeight: '900' },
});
