import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,Modal,StyleSheet,Text} from 'react-native';
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
let mockReduced=true;
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced,useHelpTheme:()=>({text:'#18212D',background:'#F7F9FC',panel:'#EEF2F7'})}));
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
const id='8cb01504-f89b-4e55-ad30-f8f6eb686547',link=`leaderproduct://services/help?ticketId=50&htmlId=${id}`;
const artifact:HelpHtmlArtifact={version:1,id,title:'Пример',description:'Описание',full:{html:'<p>Подробности</p>',css:''}};
let view:TestRenderer.ReactTestRenderer;const close=jest.fn();
const tree=(userId=121)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:userId}} as any},React.createElement(HelpHtmlViewer,{artifact,onClose:close,link,expectedUserId:121}));
const node=(id:string)=>view.root.findAll(item=>item.props.testID===id&&typeof item.props.onPress==='function')[0];
beforeEach(()=>{jest.clearAllMocks();mockReduced=true;});afterEach(async()=>{if(view)await act(async()=>view.unmount());});
test('transparent chat-sized header has centered title, back arrow and a permanent ellipsis',async()=>{
 await act(async()=>{view=TestRenderer.create(tree());});
 const header=view.root.findAll(item=>item.props.testID==='help-html-viewer-header')[0],style=StyleSheet.flatten(header.props.style);
 expect(style).toMatchObject({height:80,backgroundColor:'transparent'});
 expect(style.position).toBe('absolute');
 expect(view.root.findByType(HelpViewerLayout)).toBeDefined();
 const shared=view.root.findByType(HelpHeaderFrame);expect(shared.props.contentSurface).toBe('plain');expect(shared.props.reserveEyebrow).toBe(true);
 expect(StyleSheet.flatten(view.root.findByProps({testID:'help-header'}).props.style)).toMatchObject({paddingHorizontal:16,paddingTop:16,paddingBottom:16});
 expect(view.root.findByType(HelpMoreCloseButton).props.morphToClose).toBe(false);
 expect(view.root.findAll(item=>item.type==='HelpBlurSurface')[0].props.edge).toBe('bottom');
 expect(view.root.findAll(item=>item.type==='HtmlSurface')[0].props.topInset).toBe(80);
 const title=view.root.findAllByType(Text).find(item=>item.props.children==='Просмотр')!;expect(StyleSheet.flatten(title.props.style).textAlign).toBe('center');
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
