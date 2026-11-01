import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AccessibilityInfo,Animated,Keyboard,PanResponder,Platform,StyleSheet,type View} from 'react-native';
let mockTheme:'light'|'dark'='light';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockTheme})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-blur',()=>({BlurView:'BlurView'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevRef:jest.fn(),helpDevState:jest.fn()}));
jest.mock('@react-native-masked-view/masked-view',()=> 'MaskedView');
jest.mock('expo-linear-gradient',()=>({LinearGradient:'LinearGradient'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,right:0,bottom:34,left:0})}));
import {helpThemeTokens,useHelpReducedMotion} from '../src/features/help/helpTheme';
import {HelpBlurSurface,HelpDock,HelpIcon,HelpPrimaryButton,HelpSheet} from '../src/features/help/components/HelpPrimitives';
import {HelpVisualEffectsContext} from '../src/features/help/helpVisualEffects';

test('a long chat shares one motion subscription and a late query cannot undo a system change',async()=>{
  let changed!:(value:boolean)=>void,resolve!:(value:boolean)=>void;
  const remove=jest.fn();
  const events=jest.spyOn(AccessibilityInfo,'addEventListener').mockImplementation((_event,listener)=>{changed=listener as any;return {remove};});
  const query=jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockReturnValue(new Promise(done=>{resolve=done;}));
  function Consumer(){return React.createElement('MotionPreference',{reduced:useHelpReducedMotion()});}
  let tree!:TestRenderer.ReactTestRenderer;
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(React.Fragment,null,Array.from({length:100},(_,key)=>React.createElement(Consumer,{key}))));});
    expect(events).toHaveBeenCalledTimes(1);expect(query).toHaveBeenCalledTimes(1);
    await act(async()=>{changed(true);resolve(false);});
    expect(tree.root.findAllByType('MotionPreference' as any).every(node=>node.props.reduced===true)).toBe(true);
    await act(async()=>tree.unmount());expect(remove).toHaveBeenCalledTimes(1);
  }finally{if(tree)await act(async()=>tree.unmount());events.mockRestore();query.mockRestore();}
});

test('IT sheet captures downward drags over buttons, restores cancellation and dismisses once',async()=>{
  let handlers:any;
  const capture=jest.spyOn(PanResponder,'create').mockImplementation(config=>{handlers=config;return {panHandlers:{}} as any;});
  const timing=jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>({start:(done?:any)=>{value.setValue(config.toValue);done?.({finished:true});},stop:jest.fn(),reset:jest.fn()}) as any);
  const spring=jest.spyOn(Animated,'spring').mockImplementation((value:any)=>({start:()=>value.setValue(0),stop:jest.fn(),reset:jest.fn()}) as any);
  const close=jest.fn();let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpSheet,{title:'Подключить IT?',onClose:close,children:null}));});
  try{
    expect(handlers.onMoveShouldSetPanResponderCapture(null,{dy:30,dx:4})).toBe(true);
    expect(handlers.onMoveShouldSetPanResponderCapture(null,{dy:-30,dx:4})).toBe(false);
    await act(async()=>{handlers.onPanResponderGrant();handlers.onPanResponderMove(null,{dy:40});handlers.onPanResponderTerminate();});
    expect(spring).toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
    await act(async()=>{handlers.onPanResponderRelease(null,{dy:120,vy:.2});handlers.onPanResponderRelease(null,{dy:120,vy:.2});});expect(close).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>tree.unmount());capture.mockRestore();timing.mockRestore();spring.mockRestore();}
});

test('inactive Help scenes release native blur layers',async()=>{
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpVisualEffectsContext.Provider,{value:false},React.createElement(HelpBlurSurface,{})));});
  try{expect(tree.toJSON()).toBeNull();}finally{await act(async()=>tree.unmount());}
});

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
  test('zero-height keyboard reports cannot remove the dock safe area during opening',async()=>{
    jest.spyOn(Keyboard,'isVisible').mockReturnValue(true);
    jest.spyOn(Keyboard,'metrics').mockReturnValue({height:-24} as any);
    let shown:((event:any)=>void)|undefined;
    jest.spyOn(Keyboard,'addListener').mockImplementation(((event:string,callback:any)=>{if(event==='keyboardDidShow')shown=callback;return {remove:jest.fn()};}) as any);
    jest.replaceProperty(Platform,'OS','android');
    try {
      await act(async()=>{screen=TestRenderer.create(React.createElement(HelpDock,{children:null}));});
      const padding=()=>StyleSheet.flatten(screen!.root.findByProps({testID:'help-dock-backdrop'}).parent!.props.style).paddingBottom;
      expect(padding()).toBe(42);
      await act(async()=>shown!({endCoordinates:{height:0}}));expect(padding()).toBe(42);
      await act(async()=>shown!({endCoordinates:{height:240}}));expect(padding()).toBe(8);
    } finally {jest.restoreAllMocks();}
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
  const layout=()=>screen!.root.findByType('MaskedView' as any).props.onLayout({nativeEvent:{layout:{x:0,y:0,width:390,height:90}}});
  test('stays transparent until both layout and native target exist',async()=>{
    const target:{current:View|null}={current:null};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpBlurSurface,{target}));});
    expect(screen!.root.findAllByType('BlurView' as any)).toHaveLength(0);
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'app-blur-preparing'}).props.style).backgroundColor).toBeUndefined();
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
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'app-blur-preparing'}).props.style).backgroundColor).toBeUndefined();
    await act(async()=>layout());
    expect(screen!.root.findByType('BlurView' as any).props).toMatchObject({tint:'light',frameClearColor:'#F7F9FC',intensity:30,blurMethod:'dimezisBlurViewSdk31Plus'});
  });
});
