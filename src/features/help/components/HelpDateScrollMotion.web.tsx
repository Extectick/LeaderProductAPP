import React, { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { HelpDateScrollMotionProps, HelpDateScrollScopeProps } from './HelpDateScrollMotion.types';

export type { HelpDateScrollMotionProps, HelpDateScrollScopeProps } from './HelpDateScrollMotion.types';

const PILL_HEIGHT = 24;
const HANDOFF_EPSILON = 0.01;
const INLINE_ANIMATION = 'leader-help-date-inline';
const PINNED_ANIMATION = 'leader-help-date-pinned';
const PUSH_ANIMATION = 'leader-help-date-push';
const RETIRE_ANIMATION = 'leader-help-date-retire';
const KEYFRAMES = `
@keyframes ${INLINE_ANIMATION} { from { visibility: visible; } to { visibility: hidden; } }
@keyframes ${PINNED_ANIMATION} { from { visibility: hidden; } to { visibility: visible; } }
@keyframes ${PUSH_ANIMATION} { from { transform: translateY(0); } to { transform: translateY(-${PILL_HEIGHT}px); } }
@keyframes ${RETIRE_ANIMATION} { from { visibility: visible; } to { visibility: hidden; } }
`;

type ScrollAnimationStyle = CSSProperties & {
  animationTimeline?: string;
  animationRange?: string;
};

function supportsScrollTimeline() {
  return typeof CSS !== 'undefined'
    && CSS.supports('scroll-timeline-name', '--leader-help-date')
    && CSS.supports('timeline-scope', '--leader-help-date')
    && CSS.supports('animation-range', '0px 24px');
}

function timelineName(scrollId: string) {
  // Hex code points avoid collisions between different punctuation-heavy RN IDs.
  return `--leader-help-date-${Array.from(scrollId, character => character.codePointAt(0)!.toString(16)).join('-')}`;
}

function animation(name: string, timeline: string, start: number, end: number, stepped = false): ScrollAnimationStyle {
  return {
    animationName: name,
    animationDuration: 'auto',
    animationTimingFunction: stepped ? 'steps(1, end)' : 'linear',
    animationFillMode: 'both',
    animationTimeline: timeline,
    animationRange: `${start}px ${end}px`,
  };
}

/** No scroll event transport: the browser applies handoff/push in its scroll frame. */
export function HelpDateScrollMotion({ mode, marker, top, scrollId, children }: HelpDateScrollMotionProps) {
  const supported = supportsScrollTimeline();
  const timeline = timelineName(scrollId);
  const pin = marker.y - top;
  const push = marker.nextY === undefined ? null : Math.max(pin, marker.nextY - top - PILL_HEIGHT);
  const interactive = mode === 'inline' ? !marker.pinned : marker.pinned && !marker.hidden;
  const style: ScrollAnimationStyle = mode === 'inline'
    ? { position: 'relative', pointerEvents: 'none', visibility: 'visible' }
    : { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none', visibility: 'hidden' };

  if (supported) {
    Object.assign(style, animation(mode === 'inline' ? INLINE_ANIMATION : PINNED_ANIMATION,
      timeline, pin - HANDOFF_EPSILON, pin, true));
    if (mode === 'pinned' && push !== null) {
      // Clipping does not remove an offscreen button from the Tab order. Retire
      // the previous date in the same scroll frame once it leaves the layer.
      style.animationName = `${PINNED_ANIMATION}, ${RETIRE_ANIMATION}`;
      style.animationFillMode = 'both, forwards';
      style.animationTimeline = `${timeline}, ${timeline}`;
      style.animationRange = `${pin - HANDOFF_EPSILON}px ${pin}px, ${push}px ${push + PILL_HEIGHT}px`;
    }
  } else if (mode === 'pinned') {
    // Older engines keep real inline dates, without an asynchronously positioned
    // copy or overlapping pills during a day handoff.
    style.display = 'none';
  }

  // visibility also removes the hidden subtree from pointer hit testing. Unlike
  // JS-derived pointerEvents, it changes in the same frame as the scroll timeline.
  return <div
    data-testid={mode === 'inline' ? 'help-inline-date-motion' : 'help-moving-date'}
    aria-hidden={mode === 'pinned' ? !interactive : supported && marker.pinned}
    style={style}
  >{mode === 'pinned' && supported && push !== null
      ? <div style={animation(PUSH_ANIMATION, timeline, push, push + PILL_HEIGHT)}>{children}</div>
      : children}
  </div>;
}

type PropertyBinding = {
  original: string;
  originalPriority: string;
  values: Map<string, number>;
  applied: string;
};
const bindings = new WeakMap<HTMLElement, Map<string, PropertyBinding>>();

/** Shared scopes can briefly coexist while a retained viewport is being replaced. */
function bindProperty(element: HTMLElement, property: string, value: string) {
  let properties = bindings.get(element);
  if (!properties) { properties = new Map(); bindings.set(element, properties); }
  let binding = properties.get(property);
  if (!binding) {
    binding = {
      original: element.style.getPropertyValue(property),
      originalPriority: element.style.getPropertyPriority(property),
      values: new Map(),
      applied: '',
    };
    properties.set(property, binding);
  }
  binding.values.set(value, (binding.values.get(value) ?? 0) + 1);
  const apply = () => {
    const original = binding!.original.trim();
    const names = new Set(original && original !== 'none' ? original.split(/\s*,\s*/) : []);
    for (const name of binding!.values.keys()) names.add(name);
    binding!.applied = property === 'scroll-timeline-axis' ? value
      : original === 'all' && property === 'timeline-scope' ? 'all'
      : Array.from(names).join(', ');
    element.style.setProperty(property, binding!.applied);
  };
  apply();
  return () => {
    const count = binding!.values.get(value) ?? 0;
    if (count > 1) binding!.values.set(value, count - 1);
    else binding!.values.delete(value);
    if (binding!.values.size) { apply(); return; }
    if (element.style.getPropertyValue(property) === binding!.applied) {
      if (binding!.original) element.style.setProperty(property, binding!.original, binding!.originalPriority);
      else element.style.removeProperty(property);
    }
    properties!.delete(property);
    if (!properties!.size) bindings.delete(element);
  };
}

/** Makes a scroll source visible to its sibling pinned layer without moving DOM. */
export function HelpDateScrollScope({ scrollId, children }: HelpDateScrollScopeProps) {
  const scope = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!supportsScrollTimeline() || !scope.current) return;
    const name = timelineName(scrollId);
    let release: (() => void) | undefined;
    const attach = () => {
      const source = document.getElementById(scrollId);
      const ownScope = scope.current;
      if (!source || !ownScope) return false;
      let common: HTMLElement | null = ownScope;
      while (common && !common.contains(source)) common = common.parentElement;
      if (!common) return false;
      const releases = [
        bindProperty(source, 'scroll-timeline-name', name),
        bindProperty(source, 'scroll-timeline-axis', 'block'),
        bindProperty(common, 'timeline-scope', name),
      ];
      release = () => releases.reverse().forEach(dispose => dispose());
      return true;
    };
    // Source and overlay normally commit together. Initial list preparation can
    // mount the source later; observe only that DOM arrival, never scroll frames.
    const observer = attach() ? null : new MutationObserver(() => {
      if (attach()) observer?.disconnect();
    });
    observer?.observe(scope.current.ownerDocument.body, { childList: true, subtree: true });
    return () => { observer?.disconnect(); release?.(); };
  }, [scrollId]);
  return <div ref={scope} style={{ display: 'contents' }}>
    <style>{KEYFRAMES}</style>
    {children}
  </div>;
}
