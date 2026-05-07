import { Platform, StyleSheet } from 'react-native';

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as const) : null;

export const mobileSheetStyles = StyleSheet.create({
  overlayWrap: {
    position: 'absolute',
    zIndex: 4,
  },
  shell: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.93)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.1)',
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    ...(webPressable ?? {}),
  },
  title: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    marginTop: 1,
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  currentText: {
    marginTop: 2,
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggleBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: 'rgba(239, 246, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(webPressable ?? {}),
  },
  toggleBtnActive: {
    borderColor: '#60A5FA',
    backgroundColor: '#DBEAFE',
  },
  body: {
    minHeight: 0,
    overflow: 'hidden',
  },
  toolbarWrap: {
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 0,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginHorizontal: 6,
    marginBottom: 6,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    height: '100%',
  },
  scrollContent: {
    gap: 6,
    paddingTop: 0,
    paddingLeft: 6,
    paddingRight: 6,
    paddingBottom: 4,
  },
  statusNoticeText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  routeListEndSpacer: {
    height: 4,
  },
  loadMoreIndicator: {
    marginTop: 4,
    marginBottom: 2,
  },
});
