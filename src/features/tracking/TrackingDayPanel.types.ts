import type React from 'react';

export type TrackingDayPanelProps = {
  children: React.ReactNode;
  summary: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  bottomInset: number;
};
