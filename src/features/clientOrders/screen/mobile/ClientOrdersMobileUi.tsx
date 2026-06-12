import { packageLabel, unitLabel } from '../../lib/clientOrdersUi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Animated, BackHandler, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  Button as PaperButton,
  Card,
  Chip,
  Dialog,
  Divider,
  IconButton as PaperIconButton,
  List,
  Modal as PaperModal,
  Portal,
  Surface,
  Text,
} from 'react-native-paper';

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  alternateLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onAlternate?: () => void | Promise<void>;
} | null;

export function ActionButton({
  styles,
  label,
  icon,
  kind = 'secondary',
  onPress,
  disabled,
  height,
}: {
  styles: any;
  label: string;
  icon?: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'success';
  onPress: () => void;
  disabled?: boolean;
  height?: number;
}) {
  const mode = kind === 'secondary' ? 'outlined' : 'contained';
  const buttonColor = kind === 'danger' ? '#DC2626' : kind === 'success' ? '#16A34A' : kind === 'primary' ? '#0F172A' : '#FFFFFF';
  const textColor = kind === 'secondary' ? '#2563EB' : '#FFFFFF';

  return (
    <PaperButton
      mode={mode}
      disabled={disabled}
      onPress={onPress}
      icon={icon}
      buttonColor={buttonColor}
      textColor={textColor}
      contentStyle={height ? { minHeight: height, height } : undefined}
      style={[styles.actionPaper, disabled && styles.disabled]}
      labelStyle={styles.actionPaperLabel}
    >
      {label}
    </PaperButton>
  );
}

export function Pill({ styles, text, tone }: { styles: any; text: string; tone?: 'success' | 'danger' }) {
  return (
    <Chip
      compact
      style={[styles.pillPaper, tone === 'success' && styles.pillSuccess, tone === 'danger' && styles.pillDanger]}
      textStyle={[styles.pillText, tone === 'success' && styles.pillSuccessText, tone === 'danger' && styles.pillDangerText]}
    >
      {text}
    </Chip>
  );
}

export function InfoText({ styles, text }: { styles: any; text: string }) {
  return <Text style={styles.infoText}>{text}</Text>;
}

export function SelectionCard({
  styles,
  label,
  value,
  onPress,
  disabled,
  compact,
  onDetails,
}: {
  styles: any;
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  onDetails?: () => void;
}) {
  return (
    <Card mode="outlined" onPress={disabled ? undefined : onPress} style={[styles.selection, compact && styles.selectionCompact, disabled && styles.disabled]}>
      <Card.Content style={styles.selectionContentPaper}>
        <Text style={styles.selectionLabel}>{label}</Text>
        <View style={styles.selectionValueRow}>
          <Text style={[styles.selectionValue, { flex: 1 }]} numberOfLines={2}>
            {value}
          </Text>
          {onDetails ? <PaperIconButton icon="magnify" size={18} onPress={onDetails} disabled={disabled} style={styles.detailsButtonPaper} /> : null}
        </View>
      </Card.Content>
    </Card>
  );
}

export function PackagePickerDialog({
  styles,
  item,
  onDismiss,
  onSelect,
}: {
  styles: any;
  item: any | null;
  onDismiss: () => void;
  onSelect: (packageGuid: string | null) => void;
}) {
  const packages = item?.packages || [];

  return (
    <Portal>
      <Dialog visible={!!item} onDismiss={onDismiss} style={styles.dialogPaper}>
        <Dialog.Title>Выбор упаковки</Dialog.Title>
        <Dialog.Content>
          <List.Item
            title={unitLabel(item?.baseUnit)}
            left={(props) => <List.Icon {...props} icon={!item?.packageGuid ? 'check-circle' : 'cube-outline'} />}
            onPress={() => onSelect(null)}
          />
          {packages.map((pack: any) => (
            <List.Item
              key={pack.guid}
              title={packageLabel(pack, item)}
              left={(props) => <List.Icon {...props} icon={item?.packageGuid === pack.guid ? 'check-circle' : 'cube-outline'} />}
              onPress={() => onSelect(pack.guid)}
            />
          ))}
        </Dialog.Content>
        <Dialog.Actions>
          <PaperButton onPress={onDismiss}>Закрыть</PaperButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export function ConfirmDialog({
  styles,
  state,
  onDismiss,
}: {
  styles: any;
  state: ConfirmDialogState;
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (!state) setConfirming(false);
  }, [state]);

  const confirm = React.useCallback(async () => {
    if (!state || confirming) return;
    setConfirming(true);
    try {
      await state.onConfirm();
      onDismiss();
    } finally {
      setConfirming(false);
    }
  }, [confirming, onDismiss, state]);
  const alternate = React.useCallback(async () => {
    if (!state?.onAlternate || confirming) return;
    setConfirming(true);
    try {
      await state.onAlternate();
      onDismiss();
    } finally {
      setConfirming(false);
    }
  }, [confirming, onDismiss, state]);

  return (
    <Portal>
      <Dialog visible={!!state} onDismiss={onDismiss} style={styles.dialogPaper}>
        <Dialog.Title>{state?.title || ''}</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.orderMeta}>{state?.message || ''}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <PaperButton onPress={onDismiss} disabled={confirming}>
            {state?.cancelLabel || 'Отмена'}
          </PaperButton>
          {state?.alternateLabel && state.onAlternate ? (
            <PaperButton onPress={() => void alternate()} disabled={confirming} textColor="#DC2626">
              {state.alternateLabel}
            </PaperButton>
          ) : null}
          <PaperButton
            onPress={() => void confirm()}
            loading={confirming}
            disabled={confirming}
            textColor={state?.destructive ? '#DC2626' : undefined}
          >
            {state?.confirmLabel || 'Продолжить'}
          </PaperButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export function SheetModal({
  styles,
  visible,
  title,
  onClose,
  children,
  fullScreen,
}: {
  styles: any;
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  fullScreen?: boolean;
}) {
  return (
    <Portal>
      <PaperModal visible={visible} onDismiss={onClose} contentContainerStyle={[styles.modalBackdropPaper, fullScreen ? styles.modalBackdropPaperFull : null]}>
        <Surface style={[styles.modalSheetPaper, fullScreen && styles.modalSheetPaperFull]} elevation={2}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <PaperIconButton icon="close" size={22} onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <Divider />
          <View style={styles.sheetBody}>{children}</View>
        </Surface>
      </PaperModal>
    </Portal>
  );
}

export function PickerBottomSheet({
  styles,
  visible,
  topOffset,
  title,
  titleIcon,
  onClose,
  children,
  fullWidth = true,
  showHeader = true,
  sheetStyle,
  headerContent,
  overlayHandle = false,
  contentScrollOffset = 0,
  enableContentDrag = false,
  preferredHeight,
  minHeight = 360,
}: {
  styles?: any;
  visible: boolean;
  topOffset: number;
  title: string;
  titleIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onClose: () => void;
  children: React.ReactNode;
  fullWidth?: boolean;
  showHeader?: boolean;
  sheetStyle?: any;
  headerContent?: React.ReactNode | ((close: () => void) => React.ReactNode);
  overlayHandle?: boolean;
  contentScrollOffset?: number;
  enableContentDrag?: boolean;
  preferredHeight?: number;
  minHeight?: number;
}) {
  const ui = styles || pickerBottomSheetDefaultStyles;
  const { width, height } = useWindowDimensions();
  const anim = React.useRef(new Animated.Value(0)).current;
  const dragStartValueRef = React.useRef(1);
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;
  const sheetWidth = fullWidth ? width : Math.min(520, Math.max(280, width - 16));
  const maxSheetHeight = Math.max(minHeight, height - topOffset);
  const sheetHeight = Math.min(maxSheetHeight, Math.max(minHeight, preferredHeight || maxSheetHeight));
  const [rendered, setRendered] = React.useState(visible);

  const closeWithAnimation = React.useCallback(() => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    onClose();
    Animated.spring(anim, {
      toValue: 0,
      damping: 24,
      stiffness: 260,
      mass: 0.9,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !visibleRef.current) setRendered(false);
    });
  }, [anim, onClose]);

  React.useEffect(() => {
    if (visible) setRendered(true);
  }, [visible]);

  React.useEffect(() => {
    if (!rendered) return;
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      damping: 22,
      stiffness: 240,
      mass: 0.9,
      overshootClamping: true,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !visibleRef.current) setRendered(false);
    });
  }, [anim, rendered, visible]);

  React.useEffect(() => {
    if (!visible || Platform.OS === 'web') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeWithAnimation();
      return true;
    });
    return () => subscription.remove();
  }, [closeWithAnimation, visible]);

  const createPanResponder = React.useCallback(
    (canStart: (gestureState: { dx: number; dy: number }) => boolean, capture = false) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => visible && canStart(gestureState),
        onMoveShouldSetPanResponderCapture: capture
          ? (_evt, gestureState) => visible && canStart(gestureState)
          : undefined,
        onPanResponderGrant: () => {
          dragStartValueRef.current = 1;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const next = dragStartValueRef.current - Math.max(0, gestureState.dy) / sheetHeight;
          anim.setValue(Math.max(0, Math.min(1, next)));
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dy > 48 || gestureState.vy > 0.5) {
            closeWithAnimation();
            return;
          }
          Animated.spring(anim, {
            toValue: 1,
            damping: 22,
            stiffness: 240,
            mass: 0.9,
            overshootClamping: true,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(anim, {
            toValue: 1,
            damping: 22,
            stiffness: 240,
            mass: 0.9,
            overshootClamping: true,
            useNativeDriver: false,
          }).start();
        },
      }),
    [anim, closeWithAnimation, sheetHeight, visible]
  );
  const headerPanResponder = React.useMemo(
    () => createPanResponder((gestureState) =>
      gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    [createPanResponder]
  );
  const contentPanResponder = React.useMemo(
    () => createPanResponder((gestureState) =>
      enableContentDrag &&
      contentScrollOffset <= 1 &&
      gestureState.dy > 5 &&
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    true),
    [contentScrollOffset, createPanResponder, enableContentDrag]
  );

  if (!rendered) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight + 24, 0],
  });
  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Portal>
      <View
        style={[pickerBottomSheetDefaultStyles.pickerBottomSheetOverlay, ui.pickerBottomSheetOverlay]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        <Animated.View
          style={[
            pickerBottomSheetDefaultStyles.pickerBottomSheetBackdrop,
            ui.pickerBottomSheetBackdrop,
            { opacity: backdropOpacity },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть панель"
            onPress={closeWithAnimation}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
        <Animated.View
          style={[
            pickerBottomSheetDefaultStyles.pickerBottomSheetWrap,
            ui.pickerBottomSheetWrap,
            {
              width: sheetWidth,
              height: sheetHeight,
              left: fullWidth ? 0 : (width - sheetWidth) / 2,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[ui.pickerBottomSheet, sheetStyle]}>
            <View {...headerPanResponder.panHandlers}>
              <View
                style={[
                  ui.pickerBottomSheetHandle,
                  overlayHandle && {
                    position: 'absolute',
                    top: 6,
                    left: '50%',
                    marginLeft: -17,
                    zIndex: 10,
                  },
                ]}
              />
              {showHeader ? (
                <View style={ui.pickerBottomSheetHeader}>
                  <View style={ui.pickerBottomSheetTitleRow}>
                    {titleIcon ? <MaterialCommunityIcons name={titleIcon} size={18} color="#2563EB" /> : null}
                    <Text style={ui.pickerBottomSheetTitle} numberOfLines={1}>{title}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Закрыть"
                    onPress={closeWithAnimation}
                    hitSlop={8}
                    style={({ pressed }) => [ui.pickerBottomSheetClose, pressed && ui.flatPressed]}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#475569" />
                  </Pressable>
                </View>
              ) : null}
              {typeof headerContent === 'function' ? headerContent(closeWithAnimation) : headerContent}
            </View>
            <View style={ui.pickerBottomSheetBody} {...contentPanResponder.panHandlers}>{children}</View>
          </View>
        </Animated.View>
      </View>
    </Portal>
  );
}

const pickerBottomSheetDefaultStyles = StyleSheet.create({
  pickerBottomSheetOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 14 },
  pickerBottomSheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.18)' },
  pickerBottomSheetWrap: { position: 'absolute', zIndex: 14, bottom: 0 },
  pickerBottomSheet: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: '#D8E2F0',
    backgroundColor: '#FFFFFF',
    paddingTop: 5,
    gap: 0,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  pickerBottomSheetHandle: { alignSelf: 'center', width: 34, height: 3, borderRadius: 999, backgroundColor: '#CBD5E1', marginBottom: 5 },
  pickerBottomSheetHeader: { height: 34, paddingLeft: 10, paddingRight: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  pickerBottomSheetTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pickerBottomSheetTitle: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '900', color: '#0F172A', textTransform: 'uppercase' },
  pickerBottomSheetClose: { width: 28, height: 28, borderRadius: 4, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pickerBottomSheetBody: { flex: 1, minHeight: 0, gap: 0 },
  flatPressed: { opacity: 0.78 },
});
