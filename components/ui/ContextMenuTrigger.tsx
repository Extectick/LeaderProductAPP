import React from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';

type TriggerRenderProps = {
  onContextMenu?: (event: any) => void;
  onLongPress?: (event: any) => void;
  delayLongPress?: number;
};

type Props<TAction = string> = {
  items: ContextMenuItem<TAction>[];
  children: (props: TriggerRenderProps) => React.ReactNode;
  disabled?: boolean;
  menuStyle?: StyleProp<ViewStyle>;
  menuMaxHeight?: number;
  emptyText?: string;
};

export default function ContextMenuTrigger<TAction = string>({
  items,
  children,
  disabled = false,
  menuStyle,
  menuMaxHeight,
  emptyText,
}: Props<TAction>) {
  const [visible, setVisible] = React.useState(false);
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);

  const handleClose = React.useCallback(() => {
    setVisible(false);
  }, []);

  const handleContextMenu = React.useCallback(
    (event: any) => {
      if (Platform.OS !== 'web' || disabled) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      const nativeEvent = event?.nativeEvent ?? event;
      const x =
        typeof nativeEvent?.clientX === 'number'
          ? nativeEvent.clientX
          : typeof nativeEvent?.pageX === 'number'
            ? nativeEvent.pageX
            : 0;
      const y =
        typeof nativeEvent?.clientY === 'number'
          ? nativeEvent.clientY
          : typeof nativeEvent?.pageY === 'number'
            ? nativeEvent.pageY
            : 0;

      setPosition({ x, y });
      setVisible(true);
    },
    [disabled]
  );

  const handleLongPress = React.useCallback(
    (event: any) => {
      if (Platform.OS === 'web' || disabled) return;
      const nativeEvent = event?.nativeEvent ?? event;
      const x = typeof nativeEvent?.pageX === 'number' ? nativeEvent.pageX : 0;
      const y = typeof nativeEvent?.pageY === 'number' ? nativeEvent.pageY : 0;
      setPosition({ x, y });
      setVisible(true);
    },
    [disabled]
  );

  const triggerProps = React.useMemo<TriggerRenderProps>(() => {
    if (disabled) return {};
    if (Platform.OS === 'web') return { onContextMenu: handleContextMenu };
    return { onLongPress: handleLongPress, delayLongPress: 420 };
  }, [disabled, handleContextMenu, handleLongPress]);

  return (
    <>
      {children(triggerProps)}
      <ContextMenu
        visible={visible}
        position={position}
        items={items}
        onClose={handleClose}
        style={menuStyle}
        maxHeight={menuMaxHeight}
        emptyText={emptyText}
      />
    </>
  );
}
