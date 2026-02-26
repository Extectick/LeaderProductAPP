import { Platform, StyleSheet } from 'react-native';

export const analyticsStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  toolbarCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tabBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#1D4ED8',
  },
  tabIconBtn: {
    width: 40,
    minWidth: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  tabIconBtnHover: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(37,99,235,0.16)',
        } as any)
      : null),
  },
  tabIconBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 3px 8px rgba(37,99,235,0.15)',
        } as any)
      : null),
    opacity: 0.95,
  },
  filtersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterCol: {
    width: 190,
    gap: 6,
  },
  searchCol: {
    minWidth: 260,
    flex: 1,
    gap: 6,
  },
  exportCol: {
    width: 190,
    gap: 6,
  },
  resetCol: {
    width: 150,
    gap: 6,
  },
  filtersWrapModal: {
    flexDirection: 'column',
    gap: 10,
  },
  filterColModal: {
    width: '100%',
    gap: 6,
  },
  exportColModal: {
    width: '100%',
    gap: 6,
  },
  resetColModal: {
    width: '100%',
    gap: 6,
  },
  searchFiltersRowCompact: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  searchColCompact: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  filtersIconBtn: {
    width: 44,
    minWidth: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  filtersIconBtnHover: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(37,99,235,0.16)',
        } as any)
      : null),
  },
  filtersIconBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 3px 8px rgba(37,99,235,0.15)',
        } as any)
      : null),
    opacity: 0.95,
  },
  resetFiltersBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  resetFiltersBtnHover: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(37,99,235,0.16)',
        } as any)
      : null),
  },
  resetFiltersBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 3px 8px rgba(37,99,235,0.15)',
        } as any)
      : null),
    opacity: 0.95,
  },
  resetFiltersBtnDisabled: {
    opacity: 0.45,
  },
  resetFiltersBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  filterModalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '84%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  filterModalScroll: {
    width: '100%',
    maxHeight: 420,
  },
  filterModalContent: {
    gap: 10,
    paddingBottom: 4,
  },
  filterLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
    fontSize: 14,
    fontWeight: '500',
  },
  metaText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#1E3A8A',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  cardSub: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  slaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiGridCompact: {
    flexDirection: 'column',
  },
  kpiCard: {
    minWidth: 230,
    flexGrow: 1,
    flexBasis: 260,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 4,
  },
  kpiCardTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  kpiCompactCard: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 8,
  },
  kpiCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kpiCompactLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  kpiCompactValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  kpiCompactHint: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  kpiDetailsBtn: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  kpiDetailsBtnHover: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1E40AF',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(37,99,235,0.16)',
        } as any)
      : null),
  },
  kpiDetailsBtnPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 3px 8px rgba(37,99,235,0.15)',
        } as any)
      : null),
    opacity: 0.96,
  },
  kpiDetailsBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  kpiMetric: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  kpiMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 20,
  },
  kpiMetricLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  kpiMetricValue: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  slaCard: {
    minWidth: 220,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 4,
  },
  slaCardTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  slaCardDescription: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  slaMetric: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  tableHeader: {
    minWidth: 1470,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DDE6F1',
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#EEF2FF',
    overflow: 'hidden',
  },
  tableHeaderText: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  tableRow: {
    minWidth: 1470,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 0,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transitionDuration: '140ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  tableRowHover: {
    backgroundColor: '#F8FAFC',
    borderColor: '#BFDBFE',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 14px rgba(37,99,235,0.14)',
        } as any)
      : null),
  },
  tableRowPressed: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web' ? ({ transform: 'scale(0.998)' } as any) : null),
  },
  tableCellText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  colNumber: { width: 74 },
  colTitle: { width: 220 },
  colStatus: { width: 170 },
  colDepartment: { width: 180 },
  colSla: { width: 130 },
  colDeadline: { width: 190 },
  colLabor: { width: 360 },
  tableWrap: {
    flex: 1,
    minHeight: 0,
    marginTop: 10,
  },
  tableHorizontalScroll: {
    flex: 1,
  },
  tableHorizontalScrollMobileWeb: Platform.OS === 'web' ? ({ overflowX: 'scroll', overflowY: 'hidden' } as any) : {},
  tableHorizontalContent: {
    flexGrow: 1,
  },
  tableScrollableContent: {
    width: '100%',
    flex: 1,
  },
  tableList: {
    flex: 1,
    minHeight: 0,
  },
  tableListMobileWeb:
    Platform.OS === 'web'
      ? ({
          overflowX: 'hidden',
          overflowY: 'scroll',
          scrollbarGutter: 'stable',
        } as any)
      : {},
  tableListContent: {
    paddingBottom: 0,
  },
  tableStickyHeaderWrap: {
    zIndex: 5,
    backgroundColor: '#EEF2FF',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  modalCardCompact: {
    maxWidth: 520,
    borderRadius: 12,
    padding: 12,
  },
  peopleModalCard: {
    maxWidth: 860,
    maxHeight: '90%',
    paddingBottom: 12,
  },
  peopleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peopleBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleHeaderSpacer: {
    width: 32,
    height: 32,
  },
  peopleHeaderRight: {
    minWidth: 104,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  peopleHeaderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  peopleHeaderActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  peopleBody: {
    flex: 1,
    minHeight: 0,
  },
  peopleProfileScroll: {
    flex: 1,
  },
  peopleProfileScrollContent: {
    paddingBottom: 10,
  },
  assignModalCard: {
    maxWidth: 860,
    maxHeight: '90%',
  },
  modalList: {
    flex: 1,
    minHeight: 0,
  },
  modalLoading: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmpty: {
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  deadlineModalCard: {
    maxWidth: 560,
    maxHeight: '92%',
    padding: 0,
    overflow: 'hidden',
  },
  transferModalCard: {
    maxWidth: 620,
    maxHeight: '92%',
    padding: 0,
    overflow: 'hidden',
  },
  participantRowPressable: {
    marginBottom: 10,
  },
  kpiModalCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '88%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  kpiModalScroll: {
    width: '100%',
    maxHeight: 520,
  },
  kpiModalContent: {
    gap: 10,
    paddingBottom: 4,
  },
  menuCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F1',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 6,
  },
  menuCardCompact: {
    maxWidth: 520,
    borderRadius: 12,
    padding: 10,
  },
  webDefaultCursor: Platform.OS === 'web' ? ({ cursor: 'default' as any } as any) : {},
  modalTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  modalListContent: {
    gap: 8,
    paddingVertical: 2,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  modalBtnPrimary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  modalBtnPrimaryHover: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1E40AF',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 14px rgba(37,99,235,0.22)',
        } as any)
      : null),
  },
  modalBtnPrimaryPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 3px 8px rgba(37,99,235,0.2)',
        } as any)
      : null),
    opacity: 0.96,
  },
  modalBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBtnSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(30,41,59,0)',
        } as any)
      : null),
  },
  modalBtnSecondaryHover: {
    backgroundColor: '#F8FAFC',
    borderColor: '#94A3B8',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(30,41,59,0.12)',
        } as any)
      : null),
  },
  modalBtnSecondaryPressed: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(0px) scale(0.985)',
          boxShadow: '0 3px 6px rgba(30,41,59,0.1)',
        } as any)
      : null),
    opacity: 0.94,
  },
  modalBtnSecondaryText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  modalHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  menuItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '130ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  menuItemHover: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 14px rgba(37,99,235,0.14)',
        } as any)
      : null),
  },
  menuItemPressed: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web' ? ({ transform: 'scale(0.992)' } as any) : null),
  },
  menuItemText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },
  rowWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 6,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  rowWrapHover: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 8px 14px rgba(37,99,235,0.12)',
        } as any)
      : null),
  },
  rowWrapPressed: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web' ? ({ transform: 'scale(0.995)' } as any) : null),
  },
  rowWrapTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  laborRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  laborStatusText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  laborRowFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  laborRowFieldsCompact: {
    flexDirection: 'column',
  },
  laborFieldCol: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 120,
    gap: 4,
  },
  laborFieldColCompact: {
    width: '100%',
    minWidth: 0,
    flexBasis: 'auto',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'border-color, box-shadow, background-color',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  readOnlyFieldText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  laborAmountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  laborButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  laborQuickBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  laborQuickBtnGhost: {
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  laborQuickBtnHover: {
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(37,99,235,0.16)',
        } as any)
      : null),
  },
  laborQuickBtnPressed: {
    ...(Platform.OS === 'web' ? ({ transform: 'scale(0.99)' } as any) : null),
    opacity: 0.95,
  },
  laborQuickBtnDisabled: {
    opacity: 0.45,
  },
  laborQuickBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  laborQuickBtnGhostText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  userRateRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  usersGridContainer: {
    flex: 1,
  },
  usersGridContent: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    paddingBottom: 10,
  },
  usersGridColumn: {
    width: '100%',
  },
  usersGridItem: {
    minWidth: 0,
  },
  usersGridItemSingle: {
    alignSelf: 'flex-start',
  },
  userRateInputBlock: {
    width: 220,
    maxWidth: '100%',
  },
  userRateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userRateInput: {
    flex: 1,
    minWidth: 0,
  },
  userRateHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  rateSaveBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#2563EB',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow, opacity',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  rateSaveBtnHover: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1E40AF',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 7px 12px rgba(37,99,235,0.16)',
        } as any)
      : null),
  },
  rateSaveBtnPressed: {
    ...(Platform.OS === 'web' ? ({ transform: 'scale(0.99)' } as any) : null),
    opacity: 0.95,
  },
  rateSaveBtnDisabled: {
    opacity: 0.45,
  },
  rateSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  rateErrorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  rateSuccessText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...(Platform.OS === 'web'
      ? ({
          transitionDuration: '120ms',
          transitionProperty: 'transform, background-color, border-color, box-shadow',
          boxShadow: '0 0 0 rgba(37,99,235,0)',
        } as any)
      : null),
  },
  checkboxRowHover: {
    backgroundColor: '#F8FAFC',
    borderColor: '#BFDBFE',
    ...(Platform.OS === 'web'
      ? ({
          transform: 'translateY(-1px)',
          boxShadow: '0 6px 12px rgba(37,99,235,0.12)',
        } as any)
      : null),
  },
  checkboxRowPressed: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    ...(Platform.OS === 'web' ? ({ transform: 'scale(0.992)' } as any) : null),
  },
  checkboxText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    color: '#1E3A8A',
    fontSize: 11,
    fontWeight: '700',
  },
  deadlineCell: {
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  deadlineDateText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '500',
  },
  deadlineBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  deadlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deadlineBadgeOverdue: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deadlineBadgeTextOverdue: {
    color: '#B91C1C',
  },
  deadlineBadgeSoon: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  deadlineBadgeTextSoon: {
    color: '#B45309',
  },
  deadlineBadgeOnTimeCompleted: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  deadlineBadgeTextOnTimeCompleted: {
    color: '#15803D',
  },
  deadlineBadgeNeutral: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  deadlineBadgeTextNeutral: {
    color: '#475569',
  },
});
