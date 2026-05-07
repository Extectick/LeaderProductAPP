import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  blockedContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    alignItems: 'center',
  },
  blockedCard: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  blockedInner: {
    gap: 14,
  },
  blockedTitle: {
    color: '#0F172A',
    fontWeight: '800',
  },
  desktopLayout: {
    flex: 1,
    position: 'relative',
  },
  desktopOverlayPane: {
    position: 'absolute',
    left: 12,
    width: 380,
    maxWidth: 380,
    minWidth: 360,
    bottom: 12,
    zIndex: 2,
  },
  desktopMapTint: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  desktopMapSelectionOverlay: {
    position: 'absolute',
    right: 20,
    width: 360,
    zIndex: 3,
  },
  desktopCenterPane: {
    flex: 1,
  },
  mapPane: {
    flex: 1,
  },
  mobilePanelWrap: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  mobileFullMapRoot: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  mobileFullMapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  mobileFullMapTint: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  mobileBottomOverlayWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 4,
  },
  sideCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderColor: 'rgba(15, 23, 42, 0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  sideContent: {
    flex: 1,
    minHeight: 0,
    gap: 10,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sideCardContent: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  sideContentPlain: {
    flex: 1,
    minHeight: 0,
    gap: 10,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  panelTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 0,
  },
  panelTopBarCompact: {
    gap: 4,
  },
  panelTopBarCompactButton: {
    width: 30,
    height: 30,
    margin: 0,
  },
  toLoadingToolbarButton: {
    borderWidth: 0,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  panelDepartureWrap: {
    flex: 1,
    minWidth: 0,
  },
  panelTaskTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  panelListTitleWrapCompact: {
    alignItems: 'flex-start',
    paddingHorizontal: 0,
  },
  panelTaskTitle: {
    color: '#0F172A',
    fontWeight: '900',
  },
  panelTaskMeta: {
    color: '#64748B',
    lineHeight: 16,
  },
  statusFilterButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    minHeight: 36,
    minWidth: 142,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  statusFilterButtonCompact: {
    marginTop: 1,
    minHeight: 32,
    minWidth: 92,
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  statusFilterButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusFilterButtonDisabled: {
    opacity: 0.5,
  },
  statusFilterButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  statusFilterIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  statusFilterIconWrapCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  statusFilterButtonLabel: {
    color: '#334155',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  statusFilterButtonLabelCompact: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  statusFilterMenu: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  statusFilterMenuItemSelected: {
    color: '#2563EB',
    fontWeight: '800',
  },
  mutedText: {
    color: '#64748B',
  },
  errorText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  sideScroll: {
    flex: 1,
    minHeight: 0,
  },
  sideScrollContent: {
    gap: 8,
    paddingBottom: 14,
    paddingHorizontal: 0,
    width: '100%',
    maxWidth: '100%',
  },
  routeOrderDirtyText: {
    color: '#B45309',
    fontWeight: '700',
  },
  routeOrderStatusNotice: {
    color: '#475569',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  errorCard: {
    gap: 10,
  },
  emptyTitle: {
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'center',
  },
  loadMoreIndicator: {
    marginTop: 4,
    marginBottom: 2,
  },
  mobileRouteListEndSpacer: {
    height: 40,
  },
  mapEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  departureDialog: {
    maxWidth: 430,
    width: '92%',
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  departureDialogContent: {
    gap: 12,
  },
  departureDialogTitle: {
    textAlign: 'center',
    color: '#0F172A',
    fontWeight: '900',
  },
  departureDialogText: {
    color: '#475569',
    lineHeight: 20,
    textAlign: 'center',
  },
  toLoadingDialog: {
    maxWidth: 430,
    width: '92%',
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  toLoadingDialogContent: {
    gap: 10,
  },
  toLoadingDialogTitle: {
    textAlign: 'center',
    color: '#0F172A',
    fontWeight: '900',
  },
  toLoadingDialogText: {
    color: '#475569',
    lineHeight: 20,
    textAlign: 'center',
  },
  toLoadingDialogWarning: {
    color: '#B45309',
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
  },
  departureModalScroll: {
    gap: 10,
    paddingBottom: 8,
  },
  departureSectionTitle: {
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'center',
  },
  departureOptionCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 11,
    gap: 6,
  },
  departureOptionCardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
  },
  departureOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  departureOptionTitle: {
    flex: 1,
    minWidth: 0,
    color: '#0F172A',
    fontWeight: '800',
  },
  departureOptionChip: {
    backgroundColor: '#F8FAFC',
  },
  departureActionsRow: {
    gap: 10,
  },
  departureSecondaryButton: {
    borderRadius: 14,
  },
  departurePrimaryButton: {
    borderRadius: 14,
  },
  departureMapSelectionPanel: {
    gap: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  departureMapSelectionTitle: {
    color: '#0F172A',
    fontWeight: '800',
  },
  departureMapSummary: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 4,
  },
  departureMapSummaryValue: {
    color: '#0F172A',
    fontWeight: '800',
  },
  departureMapActions: {
    gap: 8,
  },
});
