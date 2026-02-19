// =============================
// File: V:\lp\components\ui\Dropdown.tsx
// Fix: убран AnimatedPressable; scale-анимация перенесена на внутренний Animated.View
// =============================
import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  LayoutRectangle,
  ScrollView,
  useWindowDimensions,
  Animated,
} from 'react-native';
import AnimatedRe, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export type DropdownItem<T extends string | number> = {
  label: string;
  value: T;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  visible?: boolean; // default true
};

type DropdownProps<T extends string | number> = {
  items: DropdownItem<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  renderTrigger?: (selectedLabel?: string, open?: boolean) => React.ReactNode;
  errorText?: string;
  menuMaxHeight?: number;
  menuAlign?: 'auto' | 'left' | 'right';
};

type DropdownMenuItemProps<T extends string | number> = {
  item: DropdownItem<T>;
  selected: boolean;
  onPress: () => void;
};

function DropdownMenuItem<T extends string | number>({
  item,
  selected,
  onPress,
}: DropdownMenuItemProps<T>) {
  const scale = useRef(new Animated.Value(1)).current;
  const shiftX = useRef(new Animated.Value(0)).current;
  const [isHovered, setIsHovered] = useState(false);

  const animate = (toScale: number, toShiftX: number) => {
    Animated.parallel([
      Animated.timing(scale, { toValue: toScale, duration: 110, useNativeDriver: true }),
      Animated.timing(shiftX, { toValue: toShiftX, duration: 110, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      disabled={item.disabled}
      onPress={onPress}
      onHoverIn={() => {
        if (item.disabled) return;
        setIsHovered(true);
        animate(1.01, 2);
      }}
      onHoverOut={() => {
        if (item.disabled) return;
        setIsHovered(false);
        animate(1, 0);
      }}
      onPressIn={() => !item.disabled && animate(0.985, 0)}
      onPressOut={() => !item.disabled && animate(1.01, 2)}
      style={({ pressed }) => [
        styles.item,
        selected && styles.itemSelected,
        isHovered && !item.disabled && styles.itemHovered,
        pressed && !item.disabled && styles.itemPressed,
        item.disabled && styles.itemDisabled,
      ]}
      android_ripple={{ color: 'rgba(37,99,235,0.10)' }}
    >
      <Animated.View
        style={[
          styles.itemInner,
          {
            transform: [{ translateX: shiftX }, { scale }],
          },
        ]}
      >
        {item.icon ? (
          <View style={[styles.itemIconWrap, selected && styles.itemIconWrapSelected]}>
            <Ionicons
              name={item.icon}
              size={15}
              color={selected ? '#2563EB' : '#475569'}
            />
          </View>
        ) : null}
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          style={[
            styles.itemText,
            selected && styles.itemTextSelected,
            item.disabled && styles.itemTextDisabled,
          ]}
        >
          {item.label}
        </Text>
        {selected ? <Ionicons name="checkmark-circle" size={16} color="#2563EB" /> : null}
      </Animated.View>
    </Pressable>
  );
}

export default function Dropdown<T extends string | number>({
  items,
  value,
  onChange,
  placeholder = 'Выберите значение',
  style,
  buttonStyle,
  renderTrigger,
  errorText,
  menuMaxHeight = 300,
  menuAlign = 'auto',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const anchorWrapRef = useRef<View | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  const selectedLabel = useMemo(
    () => items.find((i) => i.value === value)?.label,
    [items, value]
  );
  const visibleItems = useMemo(
    () => items.filter((i) => i.visible !== false),
    [items]
  );

  const measureAndOpen = () => {
    anchorWrapRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const sideGutter = 12;
  const maxMenuWidth = Math.max(winWidth - sideGutter * 2, 0);
  const desiredMenuWidth = anchor?.width ? Math.max(anchor.width, 220) : 260;
  const menuWidth = maxMenuWidth > 0 ? Math.min(desiredMenuWidth, maxMenuWidth) : desiredMenuWidth;
  const minLeft = sideGutter;
  const maxLeft = Math.max(winWidth - menuWidth - sideGutter, minLeft);
  const anchorX = anchor?.x ?? minLeft;
  const anchorWidth = anchor?.width ?? 0;
  const preferredLeft =
    menuAlign === 'right'
      ? anchorX + anchorWidth - menuWidth
      : anchorX;
  const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

  const estimatedMenuHeight = Math.min(menuMaxHeight, visibleItems.length * 46 + 20);
  const anchorBottom = (anchor?.y ?? 0) + (anchor?.height ?? 0);
  const bottomGutter = 12;
  const hasSpaceBelow = anchorBottom + 4 + estimatedMenuHeight <= winHeight - bottomGutter;
  const top = hasSpaceBelow
    ? anchorBottom + 4
    : Math.max((anchor?.y ?? 0) - estimatedMenuHeight - 4, bottomGutter);

  return (
    <View style={[styles.wrap, style]}>
      <View ref={anchorWrapRef} collapsable={false}>
      <Pressable
        onPress={measureAndOpen}
        onPressIn={() =>
          Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }).start()
        }
        style={({ pressed }) => [
          styles.button,
          buttonStyle,
          pressed && styles.pressed,
          !!errorText && styles.errorBorder,
        ]}
        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center', // ✅ добавляем центровку
            flex: 1,
          }}
        >
          {renderTrigger ? (
            renderTrigger(selectedLabel, open)
          ) : (
            <>
              <Ionicons name="list" size={16} color="#111827" style={{ marginRight: 8 }} />
              <Text
                style={[styles.buttonText, !selectedLabel && { color: '#9CA3AF' }]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {selectedLabel ?? placeholder}
              </Text>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#6B7280"
                style={{ marginLeft: 'auto' }}
              />
            </>
          )}
        </Animated.View>
      </Pressable>
      </View>

      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

      <Modal transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <AnimatedRe.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.menu,
            {
              top,
              left,
              width: menuWidth,
            },
          ]}
        >
          {visibleItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Нет вариантов</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: menuMaxHeight }} nestedScrollEnabled>
              {visibleItems.map((it) => {
                const selected = value === it.value;
                return (
                  <DropdownMenuItem
                    key={String(it.value)}
                    item={it}
                    selected={selected}
                    onPress={() => {
                      onChange(it.value);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </ScrollView>
          )}
        </AnimatedRe.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  buttonText: { color: '#111827', fontSize: 14, fontWeight: '600', flex: 1 },
  pressed: { backgroundColor: 'rgba(0,0,0,0.04)' },
  errorBorder: { borderColor: '#EF4444' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  item: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  itemInner: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemHovered: { backgroundColor: '#F8FAFC' },
  itemPressed: { backgroundColor: '#EEF2FF' },
  itemDisabled: { opacity: 0.5 },
  itemSelected: { backgroundColor: '#EFF6FF' },
  itemIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemIconWrapSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  itemText: { color: '#111827', fontSize: 14, fontWeight: '500', flex: 1, flexShrink: 1, paddingRight: 8 },
  itemTextSelected: { color: '#2563EB', fontWeight: '700' },
  itemTextDisabled: { color: '#9CA3AF' },
  emptyWrap: { paddingVertical: 10, paddingHorizontal: 12 },
  emptyText: { color: '#6B7280', fontSize: 12 },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 6 },
});
