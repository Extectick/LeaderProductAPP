import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent } from 'react-native';
import { useHelpReducedMotion } from '../helpTheme';

/** Independent implementation of Telegram's regular fragment motion: a short
 * 48dp horizontal offset with a 150ms decelerating fade after content is ready. */
export type HelpChatEntryHandle = { reveal: () => void };
export const HelpChatEntry = forwardRef<HelpChatEntryHandle, { ready: boolean; children: React.ReactNode; onLayout: (event: LayoutChangeEvent) => void; onEntered: () => void; backgroundColor: string }>(function HelpChatEntry({ ready: initiallyReady, children, onLayout, onEntered, backgroundColor }, ref) {
  const [revealed, setRevealed] = useState(false);
  const [animating,setAnimating]=useState(false);
  const ready = initiallyReady || revealed;
  useImperativeHandle(ref, () => ({ reveal: () => setRevealed(true) }), []);
  const reduced = useHelpReducedMotion();
  const progress = useRef(new Animated.Value(ready ? 1 : 0)).current;
  const entered = useRef(onEntered); entered.current = onEntered;
  const generation=useRef(0),didEnter=useRef(false);
  useEffect(() => {
    const token=++generation.current;
    const finish=()=>{if(token===generation.current&&!didEnter.current){didEnter.current=true;setAnimating(false);entered.current();}};
    progress.stopAnimation();
    if(didEnter.current){progress.setValue(1);setAnimating(false);return;}
    if (!ready || reduced) { setAnimating(false);progress.setValue(ready ? 1 : 0); if (ready) finish(); return; }
    setAnimating(true);
    const animation = Animated.timing(progress, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false });
    animation.start(({finished}) => { if (finished) finish(); });
    return () => {++generation.current;animation.stop();};
  }, [ready, reduced, progress]);
  return <Animated.View testID="help-chat-viewport" onLayout={onLayout} renderToHardwareTextureAndroid={animating} needsOffscreenAlphaCompositing={animating} pointerEvents={ready ? 'auto' : 'none'} style={{ flex: 1, backgroundColor, opacity: ready ? progress : 0, transform: [{ translateX: ready ? progress.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) : 48 }] }}>{children}</Animated.View>;
});
