import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View, type GestureResponderHandlers } from 'react-native';
import { mobileSheetStyles as styles } from './styles';

type Props = {
  expanded: boolean;
  title: string;
  meta: string;
  currentText: string;
  onToggle: () => void;
  onHeightChange?: (height: number) => void;
  panHandlers?: GestureResponderHandlers;
};

export default function TransportTasksMobileSheetHeader({
  expanded,
  title,
  meta,
  currentText,
  onToggle,
  onHeightChange,
  panHandlers,
}: Props) {
  return (
    <View
      style={styles.header}
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      {...panHandlers}
    >
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Pressable onPress={onToggle} style={styles.headerMain}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
          {!expanded ? (
            <Text numberOfLines={1} style={styles.currentText}>
              {currentText}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            onPress={onToggle}
            accessibilityLabel={expanded ? 'Свернуть список' : 'Развернуть список'}
            style={({ pressed }) => [
              styles.toggleBtn,
              expanded && styles.toggleBtnActive,
              pressed && { opacity: 0.92 },
            ]}
          >
            <Ionicons
              name={expanded ? 'chevron-down-outline' : 'chevron-up-outline'}
              size={16}
              color="#1D4ED8"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
