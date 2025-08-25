// =============================
// File: V:\\lp\\components\\ui\\Dropdown.tsx (UPDATED)
// - фикс прозрачности меню: теперь через Modal с полноэкранным backdrop
// - выделение выбранного пункта цветом + галочка
// - якорение меню к кнопке по координатам
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
  Platform,
} from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export type DropdownItem<T extends string | number> = {
  label: string;
  value: T;
  disabled?: boolean;
  visible?: boolean; // default true
};

type DropdownProps<T extends string | number> = {
  items: DropdownItem<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  errorText?: string;
  menuMaxHeight?: number;
};

export default function Dropdown<T extends string | number>({
  items,
  value,
  onChange,
  placeholder = 'Выберите значение',
  style,
  errorText,
  menuMaxHeight = 300,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const anchorWrapRef = useRef<View | null>(null);

  const selectedLabel = useMemo(() => items.find((i) => i.value === value)?.label, [items, value]);
  const visibleItems = useMemo(() => items.filter((i) => i.visible !== false), [items]);

  const measureAndOpen = () => {
    anchorWrapRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  return (
    <View style={[styles.wrap, style]}>
      {/* Обёртка нужна, чтобы корректно измерить координаты */}
      <View ref={anchorWrapRef} collapsable={false}>
        <Pressable
          onPress={measureAndOpen}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, errorText && styles.errorBorder]}
          android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
          accessibilityRole="button"
          accessibilityLabel="Открыть список"
        >
          <Ionicons name="list" size={16} color="#111827" style={{ marginRight: 8 }} />
          <Text style={[styles.buttonText, !selectedLabel && { color: '#9CA3AF' }]} numberOfLines={1}>
            {selectedLabel ?? placeholder}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#6B7280" style={{ marginLeft: 'auto' }} />
        </Pressable>
      </View>
      {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

      {/* Полноэкранный слой через Modal — избавляет от проблем с прозрачностью/перекрытиями */}
      <Modal transparent visible={open} onRequestClose={() => setOpen(false)}>
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

        {/* Меню, привязанное к координатам кнопки */}
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOut.duration(120)}
          style={[
            styles.menu,
            {
              top: (anchor?.y ?? 0) + (anchor?.height ?? 0) + 4,
              left: anchor?.x ?? 16,
              width: anchor?.width ? Math.max(anchor.width, 220) : 260,
            },
          ]}
        >
          {visibleItems.length === 0 ? (
            <View style={styles.emptyWrap}><Text style={styles.emptyText}>Нет вариантов</Text></View>
          ) : (
            <ScrollView style={{ maxHeight: menuMaxHeight }} nestedScrollEnabled>
              {visibleItems.map((it) => {
                const selected = value === it.value;
                return (
                  <Pressable
                    key={String(it.value)}
                    disabled={it.disabled}
                    onPress={() => { onChange(it.value); setOpen(false); }}
                    style={({ pressed }) => [
                      styles.item,
                      selected && styles.itemSelected,
                      it.disabled && styles.itemDisabled,
                      pressed && !it.disabled && styles.itemPressed,
                    ]}
                    android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.itemText, selected && styles.itemTextSelected, it.disabled && styles.itemTextDisabled]}
                    >
                      {it.label}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
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
  pressed: { opacity: 0.96 },
  errorBorder: { borderColor: '#EF4444' },

  // Modal layers
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF2FF',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  itemPressed: { backgroundColor: 'rgba(0,0,0,0.04)' },
  itemDisabled: { opacity: 0.5 },
  itemSelected: { backgroundColor: '#EEF2FF' },
  itemText: { color: '#111827', fontSize: 14 },
  itemTextSelected: { color: '#2563EB', fontWeight: '700' },
  itemTextDisabled: { color: '#9CA3AF' },

  emptyWrap: { paddingVertical: 10, paddingHorizontal: 12 },
  emptyText: { color: '#6B7280', fontSize: 12 },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 6 },
});
