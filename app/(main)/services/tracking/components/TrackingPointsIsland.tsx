import { LiquidGlassSurface } from '@/components/ui/LiquidGlassSurface';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  FLOATING_TAB_BAR_BOTTOM_OFFSET,
  FLOATING_TAB_BAR_HEIGHT,
} from '@/components/Navigation/FloatingTabBar';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  type ListRenderItem,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoutePointDto } from '@/utils/trackingService';
import { trackingStyles as styles } from '../styles';

export type TrackingPointsPanelMode = 'collapsed' | 'expanded';

export type TrackingPointRow = {
  point: RoutePointDto;
  globalIdx: number;
  dateLabel: string;
  timeLabel: string;
};

type TrackingPointsIslandProps = {
  isMobileLayout: boolean;
  rows: TrackingPointRow[];
  visibleRows: TrackingPointRow[];
  selectedPointIndex: number | null;
  onSelectPoint: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  desktopTop: number;
  onExpandedChange?: (expanded: boolean) => void;
  collapseRequestId?: number;
};

const withOpacity = (color: string, opacity: number) => {
  if (!color.startsWith('#')) return color;
  const hex = color.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const int = Number.parseInt(normalized, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export default function TrackingPointsIsland({
  isMobileLayout,
  rows,
  visibleRows,
  selectedPointIndex,
  onSelectPoint,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onLoadMore,
  hasMore,
  desktopTop,
  onExpandedChange,
  collapseRequestId = 0,
}: TrackingPointsIslandProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const isDark = theme === 'dark';

  const borderColor = withOpacity(textColor, isDark ? 0.12 : 0.18);
  const baseSurfaceOpacity = isDark ? 0.6 : 0.82;
  const surfaceOverlayOpacity = Math.min(
    baseSurfaceOpacity + (Platform.OS === 'android' ? 0.08 : 0),
    0.95
  );
  const surfaceColor = withOpacity(backgroundColor, surfaceOverlayOpacity);

  const [panelMode, setPanelMode] = useState<TrackingPointsPanelMode>(
    isMobileLayout ? 'collapsed' : 'expanded'
  );
  const panelAnim = useRef(new Animated.Value(isMobileLayout ? 0 : 1)).current;
  const wasMobileLayoutRef = useRef(isMobileLayout);
  const lastCollapseRequestRef = useRef(collapseRequestId);
  const dragStartValueRef = useRef(isMobileLayout ? 0 : 1);
  const mobileIslandMaxWidth = 420;
  const mobileIslandSideInset = 10;

  const mobileBottomOffset = useMemo(
    () => FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_OFFSET + insets.bottom + 8,
    [insets.bottom]
  );
  const collapsedHeight = 96;
  const expandedHeight = useMemo(() => {
    const fromViewport = Math.round(height * 0.52);
    const maxAllowed = Math.max(260, height - 176);
    return Math.max(260, Math.min(fromViewport, maxAllowed));
  }, [height]);
  const bodyExpandedHeight = useMemo(() => Math.max(150, expandedHeight - 82), [expandedHeight]);

  const isExpanded = !isMobileLayout || panelMode === 'expanded';

  useEffect(() => {
    if (wasMobileLayoutRef.current === isMobileLayout) return;
    wasMobileLayoutRef.current = isMobileLayout;
    setPanelMode(isMobileLayout ? 'collapsed' : 'expanded');
    panelAnim.setValue(isMobileLayout ? 0 : 1);
  }, [isMobileLayout, panelAnim]);
  useEffect(() => {
    onExpandedChange?.(isMobileLayout && panelMode === 'expanded');
  }, [isMobileLayout, onExpandedChange, panelMode]);

  useEffect(() => {
    if (!isMobileLayout) {
      panelAnim.setValue(1);
      return;
    }
    if (panelMode === 'expanded') {
      Animated.spring(panelAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: false,
      }).start();
      return;
    }
    Animated.timing(panelAnim, {
      toValue: 0,
      duration: 190,
      useNativeDriver: false,
    }).start();
  }, [isMobileLayout, panelAnim, panelMode]);

  const openPanel = useCallback(() => {
    if (!isMobileLayout) return;
    setPanelMode('expanded');
  }, [isMobileLayout]);

  const closePanel = useCallback(() => {
    if (!isMobileLayout) return;
    setPanelMode('collapsed');
  }, [isMobileLayout]);

  const togglePanel = useCallback(() => {
    if (!isMobileLayout) return;
    setPanelMode((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'));
  }, [isMobileLayout]);
  useEffect(() => {
    if (!isMobileLayout) return;
    if (collapseRequestId === lastCollapseRequestRef.current) return;
    lastCollapseRequestRef.current = collapseRequestId;
    setPanelMode('collapsed');
  }, [collapseRequestId, isMobileLayout]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          isMobileLayout &&
          Math.abs(gestureState.dy) > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) =>
          isMobileLayout &&
          Math.abs(gestureState.dy) > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          dragStartValueRef.current = panelMode === 'expanded' ? 1 : 0;
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (!isMobileLayout) return;
          const travel = Math.max(1, expandedHeight - collapsedHeight);
          const next = dragStartValueRef.current - gestureState.dy / travel;
          const clamped = Math.max(0, Math.min(1, next));
          panelAnim.setValue(clamped);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (!isMobileLayout) return;
          const travel = Math.max(1, expandedHeight - collapsedHeight);
          const next = dragStartValueRef.current - gestureState.dy / travel;
          const clamped = Math.max(0, Math.min(1, next));
          const startedExpanded = dragStartValueRef.current >= 0.5;
          const movedUp = gestureState.dy <= -10 || gestureState.vy <= -0.08;
          const movedDown = gestureState.dy >= 10 || gestureState.vy >= 0.08;

          // Bottom-sheet style snapping:
          // 1) If user dragged in a clear direction, finish in that direction.
          // 2) Otherwise, snap by proximity to nearest state.
          if (!startedExpanded) {
            if (movedUp || clamped >= 0.2) {
              openPanel();
              return;
            }
            closePanel();
            return;
          }

          if (movedDown || clamped <= 0.8) {
            closePanel();
            return;
          }
          openPanel();
        },
      }),
    [closePanel, collapsedHeight, expandedHeight, isMobileLayout, openPanel, panelAnim, panelMode]
  );

  const selectedRowPosition = useMemo(() => {
    if (rows.length === 0) return -1;
    if (selectedPointIndex == null) return 0;
    const found = rows.findIndex((row) => row.globalIdx === selectedPointIndex);
    return found >= 0 ? found : 0;
  }, [rows, selectedPointIndex]);

  const collapsedMeta = useMemo(() => {
    if (rows.length === 0) return 'Точек: 0';
    return `#${selectedRowPosition + 1} из ${rows.length}`;
  }, [rows.length, selectedRowPosition]);
  const collapsedCurrentRow = useMemo(() => {
    if (rows.length === 0) return null;
    if (selectedRowPosition < 0) return rows[0] ?? null;
    return rows[selectedRowPosition] ?? rows[0] ?? null;
  }, [rows, selectedRowPosition]);
  const collapsedCurrentPointInfo = useMemo(() => {
    if (!collapsedCurrentRow) return 'Нет точек';
    const lat = collapsedCurrentRow.point.latitude.toFixed(5);
    const lng = collapsedCurrentRow.point.longitude.toFixed(5);
    return `${collapsedCurrentRow.dateLabel} ${collapsedCurrentRow.timeLabel} · ${lat}, ${lng}`;
  }, [collapsedCurrentRow]);

  const desktopMeta = useMemo(
    () => `Показано ${visibleRows.length} из ${rows.length}`,
    [rows.length, visibleRows.length]
  );

  const renderRow: ListRenderItem<TrackingPointRow> = useCallback(
    ({ item }) => {
      const isActive = selectedPointIndex === item.globalIdx;
      return (
        <Pressable
          key={`overlay-pt-${item.point.id}-${item.globalIdx}`}
          onPress={() => onSelectPoint(item.globalIdx)}
          style={(state: any) => [
            styles.pointsTableRow,
            isActive && styles.pointsTableRowActive,
            state?.hovered && !isActive && styles.pointsTableRowHover,
            state?.pressed && { opacity: 0.95 },
          ]}
        >
          <View style={styles.pointsTableColNo}>
            <Text style={styles.pointsTableCellText}>#{item.globalIdx + 1}</Text>
          </View>
          <View style={styles.pointsTableColDate}>
            <Text style={styles.pointsTableCellText} numberOfLines={1}>
              {item.dateLabel}
            </Text>
          </View>
          <View style={styles.pointsTableColTime}>
            <Text style={[styles.pointsTableCellText, styles.pointsTableCellTextRight]} numberOfLines={1}>
              {item.timeLabel}
            </Text>
          </View>
        </Pressable>
      );
    },
    [onSelectPoint, selectedPointIndex]
  );

  const animatedMobileShellStyle = useMemo(
    () => ({
      height: panelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [collapsedHeight, expandedHeight],
      }),
    }),
    [collapsedHeight, expandedHeight, panelAnim]
  );

  const animatedMobileBodyStyle = useMemo(
    () => ({
      opacity: panelAnim,
      maxHeight: panelAnim.interpolate({
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
  const collapsedHeaderRowStyle = useMemo(
    () =>
      isMobileLayout && !isExpanded
        ? ({
            position: 'absolute',
            top: 16,
            left: 12,
            right: 12,
          } as const)
        : null,
    [isExpanded, isMobileLayout]
  );
  const collapsedHeaderStyle = useMemo(
    () =>
      isMobileLayout && !isExpanded
        ? ({
            minHeight: 76,
            paddingTop: 0,
            paddingBottom: 0,
          } as const)
        : null,
    [isExpanded, isMobileLayout]
  );

  return (
    <>
      <Animated.View
        style={[
          styles.pointsIslandContainer,
          isMobileLayout ? styles.pointsIslandContainerMobile : styles.pointsIslandContainerDesktop,
          !isMobileLayout && { top: desktopTop },
          isMobileLayout && {
            bottom: mobileBottomOffset,
            width: Math.min(mobileIslandMaxWidth, Math.max(280, width - mobileIslandSideInset * 2)),
            left: (width - Math.min(mobileIslandMaxWidth, Math.max(280, width - mobileIslandSideInset * 2))) / 2,
            right: undefined,
          },
          isMobileLayout && animatedMobileShellStyle,
        ]}
      >
        <View style={[styles.pointsIslandShadow, isMobileLayout && styles.pointsIslandShadowMobile]}>
          <LiquidGlassSurface
            blurTint={isDark ? 'dark' : 'light'}
            blurIntensity={36}
            overlayColor={surfaceColor}
            borderColor={borderColor}
            webBackdropFilter="blur(22px) saturate(160%)"
            style={[styles.pointsIslandGlass, isMobileLayout && styles.pointsIslandGlassMobile]}
          >
            <View
              style={[styles.pointsIslandHeader, collapsedHeaderStyle]}
              {...(isMobileLayout ? panResponder.panHandlers : {})}
            >
              {isMobileLayout ? (
                <View style={styles.pointsIslandHandleTouch}>
                  <View style={styles.pointsIslandHandle} />
                </View>
              ) : null}
              <View style={[styles.pointsIslandHeaderRow, collapsedHeaderRowStyle]}>
                <Pressable
                  onPress={isExpanded ? closePanel : openPanel}
                  disabled={!isMobileLayout}
                  style={({ pressed }) => [
                    styles.pointsIslandHeaderMain,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.pointsOverlayTitle}>Точки трекинга</Text>
                  <Text style={styles.pointsOverlayMeta}>{isMobileLayout ? collapsedMeta : desktopMeta}</Text>
                  {isMobileLayout && !isExpanded ? (
                    <Text style={styles.pointsIslandCollapsedCurrent} numberOfLines={1}>
                      {collapsedCurrentPointInfo}
                    </Text>
                  ) : null}
                </Pressable>

                {isMobileLayout ? (
                  <View style={styles.pointsIslandHeaderActions}>
                    <Pressable
                      onPress={onPrev}
                      disabled={!hasPrev}
                      accessibilityLabel="Предыдущая точка"
                      style={(state: any) => [
                        styles.pointsIslandActionBtn,
                        !hasPrev && styles.pointsIslandActionBtnDisabled,
                        state?.pressed && hasPrev && { opacity: 0.92 },
                      ]}
                    >
                      <Ionicons name="chevron-back" size={16} color="#1D4ED8" />
                    </Pressable>
                    <Pressable
                      onPress={onNext}
                      disabled={!hasNext}
                      accessibilityLabel="Следующая точка"
                      style={(state: any) => [
                        styles.pointsIslandActionBtn,
                        !hasNext && styles.pointsIslandActionBtnDisabled,
                        state?.pressed && hasNext && { opacity: 0.92 },
                      ]}
                    >
                      <Ionicons name="chevron-forward" size={16} color="#1D4ED8" />
                    </Pressable>
                    <Pressable
                      onPress={togglePanel}
                      accessibilityLabel={isExpanded ? 'Свернуть список точек' : 'Развернуть список точек'}
                      style={(state: any) => [
                        styles.pointsIslandActionBtn,
                        isExpanded && styles.pointsIslandActionBtnActive,
                        state?.pressed && { opacity: 0.92 },
                      ]}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-down-outline' : 'chevron-up-outline'}
                        size={18}
                        color="#1D4ED8"
                      />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>

            {!isMobileLayout || isExpanded ? (
              <Animated.View
                style={[
                  styles.pointsIslandBody,
                  isMobileLayout && styles.pointsIslandBodyMobile,
                  isMobileLayout && animatedMobileBodyStyle,
                ]}
              >
                <View style={styles.pointsTableHeaderRow}>
                  <View style={styles.pointsTableColNo}>
                    <Text style={styles.pointsTableHeaderText}>№</Text>
                  </View>
                  <View style={styles.pointsTableColDate}>
                    <Text style={styles.pointsTableHeaderText}>Дата</Text>
                  </View>
                  <View style={styles.pointsTableColTime}>
                    <Text style={[styles.pointsTableHeaderText, styles.pointsTableHeaderTextRight]}>
                      Время
                    </Text>
                  </View>
                </View>

                {visibleRows.length === 0 ? (
                  <View style={[styles.pointsIslandEmptyWrap, isMobileLayout && styles.pointsIslandEmptyWrapMobile]}>
                    <Text style={styles.mutedText}>Нет точек для отображения.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={visibleRows}
                    keyExtractor={(item) => `${item.point.id}-${item.globalIdx}`}
                    style={[styles.pointsIslandList, isMobileLayout && styles.pointsIslandListMobile]}
                    contentContainerStyle={styles.pointsTableBodyContent}
                    renderItem={renderRow}
                    onEndReachedThreshold={0.35}
                    onEndReached={() => {
                      if (hasMore) onLoadMore();
                    }}
                    ListFooterComponent={
                      hasMore ? (
                        <View style={styles.pointsListLoadMoreHint}>
                          <Text style={styles.mutedText}>Прокрутите вниз для подгрузки...</Text>
                        </View>
                      ) : null
                    }
                    keyboardShouldPersistTaps="handled"
                  />
                )}
              </Animated.View>
            ) : null}
          </LiquidGlassSurface>
        </View>
      </Animated.View>
    </>
  );
}
