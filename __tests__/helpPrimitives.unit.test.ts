import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AccessibilityInfo,Animated,Dimensions,Image,Keyboard,Modal,PanResponder,Platform,StyleSheet,type View} from 'react-native';
jest.mock('expo-router/react-navigation',()=>({useIsFocused:()=>true}));
jest.mock('react-native-gesture-handler',()=>{
 const make=()=>{const result:any={handlers:{}};for(const key of ['withTestId','enabled','maxPointers','activeOffsetY','failOffsetX'])result[key]=()=>result;for(const key of ['onStart','onUpdate','onEnd','onFinalize'])result[key]=(fn:any)=>{result.handlers[key]=fn;return result;};return result;};
 return {Gesture:{Pan:make},GestureDetector:'GestureDetector',GestureHandlerRootView:'GestureHandlerRootView'};
});
jest.mock('react-native-reanimated',()=>({
 __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),runOnJS:(fn:any)=>fn,
 useSharedValue:(value:any)=>require('react').useRef({value}).current,
 useAnimatedStyle:(fn:any)=>({get height(){return fn().height;},get transform(){return fn().transform;},get overflow(){return fn().overflow;}}),
 withTiming:jest.fn((value:any,_options:any,done:any)=>{done?.(true);return value;}),
 withSpring:(value:any)=>value,
}));
let mockTheme:'light'|'dark'='light';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockTheme})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-blur',()=>({BlurView:'BlurView'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevRef:jest.fn(),helpDevState:jest.fn()}));
jest.mock('@react-native-masked-view/masked-view',()=> 'MaskedView');
jest.mock('expo-linear-gradient',()=>({LinearGradient:'LinearGradient'}));
let mockSafeAreaBottom=34;
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,right:0,bottom:mockSafeAreaBottom,left:0})}));
import {helpThemeTokens,useHelpReducedMotion} from '../src/features/help/helpTheme';
import {HelpAvatar,HelpBlurSurface,HelpDock,HelpIcon,HelpPrimaryButton,HelpSheet} from '../src/features/help/components/HelpPrimitives';
import {HelpVisualEffectsContext} from '../src/features/help/helpVisualEffects';
import {AppDesktopDialog} from '../components/ui/AppDesktopDialog';

test('desktop HelpSheet is bounded, scrollable and closes once; mobile keeps gesture sheet',async()=>{
  const oldWindow=Dimensions.get('window'),oldPlatform=Platform.OS;let tree!:TestRenderer.ReactTestRenderer;
  const close=jest.fn();Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});Dimensions.set({window:{width:1280,height:800,scale:1,fontScale:1}});
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(HelpSheet,{title:'Подключить IT?',onClose:close,maxHeight:420,children:React.createElement('ConfirmationActions')}));});
    expect(tree.root.findAllByType('GestureDetector' as any)).toHaveLength(0);
    expect(tree.root.findByType(AppDesktopDialog).props.title).toBe('Подключить IT?');
    expect(StyleSheet.flatten(tree.root.findAll(node=>node.props.testID==='help-desktop-dialog'&&node.props.style)[0].props.style)).toMatchObject({maxWidth:520,maxHeight:420,borderRadius:20});
    expect(tree.root.findByType(Modal).props.accessibilityLabel).toBe('Подключить IT?');
    const modalClose=tree.root.findByType(Modal).props.onRequestClose;
    await act(async()=>{tree.root.findByProps({testID:'help-desktop-dialog-close'}).props.onPress();modalClose();});
    expect(close).toHaveBeenCalledTimes(1);
    await act(async()=>Dimensions.set({window:{width:390,height:844,scale:1,fontScale:1}}));
    expect(tree.root.findAllByType(AppDesktopDialog)).toHaveLength(0);expect(tree.root.findAllByType('GestureDetector' as any)).toHaveLength(1);
  }finally{
    if(tree)await act(async()=>tree.unmount());Object.defineProperty(Platform,'OS',{configurable:true,value:oldPlatform});Dimensions.set({window:oldWindow});
  }
});

test('native keyboard dock ignores transient navigation insets without keyboard JS subscriptions',async()=>{
  const listener=jest.spyOn(Keyboard,'addListener');let tree!:TestRenderer.ReactTestRenderer;
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(HelpDock,{stableKeyboardLayout:true,children:null}));});
    const padding=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-dock-backdrop'}).parent!.props.style).paddingBottom;
    expect(padding()).toBe(42);expect(listener).not.toHaveBeenCalled();
    mockSafeAreaBottom=122;
    await act(async()=>tree.update(React.createElement(HelpDock,{stableKeyboardLayout:true,children:null})));
    expect(padding()).toBe(42);
    mockSafeAreaBottom=34;
    await act(async()=>tree.update(React.createElement(HelpDock,{stableKeyboardLayout:true,children:null})));
    expect(padding()).toBe(42);
  }finally{mockSafeAreaBottom=34;if(tree)await act(async()=>tree.unmount());listener.mockRestore();}
});

test('native dock coalesces composer animation heights without delaying the initial measurement',async()=>{
  jest.useFakeTimers();const changed=jest.fn(),frame=jest.fn();let tree!:TestRenderer.ReactTestRenderer;
  try{
    await act(async()=>{tree=TestRenderer.create(React.createElement(HelpDock,{stableKeyboardLayout:true,onHeight:changed,onHeightFrame:frame,children:null}));});
    const layout=(height:number)=>tree.root.findByProps({testID:'help-dock-backdrop'}).parent!.props.onLayout({nativeEvent:{layout:{height}}});
    act(()=>layout(64));expect(changed).toHaveBeenLastCalledWith(64);
    act(()=>{layout(80);layout(100);layout(64);});expect(changed).toHaveBeenCalledTimes(1);
    expect(frame.mock.calls.map(call=>call[0])).toEqual([64,80,100,64]);
    await act(async()=>jest.advanceTimersByTime(60));
    expect(changed).toHaveBeenCalledTimes(2);expect(changed).toHaveBeenLastCalledWith(64);
    act(()=>layout(90));await act(async()=>tree.unmount());
    await act(async()=>jest.advanceTimersByTime(100));expect(changed).toHaveBeenCalledTimes(2);
  }finally{if(tree)await act(async()=>tree.unmount());jest.useRealTimers();}
});

test('a long chat shares one motion subscription and a late query cannot undo a system change',async()=>{
  let changed!:(value:boolean)=>void,resolve!:(value:boolean)=>void;
  const remove=jest.fn();
  const events=jest.spyOn(AccessibilityInfo,'addEventListener').mockImplementation((_event,listener)=>{changed=listener as any;return {remove};});
  const query=jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockReturnValue(new Promise(done=>{resolve=done;}));
  events.mockClear();query.mockClear();
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

test('IT sheet grows upward, follows downward drag, restores cancellation and closes once',async()=>{
  const close=jest.fn();let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpSheet,{title:'Подключить IT?',onClose:close,children:null}));});
  try{
    const gesture=()=>tree.root.findByType('GestureDetector' as any).props.gesture.handlers;
    const panel=()=>StyleSheet.flatten(tree.root.findAllByProps({testID:'help-sheet-surface'})[0].props.style);
    const initial=panel().height;
    act(()=>{gesture().onStart();gesture().onUpdate({translationY:-100});});expect(panel().height).toBe(initial+100);
    act(()=>gesture().onFinalize({},false));expect(panel().height).toBe(initial);expect(close).not.toHaveBeenCalled();
    act(()=>{gesture().onStart();gesture().onUpdate({translationY:120});gesture().onEnd({translationY:120,velocityY:100},true);gesture().onEnd({translationY:120,velocityY:100},true);});
    expect(close).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>tree.unmount());}
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
  test('dock blur starts at the composer edge and extends through the safe area',async()=>{
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpDock,{children:null}));});
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-dock-backdrop'}).props.style).top).toBe(8);
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
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'help-sheet-surface'}).props.style)).toMatchObject({height:260,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,backgroundColor:'#EEF2F7'});
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
  const layout=()=>screen!.root.findAll(node=>node.props.testID==='help-blur-surface'&&typeof node.props.onLayout==='function')[0].props.onLayout({nativeEvent:{layout:{x:0,y:0,width:390,height:90}}});
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
    const blur=screen!.root.findAllByType('BlurView' as any).slice(-1)[0];
    expect(blur.props).toMatchObject({tint:'dark',frameClearColor:'#151B22',noiseEnabled:false});
    expect(blur.props.blurTarget.current).toBe(target.current);
    expect(StyleSheet.flatten(blur.props.style).backgroundColor).toBeUndefined();
  });
  test('rebinding a shared ref preserves the old snapshot and resolves the new target',async()=>{
    const first={} as View;const second={} as View;const target={current:first};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpBlurSurface,{target}));});
    await act(async()=>layout());
    const oldBinding=screen!.root.findAllByType('BlurView' as any).slice(-1)[0].props.blurTarget;
    target.current=second;
    await act(async()=>screen!.update(React.createElement(HelpBlurSurface,{target,edge:'bottom'})));
    expect(oldBinding.current).toBe(first);
    const next=screen!.root.findAllByType('BlurView' as any).slice(-1)[0].props.blurTarget;
    expect(next).not.toBe(oldBinding);expect(next.current).toBe(second);
  });
  test('light mode supplies its own clear color without changing blur intensity or mask',async()=>{
    mockTheme='light';
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpBlurSurface,{target:{current:{} as View}}));});
    expect(StyleSheet.flatten(screen!.root.findByProps({testID:'app-blur-preparing'}).props.style).backgroundColor).toBeUndefined();
    await act(async()=>layout());
    const blurs=screen!.root.findAllByType('BlurView' as any);
    expect(blurs).toHaveLength(1);
    expect(blurs[0].props).toMatchObject({tint:'light',frameClearColor:'#F7F9FC',intensity:30,blurMethod:'dimezisBlurViewSdk31Plus'});
  });
});

test('IT sheet cannot stretch upward or snap to a tall expanded state',async()=>{
 let tree!:TestRenderer.ReactTestRenderer;
 await act(async()=>{tree=TestRenderer.create(React.createElement(HelpSheet,{title:'Подключить IT?',resizable:false,maxHeight:420,onClose:jest.fn(),children:null}));});
 const panel=()=>StyleSheet.flatten(tree.root.findAllByProps({testID:'help-sheet-surface'})[0].props.style);
 const gesture=tree.root.findByType('GestureDetector' as any).props.gesture.handlers,initial=panel().height;
 act(()=>{gesture.onStart();gesture.onUpdate({translationY:-1000});gesture.onEnd({translationY:-1000,velocityY:-2000},true);});
 expect(panel().height).toBe(initial);expect(panel().height).toBeLessThanOrEqual(420);
 await act(async()=>tree.unmount());
});

test('an unactivated upward swipe keeps the measured IT sheet height and cancel action visible',async()=>{
 const close=jest.fn();let tree!:TestRenderer.ReactTestRenderer;
 await act(async()=>{tree=TestRenderer.create(React.createElement(HelpSheet,{title:'Подключить IT?',resizable:false,maxHeight:420,onClose:close,children:React.createElement('CancelAction')}));});
 try{
  const panel=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-sheet-surface'}).props.style);
  // Native layout measures the real content after the initial 260dp estimate.
  await act(async()=>tree.root.findAll(node=>typeof node.props.onLayout==='function')[0].props.onLayout({nativeEvent:{layout:{height:220}}}));
  const measured=panel().height;
  expect(measured).toBe(350);
  const gesture=()=>tree.root.findByType('GestureDetector' as any).props.gesture.handlers;
  // activeOffsetY=8 never activates an upward swipe: only finalize is delivered.
  act(()=>gesture().onFinalize({translationY:-15},false));
  expect(panel().height).toBe(measured);expect(panel().transform).toEqual([{translateY:0}]);
  expect(close).not.toHaveBeenCalled();
  // A real interrupted downward drag restores the measured height as before.
  act(()=>{gesture().onStart();gesture().onUpdate({translationY:20});});
  expect(panel().height).toBe(measured-20);
  act(()=>gesture().onFinalize({translationY:20},false));
  expect(panel().height).toBe(measured);
  act(()=>gesture().onFinalize({translationY:-15},false));
  expect(panel().height).toBe(measured);expect(close).not.toHaveBeenCalled();
 }finally{await act(async()=>tree.unmount());}
});


test('avatar keeps its fallback while loading and after a failed image',async()=>{
 let tree!:TestRenderer.ReactTestRenderer;
 const fallback=React.createElement('AvatarFallback' as any);
 try{
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpAvatar,{id:1,name:'IT',uri:'https://test/avatar.png',fallback}));});
  expect(tree.root.findAllByType('AvatarFallback' as any)).toHaveLength(1);
  expect(StyleSheet.flatten(tree.root.findByType(Image).props.style).opacity).toBe(0);
  await act(async()=>tree.root.findByType(Image).props.onLoad());
  expect(StyleSheet.flatten(tree.root.findByType(Image).props.style).opacity).toBe(1);
  await act(async()=>tree.update(React.createElement(HelpAvatar,{id:2,name:'Другой',uri:'https://test/other.png',fallback})));
  expect(StyleSheet.flatten(tree.root.findByType(Image).props.style).opacity).toBe(0);
  await act(async()=>tree.root.findByType(Image).props.onError());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(tree.root.findAllByType('AvatarFallback' as any)).toHaveLength(1);
 }finally{if(tree)await act(async()=>tree.unmount());}
});
