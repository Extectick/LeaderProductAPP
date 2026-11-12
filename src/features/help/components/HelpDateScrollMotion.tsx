import React, { useMemo } from 'react';
import { Animated } from 'react-native';
import type { HelpDateScrollMotionProps, HelpDateScrollScopeProps } from './HelpDateScrollMotion.types';

export type { HelpDateScrollMotionProps, HelpDateScrollScopeProps } from './HelpDateScrollMotion.types';

const PILL_HEIGHT = 24;
const HANDOFF_EPSILON = 0.01;

/** Inline dates inherit every scroll, tail and IME movement from their real cell. */
export function HelpDateScrollMotion({ mode, marker, top, scrollOffset, children }: HelpDateScrollMotionProps) {
  const pin = marker.y - top;
  const opacity = useMemo(() => scrollOffset.interpolate({
    inputRange: [pin - HANDOFF_EPSILON, pin],
    outputRange: mode === 'inline' ? [1, 0] : [0, 1],
    extrapolate: 'clamp',
  }), [scrollOffset, pin, mode]);
  const translateY = useMemo(() => {
    if (marker.nextY === undefined) return 0;
    const push = Math.max(pin, marker.nextY - top - PILL_HEIGHT);
    return scrollOffset.interpolate({
      inputRange: [push, push + PILL_HEIGHT],
      outputRange: [0, -PILL_HEIGHT],
      extrapolate: 'clamp',
    });
  }, [scrollOffset, pin, marker.nextY, top]);
  const interactive = mode === 'inline' ? !marker.pinned : marker.pinned && !marker.hidden;

  return <Animated.View
    testID={mode === 'inline' ? 'help-inline-date-motion' : 'help-moving-date'}
    pointerEvents={interactive ? 'box-none' : 'none'}
    accessibilityElementsHidden={!interactive}
    importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
    style={mode === 'inline'
      ? { opacity }
      : { position: 'absolute', top: 0, left: 0, right: 0, opacity, transform: [{ translateY }] }}
  >{children}</Animated.View>;
}

export function HelpDateScrollScope({ children }: HelpDateScrollScopeProps) {
  return <>{children}</>;
}
