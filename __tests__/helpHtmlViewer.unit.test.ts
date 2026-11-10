import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Dimensions,Modal,Platform,StyleSheet,Text} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
let mockReduced=true,mockHoldAnimation=false;
const mockTimings:Array<{value:number;done?: (finished:boolean)=>void}>=[];
jest.mock('react-native-gesture-handler',()=>{
 const build=(kind:string)=>{
  const result:any={kind,config:{},handlers:{}};
  for(const key of ['withTestId','manualActivation','maxPointers','enabled','requireExternalGestureToFail','disallowInterruption'])result[key]=(...args:unknown[])=>{result.config[key]=args.length===1?args[0]:args;return result;};
  for(const key of ['onTouchesDown','onTouchesMove','onTouchesUp','onStart','onUpdate','onEnd','onFinalize'])result[key]=(handler:unknown)=>{result.handlers[key]=handler;return result;};
  return result;
 };
 return {Gesture:{Pan:()=>build('pan'),Native:()=>build('native')},GestureDetector:'GestureDetector',GestureHandlerRootView:'GestureHandlerRootView'};
});
jest.mock('react-native-reanimated',()=>{
 const React=require('react'),RN=require('react-native');
 return {__esModule:true,default:{View:RN.View},cancelAnimation:jest.fn(),runOnJS:(fn:unknown)=>fn,
  useSharedValue:(initial:unknown)=>React.useRef({value:initial}).current,
  useAnimatedStyle:(fn:()=>any)=>({get transform(){return fn().transform;},get opacity(){return fn().opacity;}}),
  withTiming:(value:number,_:unknown,done?:(finished:boolean)=>void)=>{mockTimings.push({value,done});if(!mockHoldAnimation)done?.(true);return value;},
  withSpring:(value:number)=>value,Easing:{out:(fn:unknown)=>fn,inOut:(fn:unknown)=>fn,cubic:(value:number)=>value},
 };
});
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced,useHelpTheme:()=>({text:'#18212D',background:'#F7F9FC',panel:'#EEF2F7',incoming:'#FFFFFF'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpIcon:'HelpIcon',HelpBlurSurface:'HelpBlurSurface'}));
jest.mock('expo-blur',()=>({BlurTargetView:'BlurTargetView'}));
jest.mock('../src/features/help/components/HelpHtmlSurface',()=>({HelpHtmlSurface:'HtmlSurface'}));
jest.mock('../src/features/help/helpHtmlActions',()=>({downloadHelpHtml:jest.fn(async()=>{}),copyHelpHtmlLink:jest.fn(async()=>{})}));
import {AuthContext} from '../context/AuthContext';
import {HelpHtmlViewer} from '../src/features/help/components/HelpHtmlViewer';
import {copyHelpHtmlLink,downloadHelpHtml} from '../src/features/help/helpHtmlActions';
import {HelpHeaderFrame} from '../src/features/help/components/HelpHeaderFrame';
import {HelpMoreCloseButton} from '../src/features/help/components/HelpChatHeader';
import {HelpViewerLayout} from '../src/features/help/components/HelpViewerLayout';
import type {HelpHtmlArtifact} from '../src/features/help/helpHtml';
import {API_BASE_URL} from '../utils/config';
import {helpOriginTracker} from '../src/features/help/helpClientContext';
const id='8cb01504-f89b-4e55-ad30-f8f6eb686547',link=`leaderproduct://services/help?ticketId=50&htmlId=${id}`;
const artifact:HelpHtmlArtifact={version:1,id,title:'Пример',description:'Описание',full:{html:'<p>Подробности</p>',css:''}};
let view:TestRenderer.ReactTestRenderer;const close=jest.fn();
const tree=(userId=121)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:userId}} as any},React.createElement(HelpHtmlViewer,{artifact,onClose:close,link,expectedUserId:121}));

test('prepared HTML entity supplies a normalized selected-object hint and releases it on close',async()=>{
 const scope=`${API_BASE_URL}:121`;helpOriginTracker.observe('','home',undefined);helpOriginTracker.observe(scope,'services/help',undefined);
 const entityArtifact={...artifact,entity:{url:'leaderproduct://entity/v1/user/121'}};
 await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:121}} as any},React.createElement(HelpHtmlViewer,{artifact:entityArtifact,onClose:close,expectedUserId:121})));});
 expect(helpOriginTracker.read(scope)).toMatchObject({state:'current',target:{v:1,source:'app',kind:'user',id:'121'}});
 await act(async()=>view.unmount());
 expect(helpOriginTracker.read(scope)).toMatchObject({state:'previous',target:{id:'121'}});
});
test('an HTML artifact not prepared for this account does not supply an entity hint',async()=>{
 const scope=`${API_BASE_URL}:121`;helpOriginTracker.observe('','home',undefined);helpOriginTracker.observe(scope,'services/help',undefined);
 const incomplete={...artifact,full:undefined,entity:{url:'leaderproduct://entity/v1/user/121'}};
 await act(async()=>{view=TestRenderer.create(React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:121}} as any},React.createElement(HelpHtmlViewer,{artifact:incomplete,onClose:close,expectedUserId:121})));});
 expect(helpOriginTracker.read(scope)).not.toHaveProperty('target');
 await act(async()=>view.update(React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:122}} as any},React.createElement(HelpHtmlViewer,{artifact:{...artifact,entity:{url:'leaderproduct://entity/v1/user/121'}},onClose:close,expectedUserId:121}))));
 expect(helpOriginTracker.read(scope)).not.toHaveProperty('target');
});
const node=(id:string)=>view.root.findAll(item=>item.props.testID===id&&typeof item.props.onPress==='function')[0];
beforeEach(()=>{jest.clearAllMocks();mockReduced=true;mockHoldAnimation=false;mockTimings.length=0;});afterEach(async()=>{if(view)await act(async()=>view.unmount());});
test('transparent chat-sized header has centered title, back arrow and a permanent ellipsis',async()=>{
 await act(async()=>{view=TestRenderer.create(tree());});
 const header=view.root.findAll(item=>item.props.testID==='help-html-viewer-header')[0],style=StyleSheet.flatten(header.props.style);
 expect(style).toMatchObject({paddingTop:24});expect(style.backgroundColor).toBeUndefined();
 expect(style.position).toBe('absolute');
 expect(view.root.findByType(HelpViewerLayout).props.topInset).toBe(24);expect(view.root.findByType(Modal).props.hardwareAccelerated).toBe(true);
 expect(StyleSheet.flatten(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style)).toMatchObject({top:0,left:0});
 expect(StyleSheet.flatten(view.root.findByProps({testID:'help-search-surface'}).props.style)).toMatchObject({backgroundColor:'#EEF2F7',borderRadius:24});
 const shared=view.root.findByType(HelpHeaderFrame);expect(shared.props.contentSurface).toBeUndefined();expect(shared.props.reserveEyebrow).toBe(true);
 expect(StyleSheet.flatten(view.root.findByProps({testID:'help-header'}).props.style)).toMatchObject({paddingHorizontal:16,paddingTop:16,paddingBottom:16});
 expect(view.root.findByType(HelpMoreCloseButton).props.morphToClose).toBe(false);
 expect(view.root.findAll(item=>item.type==='HelpBlurSurface')[0].props.edge).toBe('bottom');
 expect(view.root.findAll(item=>item.type==='HtmlSurface')[0].props.topInset).toBe(104);
 const title=view.root.findAllByType(Text).find(item=>item.props.children==='Пример')!;expect(StyleSheet.flatten(title.props.style).textAlign).toBe('center');
 const back=view.root.findAll(item=>item.type==='HelpIcon')[0];expect(back.props.name).toBe('chevron-back');
 await act(async()=>node('help-html-menu-button').props.onPress());
 expect(node('help-html-download')).toBeDefined();expect(node('help-html-link')).toBeDefined();
 expect(view.root.findAll(item=>item.type==='Ionicons'&&item.props.name==='close')).toHaveLength(0);
 await act(async()=>view.root.findByType(Modal).props.onRequestClose());expect(node('help-html-menu-dismiss')).toBeUndefined();expect(close).not.toHaveBeenCalled();
 await act(async()=>back.props.onPress());expect(close).toHaveBeenCalledTimes(1);
});
test('menu actions use real helper contracts and copy feedback',async()=>{
 await act(async()=>{view=TestRenderer.create(tree());});
 await act(async()=>node('help-html-menu-button').props.onPress());await act(async()=>node('help-html-link').props.onPress());
 expect(copyHelpHtmlLink).toHaveBeenCalledWith(artifact,link,expect.objectContaining({expectedUserId:121,signal:expect.any(AbortSignal),isCurrent:expect.any(Function)}));
 expect(view.root.findAllByType(Text).some(item=>item.props.children==='Ссылка скопирована')).toBe(true);
 await act(async()=>node('help-html-menu-button').props.onPress());await act(async()=>node('help-html-download').props.onPress());
 expect(downloadHelpHtml).toHaveBeenCalledWith(artifact,'#18212D',expect.objectContaining({expectedUserId:121}));
});
test('pending export is cancelled by account change without late feedback',async()=>{
 let finish!:()=>void;jest.mocked(downloadHelpHtml).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{view=TestRenderer.create(tree());});await act(async()=>node('help-html-menu-button').props.onPress());await act(async()=>node('help-html-download').props.onPress());
 const options=jest.mocked(downloadHelpHtml).mock.calls[0][2];await act(async()=>view.update(tree(122)));expect(options.signal.aborted).toBe(true);
 await act(async()=>finish());expect(view.root.findAllByType(Text).some(item=>item.props.children==='HTML подготовлен для сохранения')).toBe(false);
 await act(async()=>node('help-html-menu-button').props.onPress());expect(node('help-html-download').props.disabled).toBe(true);
});

test('entity action uses the trusted host callback after closing and stale handlers cannot navigate another account',async()=>{
 const open=jest.fn(),entityArtifact={...artifact,entity:{url:'leaderproduct://entity/v1/user/121'}};
 const content=(userId=121)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:userId}} as any},React.createElement(HelpHtmlViewer,{artifact:entityArtifact,onClose:close,link,expectedUserId:121,onOpenEntity:open}));
 await act(async()=>{view=TestRenderer.create(content());});await act(async()=>node('help-html-menu-button').props.onPress());
 const press=node('help-html-entity').props.onPress;await act(async()=>view.update(content(122)));await act(async()=>press());
 expect(open).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 await act(async()=>view.update(content()));await act(async()=>node('help-html-menu-button').props.onPress());await act(async()=>node('help-html-entity').props.onPress());
 expect(close).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledTimes(1);expect(close.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
});

test('account change during the closing animation cancels the deferred entity action',async()=>{
 mockReduced=false;mockHoldAnimation=true;
 const open=jest.fn(),entityArtifact={...artifact,entity:{url:'leaderproduct://entity/v1/user/121'}};
 const content=(userId=121)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:userId}} as any},React.createElement(HelpHtmlViewer,{artifact:entityArtifact,onClose:close,expectedUserId:121,onOpenEntity:open}));
 try{
  await act(async()=>{view=TestRenderer.create(content());});await act(async()=>node('help-html-menu-button').props.onPress());await act(async()=>node('help-html-entity').props.onPress());expect(open).not.toHaveBeenCalled();
  await act(async()=>view.update(content(122)));await act(async()=>mockTimings.findLast(item=>item.done)!.done!(true));expect(open).not.toHaveBeenCalled();
 }finally{mockHoldAnimation=false;}
});

test('even a compact preview opens as a full-size panel from below without scaling',async()=>{
 const preview={...artifact,compact:{html:'<p>Кратко</p>',css:''}};
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlViewer,{artifact:preview,origin:{x:24,y:300,width:340,height:340},onClose:close}));});
 const surfaces=view.root.findAll(item=>item.type==='HtmlSurface');expect(surfaces).toHaveLength(1);expect(surfaces[0].props.compact).toBeUndefined();
 const style=()=>StyleSheet.flatten(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style);
 expect(style().transform).toHaveLength(1);expect(Object.keys(style().transform[0])).toEqual(['translateY']);
 expect(style().transform[0].translateY).toBeGreaterThan(0);
 await act(async()=>surfaces[0].props.onReady());expect(style().transform[0].translateY).toBe(0);
});
function pullGesture(){return view.root.findAll(item=>item.type==='GestureDetector'&&item.props.gesture.kind==='pan')[0].props.gesture;}
function touch(x:number,y:number,count=1){return {numberOfTouches:count,allTouches:[{absoluteX:x,absoluteY:y}]};}
const manager=()=>({fail:jest.fn(),activate:jest.fn()});
const panelOffset=()=>StyleSheet.flatten(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style).transform[0].translateY;
test('native WebView waits for top-edge pull arbitration and ordinary content scroll passes through',async()=>{
 await act(async()=>{view=TestRenderer.create(tree());});
 const surface=view.root.findAll(item=>item.type==='HtmlSurface')[0];await act(async()=>surface.props.onReady());
 const pull=pullGesture(),m=manager();
 expect(surface.props.nativeGesture.config.requireExternalGestureToFail).toBe(pull);
 expect(pull.config.manualActivation).toBe(true);
 expect(view.root.findByProps({testID:'help-html-viewer'}).props.onMoveShouldSetResponderCapture).toBeUndefined();
 surface.props.onScroll(200);pull.handlers.onTouchesDown(touch(20,500),m);expect(m.fail).toHaveBeenCalledTimes(1);
 surface.props.onScroll(.4);pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(20,480),m);
 expect(m.activate).not.toHaveBeenCalled();expect(m.fail).toHaveBeenCalledTimes(2);
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(60,520),m);
 expect(m.activate).not.toHaveBeenCalled();expect(m.fail).toHaveBeenCalledTimes(3);
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(20,520),m);expect(m.activate).toHaveBeenCalledTimes(1);
 await act(async()=>pull.handlers.onUpdate({translationY:35}));expect(panelOffset()).toBe(35);expect(close).not.toHaveBeenCalled();
 await act(async()=>pull.handlers.onEnd({velocityY:200},true));expect(close).not.toHaveBeenCalled();expect(panelOffset()).toBe(0);
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(20,520),m);
 await act(async()=>pull.handlers.onUpdate({translationY:140}));await act(async()=>pull.handlers.onEnd({velocityY:200},true));
 expect(close).toHaveBeenCalledTimes(1);
});
test('pull never steals pinch, horizontal motion, taps or gestures while a menu is open',async()=>{
 await act(async()=>{view=TestRenderer.create(tree());});
 const surface=view.root.findAll(item=>item.type==='HtmlSurface')[0];await act(async()=>surface.props.onReady());
 let pull=pullGesture();const m=manager();
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(20,520,2),m);expect(m.fail).toHaveBeenCalledTimes(1);expect(m.activate).not.toHaveBeenCalled();
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesUp({},m);expect(m.fail).toHaveBeenCalledTimes(2);
 await act(async()=>node('help-html-menu-button').props.onPress());pull=pullGesture();expect(pull.config.enabled).toBe(false);
 pull.handlers.onTouchesDown(touch(20,500),m);expect(m.fail).toHaveBeenCalledTimes(3);
 await act(async()=>view.root.findByType(Modal).props.onRequestClose());pull=pullGesture();expect(pull.config.enabled).toBe(true);
 expect(close).not.toHaveBeenCalled();
});
test('cancelled pulls return to rest and a tiny fast touch cannot dismiss the page',async()=>{
 await act(async()=>{view=TestRenderer.create(tree());});
 await act(async()=>view.root.findAll(item=>item.type==='HtmlSurface')[0].props.onReady());
 const pull=pullGesture(),m=manager();
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(20,520),m);
 await act(async()=>pull.handlers.onUpdate({translationY:50}));expect(panelOffset()).toBe(50);
 await act(async()=>pull.handlers.onFinalize({},false));expect(panelOffset()).toBe(0);expect(close).not.toHaveBeenCalled();
 pull.handlers.onTouchesDown(touch(20,500),m);pull.handlers.onTouchesMove(touch(20,520),m);
 await act(async()=>pull.handlers.onUpdate({translationY:12}));await act(async()=>pull.handlers.onEnd({velocityY:2000},true));
 expect(close).not.toHaveBeenCalled();expect(panelOffset()).toBe(0);
});

test('web HTML resizes inside a bounded shared panel and expands without replacing its page',async()=>{
 const originalOS=Platform.OS;
 Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
 const originalDimensions=Dimensions.get('window');
 Dimensions.set({window:{width:1440,height:900,scale:1,fontScale:1}});
 try{
  await act(async()=>{view=TestRenderer.create(tree());});
  const surface=()=>view.root.findAll(item=>item.type==='HtmlSurface')[0];
  const style=()=>StyleSheet.flatten(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style);
  const originalSurface=surface();
  expect(style()).toMatchObject({top:16,left:704,width:720,height:868,borderRadius:20});
  expect(surface().props.topInset).toBe(80);
  await act(async()=>surface().props.onReady());
  await act(async()=>node('help-html-expand').props.onPress());
  expect(style()).toMatchObject({top:0,left:0,width:1440,height:900,borderRadius:0});
  expect(node('help-html-expand').props.accessibilityLabel).toBe('Свернуть страницу в окно');
  expect(surface()).toBe(originalSurface);expect(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style[0].opacity).toBe(1);
  await act(async()=>Dimensions.set({window:{width:390,height:844,scale:1,fontScale:1}}));
  expect(style()).toMatchObject({top:0,left:0,width:390,height:844});
  expect(node('help-html-expand')).toBeUndefined();expect(surface()).toBe(originalSurface);expect(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style[0].opacity).toBe(1);
  await act(async()=>node('help-html-menu-button').props.onPress());
  await act(async()=>view.root.findByType(Modal).props.onRequestClose());
  expect(node('help-html-menu-dismiss')).toBeUndefined();expect(close).not.toHaveBeenCalled();
  await act(async()=>view.root.findByType(Modal).props.onRequestClose());expect(close).toHaveBeenCalledTimes(1);
 }finally{
  await act(async()=>view.unmount());Dimensions.set({window:originalDimensions});Object.defineProperty(Platform,'OS',{configurable:true,value:originalOS});
 }
});
