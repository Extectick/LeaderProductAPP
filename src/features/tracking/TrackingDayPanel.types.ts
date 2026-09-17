import type React from 'react';
import type { FlatListProps } from 'react-native';

export type TrackingTimelineItem = {
  key: string; at: string; icon: string; color: string; title: string; subtitle: string;
  orderGuid: string | null; latitude?: number | null; longitude?: number | null;
};

export type TrackingDayPanelProps = {
  listProps: FlatListProps<TrackingTimelineItem>;
  dateControls: React.ReactNode;
  navigation?: React.ReactNode;
  onHeaderHeightChange?: (height: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshDisabled: boolean;
  summary: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  bottomInset: number;
};
