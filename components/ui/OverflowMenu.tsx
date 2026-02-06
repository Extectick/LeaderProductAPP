import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export type OverflowMenuItem = {
  key: string;
  title: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  visible?: boolean; // default true
};

export type OverflowMenuProps = {
  visible: boolean;
  onClose: () => void;
  items: OverflowMenuItem[];
  anchorPosition?: { x?: number; y?: number }; // optional absolute offsets from top-right corner of parent container
  style?: StyleProp<ViewStyle>;
};

export default function OverflowMenu({ visible, onClose, items, anchorPosition, style }: OverflowMenuProps) {
  if (!visible) return null;

  const renderItems = items.filter((i) => i.visible !== false);

  return (
    <>
      {/* Backdrop */}
      <Animated.View entering={FadeIn} exiting={FadeOut} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} android_ripple={{ color: 'transparent' }} />
      </Animated.View>

      {/* Menu */}
      <Animated.View
        entering={FadeInDown.duration(180)}
        exiting={FadeOut.duration(120)}
        style={[
          styles.menuContainer,
          {
            top: anchorPosition?.y ?? 54,
            right: anchorPosition?.x ?? 12,
          },
          style,
        ]}
      >
        {renderItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Нет доступных действий</Text>
          </View>
        ) : (
          renderItems.map((item, idx) => (
            <Pressable
              key={item.key}
              disabled={item.disabled}
              style={({ pressed }) => [
                styles.menuItem,
                item.disabled && styles.itemDisabled,
                pressed && !item.disabled && styles.itemPressed,
              ]}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              onPress={() => {
                if (!item.disabled) {
                  try { item.onPress(); } finally { onClose(); }
                }
              }}
            >
              {item.icon ? (
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.destructive ? '#EF4444' : item.disabled ? '#9CA3AF' : '#111827'}
                  style={{ marginRight: 10, width: 18 }}
                />
              ) : null}
              <Text
                style={[styles.menuText, item.destructive && styles.destructiveText, item.disabled && styles.disabledText]}
              >
                {item.title}
              </Text>
            </Pressable>
          ))
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
  menuContainer: {
    position: 'absolute',
    maxWidth: 240,
    minWidth: 180,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 6,
    // лёгкая обводка + мягкая тень — выглядит аккуратнее на градиенте
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF2FF',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  itemPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  itemDisabled: {
    opacity: 0.4,
  },
  menuText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
  },
  destructiveText: { color: '#EF4444' },
  disabledText: { color: '#9CA3AF' },
  emptyWrap: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 12,
  },
});
