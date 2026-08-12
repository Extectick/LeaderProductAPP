import { Platform, StyleSheet } from 'react-native';

export const ADMIN_DESKTOP_BREAKPOINT = 980;

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
  container: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    ...Platform.select({
      web: {
        maxWidth: 1600,
        paddingHorizontal: 24,
      },
      default: {},
    }),
  },
  mobileContainer: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  panel: {
    flex: 1,
    minHeight: 0,
  },
  paperPanel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
  },
  paperPanelContent: {
    flex: 1,
    minHeight: 0,
    padding: 12,
  },
  tabsSurface: {
    borderRadius: 16,
    padding: 6,
  },
  tabsSurfaceCompact: {
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  tabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabButton: {
    borderRadius: 999,
  },
  tabButtonCompact: {
    borderRadius: 10,
  },
  tabButtonLabelCompact: {
    fontSize: 12,
  },
  desktopLayout: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  mobileLayout: {
    flex: 1,
    minHeight: 0,
  },
  mobilePanelContent: {
    flex: 1,
    minHeight: 0,
  },
  mobilePanelContentPadded: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  sectionCard: {
    borderRadius: 14,
  },
  sectionContent: {
    gap: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  mutedText: {
    color: '#64748B',
    textAlign: 'center',
  },
});

export type AdminPaperStyles = typeof styles;
