import React from 'react';
import ReactDOM from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

export type ContextMenuItem<TAction = string> = {
  key: string;
  label: string;
  action?: TAction;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  destructive?: boolean;
  visible?: boolean;
  onSelect: (action: TAction | undefined) => void;
};

type ContextMenuPosition = {
  x: number;
  y: number;
};

type Props<TAction = string> = {
  visible: boolean;
  position: ContextMenuPosition | null;
  items: ContextMenuItem<TAction>[];
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  maxHeight?: number;
  emptyText?: string;
};

const DEFAULT_MENU_WIDTH = 240;
const VIEWPORT_GUTTER = 8;

export default function ContextMenu<TAction = string>({
  visible,
  position,
  items,
  onClose,
  style,
  maxHeight = 320,
  emptyText = 'Нет доступных действий',
}: Props<TAction>) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [menuSize, setMenuSize] = React.useState({ width: DEFAULT_MENU_WIDTH, height: 0 });

  const visibleItems = React.useMemo(() => items.filter((item) => item.visible !== false), [items]);

  React.useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleViewportChange = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [onClose, visible]);

  const resolvedPosition = React.useMemo(() => {
    const baseX = position?.x ?? VIEWPORT_GUTTER;
    const baseY = position?.y ?? VIEWPORT_GUTTER;
    const maxLeft = Math.max(VIEWPORT_GUTTER, viewportWidth - menuSize.width - VIEWPORT_GUTTER);
    const estimatedHeight = menuSize.height || Math.min(maxHeight, visibleItems.length * 44 + 16);
    const maxTop = Math.max(VIEWPORT_GUTTER, viewportHeight - estimatedHeight - VIEWPORT_GUTTER);

    return {
      left: Math.min(Math.max(baseX, VIEWPORT_GUTTER), maxLeft),
      top: Math.min(Math.max(baseY, VIEWPORT_GUTTER), maxTop),
    };
  }, [maxHeight, menuSize.height, menuSize.width, position?.x, position?.y, viewportHeight, viewportWidth, visibleItems.length]);

  if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') {
    return null;
  }

  const menuWebProps =
    Platform.OS === 'web'
      ? ({
          onContextMenu: (event: any) => event.preventDefault?.(),
        } as any)
      : {};
  const backdropWebProps =
    Platform.OS === 'web'
      ? ({
          onContextMenu: (event: any) => {
            event.preventDefault?.();
            onClose();
          },
        } as any)
      : {};

  const node = (
    <View pointerEvents="box-none" style={styles.portalRoot as any}>
      <Pressable style={styles.backdrop} onPress={onClose} {...backdropWebProps} />
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width === menuSize.width && height === menuSize.height) return;
          setMenuSize({ width, height });
        }}
        {...menuWebProps}
        style={[
          styles.menu,
          {
            left: resolvedPosition.left,
            top: resolvedPosition.top,
            maxHeight,
          },
          style,
        ]}
      >
        {visibleItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
            {visibleItems.map((item, index) => (
              <Pressable
                key={item.key}
                disabled={item.disabled}
                onPress={() => {
                  onClose();
                  item.onSelect(item.action);
                }}
                style={(state: any) => [
                  styles.item,
                  index > 0 && styles.itemBorder,
                  item.disabled && styles.itemDisabled,
                  state?.hovered && !item.disabled && styles.itemHovered,
                  state?.pressed && !item.disabled && styles.itemPressed,
                ]}
              >
                <View style={styles.itemInner}>
                  {item.icon ? (
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={item.disabled ? '#94A3B8' : item.destructive ? '#DC2626' : '#334155'}
                      style={styles.itemIcon}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.itemText,
                      item.destructive && styles.itemTextDestructive,
                      item.disabled && styles.itemTextDisabled,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );

  return ReactDOM.createPortal(node as any, document.body);
}

const styles = StyleSheet.create({
  portalRoot: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
  } as any,
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    minWidth: 220,
    maxWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 18,
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  itemHovered: {
    backgroundColor: '#F8FAFC',
  },
  itemPressed: {
    backgroundColor: '#EFF6FF',
  },
  itemDisabled: {
    opacity: 0.55,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemIcon: {
    width: 18,
  },
  itemText: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },
  itemTextDestructive: {
    color: '#DC2626',
  },
  itemTextDisabled: {
    color: '#94A3B8',
  },
  emptyWrap: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
});
