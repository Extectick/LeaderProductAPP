import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,Modal,PanResponder,StyleSheet,Text} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
let mockReduced=true;
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
beforeEach(()=>{jest.clearAllMocks();mockReduced=true;});afterEach(async()=>{if(view)await act(async()=>view.unmount());});
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
 mockReduced=false;let finished!:(result:{finished:boolean})=>void;
 const animation=jest.spyOn(Animated,'parallel').mockReturnValue({start:(callback:any)=>{finished=callback;},stop:()=>{},reset:()=>{}} as any);
 const open=jest.fn(),entityArtifact={...artifact,entity:{url:'leaderproduct://entity/v1/user/121'}};
 const content=(userId=121)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:userId}} as any},React.createElement(HelpHtmlViewer,{artifact:entityArtifact,onClose:close,expectedUserId:121,onOpenEntity:open}));
 try{
  await act(async()=>{view=TestRenderer.create(content());});await act(async()=>node('help-html-menu-button').props.onPress());await act(async()=>node('help-html-entity').props.onPress());expect(open).not.toHaveBeenCalled();
  await act(async()=>view.update(content(122)));await act(async()=>finished({finished:true}));expect(open).not.toHaveBeenCalled();
 }finally{animation.mockRestore();}
});

test('even a compact preview opens as a full-size panel from below without scaling',async()=>{
 const preview={...artifact,compact:{html:'<p>Кратко</p>',css:''}};
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlViewer,{artifact:preview,origin:{x:24,y:300,width:340,height:340},onClose:close}));});
 const surfaces=view.root.findAll(item=>item.type==='HtmlSurface');expect(surfaces).toHaveLength(1);expect(surfaces[0].props.compact).toBeUndefined();
 const style=()=>StyleSheet.flatten(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style);
 expect(style().transform).toHaveLength(1);expect(Object.keys(style().transform[0])).toEqual(['translateY']);
 expect(style().transform[0].translateY.__getValue()).toBeGreaterThan(0);
 await act(async()=>surfaces[0].props.onReady());expect(style().transform[0].translateY.__getValue()).toBe(0);
});
test('a downward body swipe closes only from the top and respects an open menu',async()=>{
 const responder=jest.spyOn(PanResponder,'create');
 try{
  await act(async()=>{view=TestRenderer.create(tree());});
  const surface=view.root.findAll(item=>item.type==='HtmlSurface')[0];await act(async()=>surface.props.onReady());
  const gesture=responder.mock.calls[0][0];
  const start=()=>gesture.onStartShouldSetPanResponderCapture?.({nativeEvent:{pageY:500}} as any,{} as any);
  const move=(dy:number,dx=0)=>gesture.onMoveShouldSetPanResponderCapture?.({} as any,{dy,dx} as any);
  surface.props.onScroll(200);start();expect(move(40)).toBe(false);
  surface.props.onScroll(.4);start();expect(move(-20)).toBe(false);expect(move(20,40)).toBe(false);expect(move(20)).toBe(true);
  await act(async()=>node('help-html-menu-button').props.onPress());start();expect(move(20)).toBe(false);
  await act(async()=>view.root.findByType(Modal).props.onRequestClose());start();expect(move(20)).toBe(true);
  await act(async()=>gesture.onPanResponderMove?.({} as any,{dy:35} as any));
  const offset=StyleSheet.flatten(view.root.findByProps({testID:'help-html-viewer-panel'}).props.style).transform[0].translateY.__getValue();expect(offset).toBe(35);expect(close).not.toHaveBeenCalled();
  await act(async()=>gesture.onPanResponderRelease?.({} as any,{dy:140,vy:.2} as any));expect(close).toHaveBeenCalledTimes(1);
 }finally{responder.mockRestore();}
});
