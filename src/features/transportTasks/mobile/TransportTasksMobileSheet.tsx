import {
  FLOATING_TAB_BAR_BOTTOM_OFFSET,
  FLOATING_TAB_BAR_HEIGHT,
} from '@/components/Navigation/FloatingTabBar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, PanResponder, Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { departurePrimaryText, routePointAddress } from '../lib/formatters';
import TransportTasksMobileSheetContent from './TransportTasksMobileSheetContent';
import TransportTasksMobileSheetHeader from './TransportTasksMobileSheetHeader';
import {
  MOBILE_SHEET_BODY_MIN_HEIGHT,
  MOBILE_SHEET_BOTTOM_GAP,
  MOBILE_SHEET_COLLAPSED_HEIGHT,
  MOBILE_SHEET_MAX_HEIGHT_RATIO,
  MOBILE_SHEET_MAX_WIDTH,
  MOBILE_SHEET_MIN_EXPANDED_HEIGHT,
  MOBILE_SHEET_SIDE_INSET,
  MOBILE_SHEET_TOP_RESERVED,
} from './mobileSheet.constants';
import { mobileSheetStyles as styles } from './styles';
import type { TransportTasksMobileSheetProps } from './types';

export default function TransportTasksMobileSheet({
  topInset = 0,
  onExpandedChange,
  collapseRequestId = 0,
  onPositionEditFocusChange,
  selectedTask,
  selectedRoutePointIndex,
  tasks,
  tasksHasMore,
  routeForView,
  departurePoint,
  ...rest
}: TransportTasksMobileSheetProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(true);
  const [headerHeight, setHeaderHeight] = useState(MOBILE_SHEET_COLLAPSED_HEIGHT);
  const [bodyContentHeight, setBodyContentHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const dragStartValueRef = useRef(0);
  const lastCollapseRequestRef = useRef(collapseRequestId);
  const sheetPositionEditingRef = useRef(false);

  const collapsedHeight = MOBILE_SHEET_COLLAPSED_HEIGHT;
  const effectiveCollapsedHeight = collapsedHeight;
  const bottomOffset = useMemo(
    () => {
      if (keyboardHeight > 0) return keyboardHeight + MOBILE_SHEET_BOTTOM_GAP;
      return FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + insets.bottom + MOBILE_SHEET_BOTTOM_GAP;
    },
    [insets.bottom, keyboardHeight]
  );
  const maxExpandedHeight = useMemo(() => {
    const fromViewport = Math.round(height * MOBILE_SHEET_MAX_HEIGHT_RATIO);
    const topReserved = Math.max(MOBILE_SHEET_TOP_RESERVED, Math.ceil(topInset) + 8);
    const maxAllowed = Math.max(MOBILE_SHEET_MIN_EXPANDED_HEIGHT, height - bottomOffset - topReserved);
    return Math.max(MOBILE_SHEET_MIN_EXPANDED_HEIGHT, Math.min(fromViewport, maxAllowed));
  }, [bottomOffset, height, topInset]);
  const maxBodyExpandedHeight = useMemo(
    () => Math.max(MOBILE_SHEET_BODY_MIN_HEIGHT, maxExpandedHeight - effectiveCollapsedHeight),
    [effectiveCollapsedHeight, maxExpandedHeight]
  );
  const isRouteListMode = Boolean(selectedTask && routeForView.length > 0);
  const shouldPinListBodyHeight = Boolean(isRouteListMode || (!selectedTask && tasks.length > 0));
  const shouldSkipHeightAnimation = Platform.OS !== 'web' && isRouteListMode;
  const bodyExpandedHeight = useMemo(
    () =>
      shouldPinListBodyHeight
        ? maxBodyExpandedHeight
        : Math.max(1, Math.min(maxBodyExpandedHeight, Math.ceil(bodyContentHeight || MOBILE_SHEET_BODY_MIN_HEIGHT))),
    [bodyContentHeight, maxBodyExpandedHeight, shouldPinListBodyHeight]
  );
  const expandedHeight = useMemo(
    () => Math.ceil((headerHeight || collapsedHeight) + bodyExpandedHeight),
    [bodyExpandedHeight, collapsedHeight, headerHeight]
  );
  const shellWidth = Math.min(MOBILE_SHEET_MAX_WIDTH, Math.max(280, width - MOBILE_SHEET_SIDE_INSET * 2));

  useEffect(() => {
    if (shouldSkipHeightAnimation) {
      panelAnim.setValue(expanded ? 1 : 0);
      return;
    }

    Animated.spring(panelAnim, {
      toValue: expanded ? 1 : 0,
      damping: 20,
      stiffness: expanded ? 220 : 240,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }, [expanded, panelAnim, shouldSkipHeightAnimation]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    setBodyContentHeight(0);
  }, [selectedTask?.guid]);

  useEffect(() => {
    if (collapseRequestId === lastCollapseRequestRef.current) return;
    lastCollapseRequestRef.current = collapseRequestId;
    setExpanded(false);
  }, [collapseRequestId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      if (!sheetPositionEditingRef.current) return;
      setKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0));
      setExpanded(true);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handlePositionEditFocusChange = (editing: boolean) => {
    sheetPositionEditingRef.current = editing;
    onPositionEditFocusChange?.(editing);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) =>
          Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          dragStartValueRef.current = expanded ? 1 : 0;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const travel = Math.max(1, expandedHeight - effectiveCollapsedHeight);
          const next = dragStartValueRef.current - gestureState.dy / travel;
          panelAnim.setValue(Math.max(0, Math.min(1, next)));
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const travel = Math.max(1, expandedHeight - effectiveCollapsedHeight);
          const next = dragStartValueRef.current - gestureState.dy / travel;
          const clamped = Math.max(0, Math.min(1, next));
          const startedExpanded = dragStartValueRef.current >= 0.5;
          const movedUp = gestureState.dy <= -10 || gestureState.vy <= -0.08;
          const movedDown = gestureState.dy >= 10 || gestureState.vy >= 0.08;

          if (!startedExpanded) {
            setExpanded(movedUp || clamped >= 0.2);
            return;
          }

          setExpanded(!(movedDown || clamped <= 0.8));
        },
      }),
    [effectiveCollapsedHeight, expanded, expandedHeight, panelAnim]
  );

  const title = selectedTask ? selectedTask.number || 'Задание на перевозку' : 'Задания на перевозку';
  const meta = useMemo(() => {
    if (selectedTask) {
      const pointCount = routeForView.length + (departurePoint ? 1 : 0);
      return `На карте: ${pointCount} ${pointCount === 1 ? 'точка' : pointCount < 5 ? 'точки' : 'точек'}`;
    }
    return `Заданий: ${tasks.length}${tasksHasMore ? '+' : ''}`;
  }, [departurePoint, routeForView.length, selectedTask, tasks.length, tasksHasMore]);
  const currentText = useMemo(() => {
    if (selectedTask) {
      if (selectedRoutePointIndex === null) return departurePrimaryText(departurePoint);
      const point = routeForView[selectedRoutePointIndex];
      return point ? routePointAddress(point) : `Маршрут: ${selectedTask.number || selectedTask.guid}`;
    }
    const firstTask = tasks[0];
    if (!firstTask) return 'Нет доступных заданий';
    return firstTask.number || firstTask.guid;
  }, [departurePoint, routeForView, selectedRoutePointIndex, selectedTask, tasks]);

  const animatedShellStyle = useMemo(
    () => ({
      height: panelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [effectiveCollapsedHeight, expandedHeight],
      }),
    }),
    [effectiveCollapsedHeight, expandedHeight, panelAnim]
  );

  const animatedBodyStyle = useMemo(
    () => ({
      opacity: panelAnim,
      height: panelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, bodyExpandedHeight],
      }),
      transform: [
        {
          translateY: panelAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
      ],
    }),
    [bodyExpandedHeight, panelAnim]
  );

  return (
    <Animated.View
      style={[
        styles.overlayWrap,
        {
          bottom: bottomOffset,
          width: shellWidth,
          left: (width - shellWidth) / 2,
        },
        animatedShellStyle,
      ]}
    >
      <View style={styles.shell}>
        <TransportTasksMobileSheetHeader
          expanded={expanded}
          title={title}
          meta={meta}
          currentText={currentText}
          onToggle={() => setExpanded((current) => !current)}
          onHeightChange={setHeaderHeight}
          panHandlers={panResponder.panHandlers}
        />
        <Animated.View style={[styles.body, animatedBodyStyle]}>
          <TransportTasksMobileSheetContent
            expanded={expanded}
            onAfterSelectPoint={() => setExpanded(false)}
            selectedTask={selectedTask}
            selectedRoutePointIndex={selectedRoutePointIndex}
            tasks={tasks}
            tasksHasMore={tasksHasMore}
            routeForView={routeForView}
            departurePoint={departurePoint}
            onBodyContentHeightChange={setBodyContentHeight}
            onPositionEditFocusChange={handlePositionEditFocusChange}
            {...rest}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
