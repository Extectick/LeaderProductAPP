import type { ReactNode } from 'react';
import type { Animated } from 'react-native';

export type HelpDateScrollMotionProps = {
  mode: 'inline' | 'pinned';
  marker: { y: number; nextY?: number; hidden: boolean; pinned: boolean };
  top: number;
  scrollOffset: Animated.Value;
  scrollId: string;
  children: ReactNode;
};

export type HelpDateScrollScopeProps = { scrollId: string; children: ReactNode };
