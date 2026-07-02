import { packageLabel, unitLabel } from '../../lib/clientOrdersUi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Animated, BackHandler, Keyboard, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ScrollViewProps, TextInputProps } from 'react-native';
import Reanimated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
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

const nativeBottomSheet = Platform.OS === 'web' ? null : require('@gorhom/bottom-sheet');
const BottomSheetModal = nativeBottomSheet?.BottomSheetModal;
const BottomSheetScrollView = nativeBottomSheet?.BottomSheetScrollView;
const BottomSheetTextInput = nativeBottomSheet?.BottomSheetTextInput;

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  alternateLabel?: string;
  hideCancel?: boolean;
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
  const [renderedState, setRenderedState] = React.useState<ConfirmDialogState>(state);

  React.useEffect(() => {
    if (state) setRenderedState(state);
    if (!state) setConfirming(false);
  }, [state]);

  const dialogState = state ?? renderedState;

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

  if (!dialogState) return null;

  return (
    <Portal>
      <Dialog visible={!!state} onDismiss={onDismiss} style={styles.confirmDialogPaper}>
        <Dialog.Content style={styles.confirmDialogContent}>
          <Text variant="headlineSmall" style={styles.confirmDialogTitle}>
            {dialogState.title}
          </Text>
          {dialogState.message ? (
            <Text variant="bodyMedium" style={styles.confirmDialogMessage}>
              {dialogState.message}
            </Text>
          ) : null}
          <View style={styles.confirmDialogActions}>
            {!dialogState.hideCancel ? (
              <PaperButton
                mode="outlined"
                onPress={onDismiss}
                disabled={confirming}
                textColor="#2563EB"
                style={styles.confirmDialogTextButton}
                contentStyle={styles.confirmDialogButtonContent}
                labelStyle={styles.confirmDialogButtonLabel}
              >
                {dialogState.cancelLabel || 'Отмена'}
              </PaperButton>
            ) : null}
            {dialogState.alternateLabel && dialogState.onAlternate ? (
              <PaperButton
                mode="outlined"
                onPress={() => void alternate()}
                disabled={confirming}
                textColor="#DC2626"
                style={styles.confirmDialogTextButton}
                contentStyle={styles.confirmDialogButtonContent}
                labelStyle={styles.confirmDialogButtonLabel}
              >
                {dialogState.alternateLabel}
              </PaperButton>
            ) : null}
            <PaperButton
              mode="contained"
              onPress={() => void confirm()}
              loading={confirming}
              disabled={confirming}
              buttonColor={dialogState.destructive ? '#DC2626' : '#2563EB'}
              textColor="#FFFFFF"
              style={styles.confirmDialogPrimaryButton}
              contentStyle={styles.confirmDialogButtonContent}
              labelStyle={styles.confirmDialogButtonLabel}
            >
              {dialogState.confirmLabel || 'Продолжить'}
            </PaperButton>
          </View>
        </Dialog.Content>
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

type PickerBottomSheetProps = {
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
  closeOnBackdropPress?: boolean;
  contentScrollOffset?: number;
  enableContentDrag?: boolean;
  closeDragDistance?: number;
  closeOnDragMove?: boolean;
  preferredHeight?: number;
  minHeight?: number;
  initialSnapIndex?: number;
  keyboardTopInset?: number;
  keyboardBehavior?: 'interactive' | 'extend' | 'fillParent';
  keyboardBlurBehavior?: 'none' | 'restore';
  androidKeyboardInputMode?: 'adjustPan' | 'adjustResize';
  enableBlurKeyboardOnGesture?: boolean;
  fastDismiss?: boolean;
};

export function PickerBottomSheet(props: PickerBottomSheetProps) {
  if (Platform.OS !== 'web') {
    return <NativePickerBottomSheet {...props} />;
  }
  return <LegacyPickerBottomSheet {...props} />;
}

export const PickerBottomSheetScrollView = (Platform.OS === 'web' ? undefined : BottomSheetScrollView) as
  | React.ComponentType<React.PropsWithChildren<ScrollViewProps>>
  | undefined;

export const PickerBottomSheetTextInput = (Platform.OS === 'web' ? undefined : BottomSheetTextInput) as
  | React.ComponentType<TextInputProps>
  | undefined;

function PickerBottomSheetNativeBackdrop({
  animatedIndex,
  closeOnBackdropPress,
  onClose,
}: {
  animatedIndex?: { value: number };
  closeOnBackdropPress: boolean;
  onClose: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const index = animatedIndex?.value ?? -1;
    return {
      opacity: interpolate(index, [-1, 0], [0, 1], Extrapolation.CLAMP),
    };
  }, [animatedIndex]);

  return (
    <Reanimated.View
      pointerEvents={closeOnBackdropPress ? 'auto' : 'none'}
      style={[pickerBottomSheetDefaultStyles.pickerBottomSheetNativeBackdrop, animatedStyle]}
    >
      {closeOnBackdropPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть панель"
          onPressIn={onClose}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
    </Reanimated.View>
  );
}

function NativePickerBottomSheet({
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
  closeOnBackdropPress = true,
  preferredHeight,
  minHeight = 360,
  initialSnapIndex = 0,
  keyboardTopInset = 0,
  keyboardBehavior = 'interactive',
  keyboardBlurBehavior = 'restore',
  androidKeyboardInputMode = 'adjustPan',
  enableBlurKeyboardOnGesture = true,
  fastDismiss = false,
}: PickerBottomSheetProps) {
  const ui = styles || pickerBottomSheetDefaultStyles;
  const { width, height } = useWindowDimensions();
  const bottomSheetRef = React.useRef<any>(null);
  const visibleRef = React.useRef(visible);
  const presentedRef = React.useRef(false);
  const closeNotifiedRef = React.useRef(false);
  visibleRef.current = visible;
  const sheetWidth = fullWidth ? width : Math.min(520, Math.max(280, width - 16));
  const maxSheetHeight = Math.max(minHeight, Math.min(height - topOffset, Math.round(height * 0.95)));
  const preferredSheetHeight = typeof preferredHeight === 'number'
    ? Math.min(maxSheetHeight, Math.max(minHeight, preferredHeight))
    : null;
  const snapPoints = React.useMemo(() => {
    return [preferredSheetHeight ?? maxSheetHeight];
  }, [maxSheetHeight, preferredSheetHeight]);
  const startIndex = React.useMemo(
    () => Math.max(0, Math.min(initialSnapIndex, snapPoints.length - 1)),
    [initialSnapIndex, snapPoints.length]
  );
  const animationConfigs = React.useMemo(
    () => fastDismiss
      ? ({
          damping: 54,
          stiffness: 980,
          mass: 0.45,
          overshootClamping: true,
          restDisplacementThreshold: 3,
          restSpeedThreshold: 3,
        })
      : ({
          damping: 28,
          stiffness: 320,
          mass: 0.9,
          overshootClamping: false,
          restDisplacementThreshold: 0.1,
          restSpeedThreshold: 0.1,
        }),
    [fastDismiss]
  );

  const notifyClose = React.useCallback(() => {
    if (closeNotifiedRef.current) return;
    closeNotifiedRef.current = true;
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const requestClose = React.useCallback(() => {
    if (!visibleRef.current && closeNotifiedRef.current) return;
    notifyClose();
  }, [notifyClose]);

  const handleDismiss = React.useCallback(() => {
    presentedRef.current = false;
    Keyboard.dismiss();
    if (visibleRef.current) {
      notifyClose();
    }
  }, [notifyClose]);
  const handleAnimate = React.useCallback((_fromIndex: number, toIndex: number) => {
    if (toIndex < 0) {
      requestClose();
    }
  }, [requestClose]);
  const handleChange = React.useCallback((index: number) => {
    if (index < 0) {
      requestClose();
    }
  }, [requestClose]);

  const renderBackdrop = React.useCallback(
    (props: any) => (
      <PickerBottomSheetNativeBackdrop
        animatedIndex={props.animatedIndex}
        closeOnBackdropPress={closeOnBackdropPress}
        onClose={requestClose}
      />
    ),
    [closeOnBackdropPress, requestClose]
  );

  React.useEffect(() => {
    if (!visible) {
      presentedRef.current = false;
      return undefined;
    }

    closeNotifiedRef.current = false;
    presentedRef.current = true;
    const frame = requestAnimationFrame(() => {
      bottomSheetRef.current?.present();
    });

    return () => cancelAnimationFrame(frame);
  }, [visible]);

  React.useEffect(() => {
    if (visible) {
      return;
    }
    if (presentedRef.current) {
      bottomSheetRef.current?.dismiss(animationConfigs);
    }
  }, [animationConfigs, visible]);

  React.useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [requestClose, visible]);

  const left = fullWidth ? 0 : (width - sheetWidth) / 2;
  const containerStyle = React.useMemo(
    () => [
      {
        width: sheetWidth,
        marginLeft: left,
      },
    ],
    [left, sheetWidth]
  );

  const renderHandle = React.useCallback(
    () => (
      <View style={[ui.pickerBottomSheetNativeHandle, overlayHandle && ui.pickerBottomSheetNativeHandleOverlay]}>
        <View style={[ui.pickerBottomSheetHandle, overlayHandle && ui.pickerBottomSheetHandleOverlay]} />
        {showHeader ? (
          <View style={ui.pickerBottomSheetHeader}>
            <View style={ui.pickerBottomSheetTitleRow}>
              {titleIcon ? <MaterialCommunityIcons name={titleIcon} size={18} color="#2563EB" /> : null}
              <Text style={ui.pickerBottomSheetTitle} numberOfLines={1}>{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={requestClose}
              hitSlop={8}
              style={({ pressed }) => [ui.pickerBottomSheetClose, pressed && ui.flatPressed]}
            >
              <MaterialCommunityIcons name="close" size={20} color="#475569" />
            </Pressable>
          </View>
        ) : null}
      </View>
    ),
    [overlayHandle, requestClose, showHeader, title, titleIcon, ui]
  );

  const content = (
    <>
      {typeof headerContent === 'function' ? headerContent(requestClose) : headerContent}
      <View style={ui.pickerBottomSheetBody}>{children}</View>
    </>
  );

  if (!visible) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={startIndex}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDismissOnClose
      enableDynamicSizing={false}
      enableOverDrag
      keyboardBehavior={keyboardBehavior}
      keyboardBlurBehavior={keyboardBlurBehavior}
      android_keyboardInputMode={androidKeyboardInputMode}
      topInset={Math.max(0, keyboardTopInset)}
      enableBlurKeyboardOnGesture={enableBlurKeyboardOnGesture}
      overDragResistanceFactor={2.2}
      backdropComponent={renderBackdrop}
      onDismiss={handleDismiss}
      onAnimate={handleAnimate}
      onChange={handleChange}
      containerStyle={containerStyle}
      backgroundStyle={ui.pickerBottomSheetNativeBackground}
      handleComponent={renderHandle}
      animationConfigs={animationConfigs}
    >
      <View style={[ui.pickerBottomSheetNativeContent, sheetStyle]}>{content}</View>
    </BottomSheetModal>
  );
}

function LegacyPickerBottomSheet({
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
  closeOnBackdropPress = true,
  contentScrollOffset = 0,
  enableContentDrag = false,
  closeDragDistance = 48,
  closeOnDragMove = false,
  preferredHeight,
  minHeight = 360,
}: PickerBottomSheetProps) {
  const ui = styles || pickerBottomSheetDefaultStyles;
  const { width, height } = useWindowDimensions();
  const anim = React.useRef(new Animated.Value(0)).current;
  const dragStartValueRef = React.useRef(1);
  const dragClosingRef = React.useRef(false);
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
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragClosingRef.current = false;
          dragStartValueRef.current = 1;
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (dragClosingRef.current || !visibleRef.current) return;
          const downwardDistance = Math.max(0, gestureState.dy);
          if (closeOnDragMove && downwardDistance > closeDragDistance) {
            dragClosingRef.current = true;
            closeWithAnimation();
            return;
          }
          const next = dragStartValueRef.current - downwardDistance / sheetHeight;
          anim.setValue(Math.max(0, Math.min(1, next)));
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (dragClosingRef.current || !visibleRef.current) return;
          if (gestureState.dy > closeDragDistance || gestureState.vy > 0.5) {
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
          if (dragClosingRef.current || !visibleRef.current) return;
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
    [anim, closeDragDistance, closeOnDragMove, closeWithAnimation, sheetHeight, visible]
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
          pointerEvents={closeOnBackdropPress ? 'auto' : 'none'}
          style={[
            pickerBottomSheetDefaultStyles.pickerBottomSheetBackdrop,
            ui.pickerBottomSheetBackdrop,
            { opacity: backdropOpacity },
          ]}
        >
          {closeOnBackdropPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть панель"
              onPress={closeWithAnimation}
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
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
  pickerBottomSheetNativeBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.18)' },
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
  pickerBottomSheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999, backgroundColor: '#D0D5DD', marginBottom: 12 },
  pickerBottomSheetHeader: { minHeight: 44, paddingLeft: 16, paddingRight: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerBottomSheetTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerBottomSheetTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: '800', color: '#111827' },
  pickerBottomSheetClose: { width: 36, height: 36, borderRadius: 999, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  pickerBottomSheetBody: { flex: 1, minHeight: 0, gap: 0 },
  pickerBottomSheetNativeBackground: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  pickerBottomSheetNativeHandle: { paddingTop: 8, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  pickerBottomSheetNativeContent: { flex: 1, minHeight: 0, backgroundColor: '#FFFFFF' },
  pickerBottomSheetNativeHandleOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 0, paddingTop: 0, backgroundColor: 'transparent', zIndex: 10 },
  pickerBottomSheetHandleOverlay: { position: 'absolute', top: 10, left: '50%', marginLeft: -18, marginBottom: 0, zIndex: 10 },
  flatPressed: { opacity: 0.78 },
});
