import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Platform,StyleSheet,type View} from 'react-native';
let mockTheme:'light'|'dark'='light';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockTheme})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-blur',()=>({BlurView:'BlurView'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevRef:jest.fn(),helpDevState:jest.fn()}));
jest.mock('@react-native-masked-view/masked-view',()=> 'MaskedView');
jest.mock('expo-linear-gradient',()=>({LinearGradient:'LinearGradient'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,right:0,bottom:34,left:0})}));
import {helpThemeTokens} from '../src/features/help/helpTheme';
import {HelpBlurSurface,HelpDock,HelpIcon,HelpPrimaryButton,HelpSheet} from '../src/features/help/components/HelpPrimitives';

describe('Help approved prototype tokens and primitive geometry',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined;
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;});
  test('both palettes retain distinct header, incoming, panel and soft surfaces',()=>{
    expect(helpThemeTokens(true)).toMatchObject({background:'#151B22',headerSurface:'#151B22',incoming:'#222B35',outgoing:'#233F60',text:'#F2F4F7',muted:'#A6B0BE',accentText:'#68B0FF',accent:'#398DFF',line:'#33404E',panel:'#1E2730',soft:'#203043'});
    expect(helpThemeTokens(false)).toMatchObject({background:'#F7F9FC',headerSurface:'#FFFFFF',incoming:'#FFFFFF',outgoing:'#E3EFFF',text:'#18212D',muted:'#627185',accentText:'#2563EB',accent:'#3289FF',line:'#DCE3EC',panel:'#EEF2F7',soft:'#EAF2FF'});
  });
  test('new-ticket CTA matches empty composer dimensions and disabled controls never scale',async()=>{
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpPrimaryButton,{text:'Новое обращение',onPress:jest.fn(),disabled:true}));});
    const button=screen!.root.findByProps({accessibilityRole:'button'});
    expect(StyleSheet.flatten(typeof button.props.style==='function' ? button.props.style({pressed:true}) : button.props.style)).toMatchObject({height:48,borderRadius:24,transform:[{scale:1}]});
  });
  test('active archive uses a circular soft surface',async()=>{
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpIcon,{name:'archive',label:'Открытые обращения',active:true}));});
    const button=screen!.root.findByProps({accessibilityLabel:'Открытые обращения'});
    expect(StyleSheet.flatten(typeof button.props.style==='function' ? button.props.style({pressed:false}) : button.props.style)).toMatchObject({width:40,height:40,borderRadius:20,backgroundColor:'#EAF2FF'});
    expect(button.props.accessibilityState.selected).toBe(true);
  });
  test('dock keeps keyboard-aware padding and feather starts 8px above it',async()=>{
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpDock,{children:null}));});
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-dock-backdrop'}).props.style).top).toBe(-8);
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-dock-backdrop'}).parent!.props.style)).toMatchObject({paddingHorizontal:8,paddingTop:8,paddingBottom:42});
  });
  test('sheet uses 22px upper corners and minimum260 instead of rounded cards',async()=>{
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpSheet,{title:'Подключить IT?',onClose:jest.fn(),children:null}));});
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-sheet-surface'}).props.style)).toMatchObject({minHeight:260,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,backgroundColor:'#FFFFFF'});
  });
});

describe('Help blur startup and target lifecycle',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined;
  let frames:FrameRequestCallback[];
  beforeEach(()=>{
    mockTheme='dark';frames=[];
    jest.replaceProperty(Platform,'OS','android');
    jest.spyOn(global,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
    jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{});
  });
  afterEach(async()=>{
    if(screen)await act(async()=>screen!.unmount());
    screen=undefined;mockTheme='light';jest.restoreAllMocks();
  });
  const layout=()=>screen!.root.findByProps({testID:'help-blur-surface'}).props.onLayout({nativeEvent:{layout:{x:0,y:0,width:390,height:90}}});
  test('uses current-theme preparation until both layout and native target exist',async()=>{
    const target:{current:View|null}={current:null};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpBlurSurface,{target}));});
    expect(screen!.root.findAllByType('BlurView' as any)).toHaveLength(0);
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-blur-preparing'}).props.style).backgroundColor).toBe('#151B22');
    await act(async()=>layout());
    expect(screen!.root.findAllByType('BlurView' as any)).toHaveLength(0);
    target.current={} as View;
    await act(async()=>frames[frames.length-1](0));
    expect(screen!.root.findAllByProps({testID:'help-blur-preparing'})).toHaveLength(0);
    const blur=screen!.root.findByType('BlurView' as any);
    expect(blur.props).toMatchObject({tint:'dark',frameClearColor:'#151B22',noiseEnabled:false});
    expect(blur.props.blurTarget.current).toBe(target.current);
    expect(StyleSheet.flatten(blur.props.style).backgroundColor).toBeUndefined();
  });
  test('rebinding a shared ref preserves the old snapshot and resolves the new target',async()=>{
    const first={} as View;const second={} as View;const target={current:first};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpBlurSurface,{target}));});
    await act(async()=>layout());
    const oldBinding=screen!.root.findByType('BlurView' as any).props.blurTarget;
    target.current=second;
    await act(async()=>screen!.update(React.createElement(HelpBlurSurface,{target,edge:'bottom'})));
    expect(oldBinding.current).toBe(first);
    const next=screen!.root.findByType('BlurView' as any).props.blurTarget;
    expect(next).not.toBe(oldBinding);expect(next.current).toBe(second);
  });
  test('light mode supplies its own clear color without changing blur intensity or mask',async()=>{
    mockTheme='light';
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpBlurSurface,{target:{current:{} as View}}));});
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-blur-preparing'}).props.style).backgroundColor).toBe('#F7F9FC');
    await act(async()=>layout());
    expect(screen!.root.findByType('BlurView' as any).props).toMatchObject({tint:'light',frameClearColor:'#F7F9FC',intensity:30,blurMethod:'dimezisBlurViewSdk31Plus'});
  });
});
