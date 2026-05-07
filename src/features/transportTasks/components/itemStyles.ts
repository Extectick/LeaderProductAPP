import { StyleSheet } from 'react-native';

export const itemStyles = StyleSheet.create({
  listItem: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingLeft: 6,
    paddingRight: 5,
  },
  listItemCompact: {
    paddingVertical: 6,
    paddingLeft: 5,
    paddingRight: 4,
  },
  departureListItem: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
    paddingRight: 6,
  },
  departureListItemCompact: {
    paddingRight: 5,
  },
  departureListItemSelected: {
    borderColor: '#D97706',
    backgroundColor: '#FFEDD5',
  },
  listItemSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  listItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listItemTitle: {
    flex: 1,
    minWidth: 0,
    color: '#0F172A',
    fontWeight: '800',
  },
  statusIconButton: {
    width: 32,
    height: 32,
    margin: 0,
    borderWidth: 1,
    flexShrink: 0,
  },
  pointHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 6,
  },
  pointHeaderCompact: {
    gap: 6,
    paddingRight: 2,
  },
  pointNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
    flexShrink: 0,
  },
  pointNumberCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  pointNumberSelected: {
    backgroundColor: '#2563EB',
  },
  departurePointNumber: {
    backgroundColor: '#D97706',
  },
  pointNumberEditable: {
    cursor: 'pointer' as any,
  },
  pointNumberHover: {
    backgroundColor: '#CBD5E1',
  },
  pointNumberEditing: {
    backgroundColor: '#16A34A',
  },
  pointNumberText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  pointNumberTextCompact: {
    fontSize: 12,
  },
  pointNumberTextSelected: {
    color: '#FFFFFF',
  },
  departurePointNumberText: {
    color: '#FFFFFF',
  },
  pointNumberTextEditing: {
    color: '#FFFFFF',
  },
  pointNumberInput: {
    width: 20,
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    padding: 0,
  },
  pointNumberInputCompact: {
    width: 18,
    fontSize: 12,
  },
  pointNumberInputSelected: {
    color: '#FFFFFF',
  },
  pointNumberInputEditing: {
    color: '#FFFFFF',
  },
  pointTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pointAddressText: {
    color: '#0F172A',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 15,
    marginTop: 1,
  },
  pointAddressTextCompact: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 0,
  },
  pointMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 5,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  pointMetaRowCompact: {
    gap: 6,
    marginTop: 4,
    paddingTop: 3,
  },
  pointMetaText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 15,
    flexShrink: 1,
  },
  pointMetaTextCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  pointRouteText: {
    color: '#7C8DA6',
    fontSize: 11,
    lineHeight: 14,
    flexShrink: 1,
    marginTop: 3,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  pointRouteTextCompact: {
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
    paddingTop: 1,
  },
  routeDragHandleWrap: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeDragHandle: {
    width: 34,
    minHeight: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'grab' as any,
  },
  routeDragHandleHovered: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    shadowColor: '#2563EB',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  routeDragHandlePressed: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA',
    cursor: 'grabbing' as any,
  },
  routeDragHandleDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed' as any,
  },
  routeDragIcon: {
    margin: 0,
  },
  departurePointEditButton: {
    width: 34,
    height: 34,
    margin: 0,
    flexShrink: 0,
  },
  departurePointEditButtonCompact: {
    width: 32,
    height: 32,
  },
  departureHeaderCard: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 10,
  },
  departureHeaderIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  departureHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  departureHeaderPrimary: {
    color: '#0F172A',
    fontWeight: '700',
  },
  departureHeaderAddress: {
    color: '#64748B',
    lineHeight: 16,
  },
  departureCardEmpty: {
    color: '#9A3412',
    fontWeight: '700',
  },
});
