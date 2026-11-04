import React, { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router/react-navigation';
import { useTheme } from '@/context/ThemeContext';
import { useThemeColor } from '@/hooks/useThemeColor';

/** One set of edge/material settings for app headers, chat headers and docks. */
import { APP_EDGE_BLUR } from './appBlurTokens';
export { APP_EDGE_BLUR } from './appBlurTokens';
type Target = React.RefObject<View | null>;
const BlurContext = createContext<{ target?: Target; bind: (node: View | null) => void; release: (node: View | null) => void }>({ bind: () => {}, release: () => {} });
export function ScreenBlurProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<Target>();
  const bind = useCallback((node: View | null) => setTarget(previous => previous?.current === node ? previous : node ? { current: node } : undefined), []);
  const release = useCallback((node: View | null) => setTarget(previous => previous?.current === node ? undefined : previous), []);
  return <BlurContext.Provider value={{ target, bind, release }}>{children}</BlurContext.Provider>;
}
export const useScreenBlurTarget = () => useContext(BlurContext).target;

/** Register only the focused scene; retained stack screens cannot steal its blur. */
export const ScreenBlurTarget = forwardRef<View, ViewProps>(function ScreenBlurTarget({ children, onLayout, ...props }, ref) {
  const own = useRef<View | null>(null), focused = useIsFocused();
  const { bind, release } = useContext(BlurContext);
  useImperativeHandle(ref, () => own.current as View);
  useLayoutEffect(() => {
    if (!focused) return;
    const node = own.current;
    bind(node);
    return () => release(node);
  }, [focused, bind, release]);
  return <BlurTargetView {...props} ref={own} onLayout={event => { if (focused) bind(own.current); onLayout?.(event); }}>{children}</BlurTargetView>;
});

/** A transparent fade at the content edge; never paint an opaque loading plate. */
export function AppEdgeBlur({ target, edge = 'top', backgroundColor, dark, testID = 'app-edge-blur', intensity = APP_EDGE_BLUR.intensity, featherSize, progressive = false }: {
  target?: Target; edge?: 'top' | 'bottom'; backgroundColor?: string; dark?: boolean; testID?: string; intensity?: number; featherSize?: number; progressive?: boolean;
}) {
  const { theme } = useTheme();
  const appBackground = useThemeColor({}, 'background');
  const focused = useIsFocused();
  const [surfaceHeight, setSurfaceHeight] = useState(0);
  const [boundTarget, setBoundTarget] = useState<Target>();
  useLayoutEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true, frame: number | undefined;
    const bind = () => {
      if (!alive) return;
      const node = focused ? target?.current ?? null : null;
      setBoundTarget(previous => previous?.current === node ? previous : node ? { current: node } : undefined);
      if (focused && target && !node) frame = requestAnimationFrame(bind);
    };
    bind();
    return () => { alive = false; if (frame !== undefined) cancelAnimationFrame(frame); };
  });
  // Native-stack retains the outgoing scene during its transition. Its live
  // blur must not keep sampling the incoming page (or its own faded chrome).
  // Also never draw one commit with a previously bound Android capture target.
  const ready = Platform.OS !== 'android' || surfaceHeight > 0 && Boolean(target?.current) && boundTarget?.current === target?.current;
  const requestedFeather = featherSize ?? (edge === 'top' ? APP_EDGE_BLUR.topFeather : APP_EDGE_BLUR.bottomFeather);
  // Short docks still reach full blur at the screen edge. A fixed 104dp
  // gradient must not extend past a 60dp surface and get clipped halfway.
  const feather = Math.min(requestedFeather, surfaceHeight || requestedFeather);
  const measureSurface = (event: {nativeEvent: {layout: {width:number;height:number}}}) => {
    const {width,height}=event.nativeEvent.layout;
    setSurfaceHeight(previous=>width>0&&height>0?Math.abs(previous-height)>.5?height:previous:0);
  };
  const mask = `linear-gradient(${edge === 'top' ? 'to bottom' : 'to top'}, transparent 0, #00000018 ${feather * .25}px, #00000080 ${feather * .6}px, #000 ${feather}px)`;
  if (!focused) return null;
  if (Platform.OS === 'web') return <View testID={testID} pointerEvents="none" onLayout={measureSurface} style={[StyleSheet.absoluteFill, {
    backdropFilter: `blur(${APP_EDGE_BLUR.webRadius}px)`, WebkitBackdropFilter: `blur(${APP_EDGE_BLUR.webRadius}px)`, maskImage: mask, WebkitMaskImage: mask,
  } as any]}/>;
  if(progressive)return <View testID={testID} pointerEvents="none" onLayout={measureSurface} style={StyleSheet.absoluteFill}>
    {!ready?<View testID="app-blur-preparing" style={StyleSheet.absoluteFill}/>:null}
    {[.28,.6,1].map((strength,index)=>{
      const start=index*.22;
      const colors=['#00000000','#00000000','#00000080','#000000'] as const;
      const locations=[0,start+.01,Math.min(.95,start+.3),1] as const;
      return <MaskedView key={strength} testID={`${testID}-layer-${index}`} pointerEvents="none" style={StyleSheet.absoluteFill}
        maskElement={<View style={{flex:1,flexDirection:edge==='top'?'column':'column-reverse'}}>
          <LinearGradient colors={edge==='top'?colors:[...colors].reverse() as any}
            locations={edge==='top'?locations:[...locations].reverse().map(value=>1-value) as any} style={{height:feather}}/>
          <View style={{flex:1,backgroundColor:'#000'}}/>
        </View>}>
        {ready?<BlurView blurTarget={Platform.OS==='android'?boundTarget:target} blurMethod="dimezisBlurViewSdk31Plus" noiseEnabled={false}
          frameClearColor={backgroundColor??appBackground} intensity={intensity*strength} tint={(dark??theme==='dark')?'dark':'light'} style={StyleSheet.absoluteFill}/>:null}
      </MaskedView>;
    })}
  </View>;
  return <MaskedView testID={testID} pointerEvents="none" onLayout={measureSurface} style={StyleSheet.absoluteFill}
    maskElement={<View style={{ flex: 1, flexDirection: edge === 'top' ? 'column' : 'column-reverse' }}>
      <LinearGradient colors={edge === 'top' ? ['#00000000', '#00000018', '#00000080', '#000000'] : ['#000000', '#00000080', '#00000018', '#00000000']}
        locations={edge === 'top' ? [0, .25, .6, 1] : [0, .4, .75, 1]} style={{ height: feather }}/><View style={{ flex: 1, backgroundColor: '#000' }}/>
    </View>}>
    {ready ? <BlurView blurTarget={Platform.OS === 'android' ? boundTarget : target} blurMethod="dimezisBlurViewSdk31Plus" noiseEnabled={false}
      frameClearColor={backgroundColor ?? appBackground} intensity={intensity} tint={(dark ?? theme === 'dark') ? 'dark' : 'light'} style={StyleSheet.absoluteFill}/>
      : <View testID="app-blur-preparing" style={StyleSheet.absoluteFill}/>}
  </MaskedView>;
}
