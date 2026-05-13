import { Platform, StyleSheet } from 'react-native';

export const trackingStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  fullMapRoot: {
    flex: 1,
    backgroundColor: '#020617',
  },
  fullMapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  fullMapTint: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  mobileFiltersBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    backgroundColor: 'transparent',
  },
  mobilePointsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    backgroundColor: 'transparent',
  },
  mobileFiltersAnimatedWrap: {
    overflow: 'hidden',
  },
  mobileFiltersStack: {
    gap: 8,
  },
  mobileMetricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  mobileMetricField: {
    flex: 1,
    minWidth: 0,
  },
  mobileUserField: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  mobileHeaderControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileHeaderIconBtn: {
    width: 36,
    minWidth: 36,
    height: 36,
    minHeight: 36,
    paddingHorizontal: 0,
    gap: 0,
    borderRadius: 10,
  },
  mobileHeaderIconBtnActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#DBEAFE',
  },
  topOverlayWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 4,
  },
  headerFiltersWrap: {
    gap: 8,
    paddingTop: 2,
  },
  headerFiltersWrapDesktop: {
    minWidth: 0,
    maxWidth: 980,
    flexShrink: 1,
  },
  topOverlayCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.18)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 14px 28px rgba(0,0,0,0.22)',
          backdropFilter: 'blur(22px) saturate(160%)',
        } as any)
      : null),
  },
  topOverlayGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-end',
    gap: 8,
  },
  topOverlayGridMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  topOverlayField: {
    flex: 1,
    minWidth: 168,
    height: 52,
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.16)',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  topOverlayUserField: {
    minWidth: 72,
    flexGrow: 1,
    flexShrink: 1,
    overflow: 'hidden',
  },
  topOverlayLabeledField: {
    flex: 0,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 4,
  },
  topOverlayFieldCompact: {
    gap: 0,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  topOverlayAccuracyField: {
    minWidth: 164,
    width: 164,
  },
  topOverlayPointsField: {
    minWidth: 164,
    width: 164,
  },
  topOverlayFieldLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  topOverlayInputRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topOverlayInputRowCompact: {
    minHeight: 0,
    flex: 1,
  },
  topOverlayPeriodControl: {
    flex: 0,
    width: 228,
    minWidth: 228,
    maxWidth: 228,
    height: 52,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  topOverlayPeriodControlMobile: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  topOverlayPeriodMainBtn: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topOverlayPeriodClearBtn: {
    width: 40,
    borderLeftWidth: 1,
    borderLeftColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  topOverlayIconOnlyBtn: {
    width: 52,
    minWidth: 52,
    paddingHorizontal: 0,
    gap: 0,
  },
  topOverlayActionBtn: {
    height: 52,
    minHeight: 52,
  },
  topOverlayUserInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topOverlayUserAvatarWrap: {
    width: 28,
    height: 28,
    position: 'relative',
    flexShrink: 0,
  },
  topOverlayUserAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  topOverlayUserAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlayUserAvatarFallbackText: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '800',
  },
  topOverlayUserPresenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  topOverlayUserLastSeen: {
    marginTop: 1,
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  topOverlayError: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  pointsIslandBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    backgroundColor: 'transparent',
  },
  pointsIslandContainer: {
    position: 'absolute',
    zIndex: 4,
  },
  pointsIslandContainerDesktop: {
    left: 12,
    width: 340,
    bottom: 12,
  },
  pointsIslandContainerMobile: {
    left: 10,
    overflow: 'hidden',
  },
  pointsIslandShadow: {
    width: '100%',
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 16px rgba(0,0,0,0.16)' } as any)
      : null),
  },
  pointsIslandShadowMobile: {
    height: '100%',
  },
  pointsIslandGlass: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pointsIslandGlassMobile: {
    height: '100%',
  },
  pointsIslandHeader: {
    position: 'relative',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.1)',
    backgroundColor: 'transparent',
  },
  pointsIslandHandleTouch: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 2,
    alignItems: 'center',
    justifyContent: 'center',
    height: 22,
  },
  pointsIslandHandle: {
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  pointsIslandHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  pointsIslandHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  pointsIslandHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pointsIslandActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsIslandActionBtnActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#DBEAFE',
  },
  pointsIslandActionBtnDisabled: {
    opacity: 0.42,
  },
  pointsIslandCollapsedCurrent: {
    marginTop: 2,
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  pointsIslandBody: {
    overflow: 'hidden',
  },
  pointsIslandBodyMobile: {
    flex: 1,
  },
  pointsIslandList: {
    maxHeight: 560,
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  pointsIslandListMobile: {
    flex: 1,
    maxHeight: undefined,
  },
  pointsIslandEmptyWrap: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pointsIslandEmptyWrapMobile: {
    flex: 1,
    justifyContent: 'center',
  },
  pointsOverlay: {
    position: 'absolute',
    zIndex: 4,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.18)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 14px 28px rgba(0,0,0,0.22)',
          backdropFilter: 'blur(22px) saturate(160%)',
        } as any)
      : null),
  },
  pointsOverlayDesktop: {
    left: 12,
    width: 340,
    bottom: 12,
  },
  pointsOverlayMobile: {
    left: 10,
    right: 10,
    bottom: 10,
  },
  pointsOverlayHeader: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.1)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  pointsOverlayHeaderMobile: {
    paddingBottom: 8,
  },
  pointsOverlayTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  pointsOverlayMeta: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  pointsSheetHandle: {
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  pointsSheetHandleTouch: {
    alignSelf: 'center',
    paddingTop: 2,
    paddingBottom: 10,
    paddingHorizontal: 16,
    marginTop: -2,
    marginBottom: 2,
  },
  pointsOverlayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pointsOverlayHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pointsOverlayHeaderBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsOverlayHeaderBtnActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#DBEAFE',
  },
  pointsOverlayHeaderBtnDisabled: {
    opacity: 0.42,
  },
  pointsMobileAnimatedBody: {
    overflow: 'hidden',
  },
  pointsOverlayScroll: {
    maxHeight: 560,
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  pointsFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  pointsFilterField: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: '#D7E2EE',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pointsFilterFieldNarrow: {
    flex: 0,
    minWidth: 80,
    maxWidth: 90,
  },
  pointsFilterInput: {
    fontSize: 12,
    minHeight: 20,
  },
  pointsTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 32,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F3F7FF',
  },
  pointsTableHeaderText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },
  pointsTableHeaderTextRight: {
    textAlign: 'right',
  },
  pointsTableBodyContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 6,
  },
  pointsTableRow: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  pointsTableRowActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EAF3FF',
  },
  pointsTableRowHover: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FBFF',
  },
  pointsTableCellText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  pointsTableCellTextRight: {
    textAlign: 'right',
  },
  pointsTableColNo: {
    width: 36,
  },
  pointsTableColDate: {
    flex: 1,
    minWidth: 0,
    paddingRight: 0,
  },
  pointsTableColTime: {
    width: 52,
    alignItems: 'flex-end',
  },
  pointsListLoadMoreHint: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointsOverlayPagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.1)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  paginationBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationBtnDisabled: {
    opacity: 0.45,
  },
  paginationInfo: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 12,
  },
  webContentContainer: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  title: {
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE6F1',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCell: {
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fieldCol: {
    minWidth: 220,
    flexGrow: 1,
    gap: 6,
  },
  fieldLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  inputShell: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '500',
    minHeight: 24,
    paddingVertical: 0,
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
        } as any)
      : null),
  },
  inputValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  mutedText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, opacity, box-shadow, background-color, border-color',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
          cursor: 'pointer',
        } as any)
      : null),
  },
  primaryBtnHover: {
    ...(Platform.OS === 'web'
      ? ({
          backgroundColor: '#1D4ED8',
          borderColor: '#1D4ED8',
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 16px rgba(29,78,216,0.24)',
        } as any)
      : null),
  },
  primaryBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 2px 8px rgba(29,78,216,0.24)',
        } as any)
      : null),
    opacity: 0.95,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, opacity, box-shadow, background-color, border-color',
          boxShadow: '0 0 0 rgba(59,130,246,0)',
          cursor: 'pointer',
        } as any)
      : null),
  },
  secondaryBtnHover: {
    ...(Platform.OS === 'web'
      ? ({
          backgroundColor: '#DBEAFE',
          borderColor: '#93C5FD',
          transform: 'translateY(-1px)',
          boxShadow: '0 6px 14px rgba(59,130,246,0.18)',
        } as any)
      : null),
  },
  secondaryBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 2px 8px rgba(59,130,246,0.16)',
        } as any)
      : null),
    opacity: 0.95,
  },
  secondaryBtnText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mapContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#F8FAFC',
  },
  mapPlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  mapAndPointsGridDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mapColumnDesktop: {
    flex: 1.55,
    minWidth: 0,
  },
  pointsColumnDesktop: {
    flex: 1,
    minWidth: 0,
  },
  pointList: {
    gap: 8,
  },
  pointItem: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  pointItemActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#EFF6FF',
  },
  pointMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pointTime: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  pointCoords: {
    color: '#64748B',
    fontSize: 12,
  },
  pointTag: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingState: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.38)',
    padding: 12,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 18px 38px rgba(15,23,42,0.28)',
        } as any)
      : null),
  },
  modalCardCompact: {
    maxWidth: 520,
  },
  modalCardResponsive: {
    maxWidth: '96%',
  },
  modalCardTiny: {
    maxWidth: '100%',
    borderRadius: 14,
  },
  modalCardFullscreen: {
    width: '100%',
    maxWidth: 1280,
    height: '94%',
    maxHeight: '94%',
    borderRadius: 14,
  },
  modalHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalHeaderCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  modalCloseBtnHover: {
    ...(Platform.OS === 'web'
      ? ({
          backgroundColor: '#EFF6FF',
          borderColor: '#93C5FD',
          transform: 'translateY(-1px)',
          boxShadow: '0 6px 12px rgba(37,99,235,0.18)',
        } as any)
      : null),
  },
  modalCloseBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.96)',
          boxShadow: '0 2px 6px rgba(37,99,235,0.16)',
        } as any)
      : null),
    opacity: 0.95,
  },
  modalBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  modalBodyCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  modalBodyScroll: {
    maxHeight: 420,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
  },
  modalFooterCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  webDefaultCursor: Platform.OS === 'web' ? ({ cursor: 'default' } as any) : {},
  pickerRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  pickerRowActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#EFF6FF',
  },
  participantPickerRowPressable: {
    borderRadius: 14,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, opacity, box-shadow',
          boxShadow: '0 0 0 rgba(15,23,42,0)',
        } as any)
      : null),
  },
  participantPickerRowPressableHover: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 10px 16px rgba(15,23,42,0.12)',
        } as any)
      : null),
  },
  participantPickerRowPressablePressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.99)',
          boxShadow: '0 4px 8px rgba(15,23,42,0.1)',
        } as any)
      : null),
    opacity: 0.97,
  },
  participantPickerActiveCard: {
    borderColor: '#93C5FD',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 8px 16px rgba(29,78,216,0.16)',
        } as any)
      : null),
  },
  userPickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userPickerSearchShell: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  userPickerFilterToggle: {
    width: 44,
    minWidth: 44,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transitionDuration: '120ms',
          transitionProperty: 'transform, opacity, box-shadow, background-color, border-color',
          boxShadow: '0 0 0 rgba(59,130,246,0)',
        } as any)
      : null),
  },
  userPickerFilterToggleActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA',
  },
  userPickerFiltersPanel: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FBFF',
    padding: 8,
    gap: 8,
  },
  userPickerFilterFieldsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  userPickerFilterField: {
    flex: 1,
    minWidth: 170,
    gap: 5,
  },
  userPickerFilterGroup: {
    gap: 6,
  },
  userPickerFilterLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  userPickerDropdownBtn: {
    minHeight: 42,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 9,
  },
  userPickerFilterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  userPickerFilterChip: {
    maxWidth: '100%',
    minHeight: 30,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
          cursor: 'pointer',
        } as any)
      : null),
  },
  userPickerFilterChipHover: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          borderColor: '#93C5FD',
          boxShadow: '0 6px 12px rgba(59,130,246,0.15)',
        } as any)
      : null),
  },
  userPickerFilterChipActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#DBEAFE',
  },
  userPickerFilterChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  userPickerFilterChipTextActive: {
    color: '#1E40AF',
    fontWeight: '700',
  },
  userPickerLoadingRow: {
    minHeight: 14,
    justifyContent: 'center',
  },
  userPickerList: {
    maxHeight: 320,
    minHeight: 220,
  },
  userPickerListContent: {
    gap: 8,
  },
  calendarContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  calendarNavRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  calendarMonthLabel: {
    flex: 1,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  weekDaysRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  monthGrid: {
    width: '100%',
    gap: 4,
  },
  monthWeekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  monthDayBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  monthDayOutside: {
    opacity: 0.42,
  },
  monthDayInRange: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  monthDaySelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthDayText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  monthDayTextSelected: {
    color: '#FFFFFF',
  },
  mapModalContent: {
    flex: 1,
    minHeight: 0,
  },
  mapModalDesktopLayout: {
    flexDirection: 'row',
    gap: 12,
  },
  mapModalMobileLayout: {
    flexDirection: 'column',
    gap: 10,
  },
  mapModalMapColumn: {
    flex: 1.5,
    minWidth: 0,
  },
  mapModalSidebar: {
    flex: 1,
    minWidth: 300,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  mapModalSidebarHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  mapModalSidebarHeaderTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  mapModalSidebarBody: {
    padding: 10,
    gap: 8,
  },
  mapModalMobilePanel: {
    borderWidth: 1,
    borderColor: '#DDE6F1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 10,
    maxHeight: 320,
  },
});
