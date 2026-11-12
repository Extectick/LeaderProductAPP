import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet,Text,View} from 'react-native';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../context/AuthContext',()=>({AuthContext:require('react').createContext(null)}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../utils/config',()=>({API_BASE_URL:'https://example.test'}));
jest.mock('../src/features/help/helpHtmlEntity',()=>({...jest.requireActual('../src/features/help/helpHtmlEntity'),loadHelpHtmlEntityPreview:jest.fn()}));
jest.mock('../src/features/help/helpApi',()=>({loadHelpAttachmentText:jest.fn()}));
jest.mock('../src/features/help/components/HelpHtmlSurface',()=>({HelpHtmlSurface:'HtmlSurface'}));
jest.mock('../src/features/help/components/HelpHtmlViewer',()=>({HelpHtmlViewer:'HtmlViewer'}));
import {AuthContext} from '../context/AuthContext';
import {loadHelpAttachmentText,type HelpAttachment} from '../src/features/help/helpApi';
import {loadHelpHtmlEntityPreview} from '../src/features/help/helpHtmlEntity';
import {EntityCardContext} from '../src/features/entityCards/EntityCardContext';
import {HELP_HTML_MIME} from '../src/features/help/helpHtml';
import {HelpHtmlMessage} from '../src/features/help/components/HelpHtmlMessage';
import {HelpHtmlAttachments} from '../src/features/help/components/HelpHtmlContext';
import {HelpMarkdown} from '../src/features/help/components/HelpMarkdown';
import {createHelpHtmlCache,HelpHtmlCacheContext} from '../src/features/help/helpHtmlCache';
import {HelpMediaLoadingContext} from '../src/features/help/helpMediaLoading';
const id='8cb01504-f89b-4e55-ad30-f8f6eb686547',other='9423fa98-0671-4ec5-936e-c905502e4ba0';
const file:HelpAttachment={id:'attachment',kind:'FILE',name:`${id}.help-html.json`,mimeType:HELP_HTML_MIME,size:100,url:'/help/attachments/attachment'};
const compact={html:'<h2>Остатки</h2>',css:''};
const encode=(extra:Record<string,unknown>={})=>JSON.stringify({version:1,id,title:'Схема',description:'Описание',compact,...extra});
const resolve=async()=>({uri:'https://example.test/help/attachments/attachment'});
const auth=(id:number)=>({isAuthenticated:true,profile:{id}} as any);
let view:TestRenderer.ReactTestRenderer;
const tree=(userId=121,resolver=resolve,attachment=file)=>React.createElement(AuthContext.Provider,{value:auth(userId)},React.createElement(HelpHtmlMessage,{attachments:[attachment],resolve:resolver},React.createElement(React.Fragment,null,React.createElement(HelpMarkdown,{text:`[Схема](leaderproduct://help-html/${id}) [Чужая](leaderproduct://help-html/${other})`}),React.createElement(HelpHtmlAttachments))));
beforeEach(()=>{jest.useFakeTimers();jest.clearAllMocks();jest.mocked(loadHelpAttachmentText).mockReset();jest.mocked(loadHelpHtmlEntityPreview).mockReset();jest.spyOn(global,'requestAnimationFrame').mockImplementation(callback=>setTimeout(()=>callback(Date.now()),16) as unknown as number);jest.spyOn(global,'cancelAnimationFrame').mockImplementation(frame=>clearTimeout(frame));});
async function flushPreview(){await act(async()=>{await jest.advanceTimersByTimeAsync(40);});}
afterEach(async()=>{if(view)await act(async()=>view.unmount());jest.clearAllTimers();jest.restoreAllMocks();jest.useRealTimers();});
test('compact-only attachment is a borderless square and cannot expand',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode());
 await act(async()=>{view=TestRenderer.create(tree());});await flushPreview();
 const square=view.root.findAll(node=>node.props.testID===`help-html-compact-${id}`)[0];
 expect(StyleSheet.flatten(square.props.style)).toEqual({width:'100%',aspectRatio:1,overflow:'hidden'});
 expect(view.root.findAll(node=>typeof node.props.onPress==='function'&&node.props.testID===`help-html-expand-${id}`)).toHaveLength(0);
 expect(view.root.findAllByType(Text).filter(node=>node.props.accessibilityRole==='link')).toHaveLength(0);
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);
 expect(loadHelpAttachmentText).toHaveBeenCalledWith(file,121,expect.any(AbortSignal),192*1024);
});
test('full variant can open from matching Markdown link while invented link is inert',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:{html:'<h1>Подробнее</h1>',css:''}}));
 await act(async()=>{view=TestRenderer.create(tree());});await flushPreview();
 const links=view.root.findAllByType(Text).filter(node=>node.props.accessibilityRole==='link');expect(links).toHaveLength(1);
 await act(async()=>links[0].props.onPress());
 const viewer=view.root.findAll(node=>node.type==='HtmlViewer')[0];expect(viewer.props.artifact.id).toBe(id);expect(viewer.props.origin).toBeUndefined();
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);
 await act(async()=>viewer.props.onClose());expect(view.root.findAll(node=>node.type==='HtmlViewer')).toHaveLength(0);
});
test('expansion receives measured origin while full-only material has no square',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));
 await act(async()=>{view=TestRenderer.create(tree(),{createNodeMock:()=>({measureInWindow:(cb:Function)=>cb(24,300,340,340)})});});await flushPreview();
 const square=view.root.findAllByType(View).find(node=>node.props.testID===`help-html-compact-${id}`)!;
 square.instance.measureInWindow=(cb:Function)=>cb(24,300,340,340);
 const expand=view.root.findAll(node=>node.props.testID===`help-html-expand-${id}`&&typeof node.props.onPress==='function')[0];
 await act(async()=>expand.props.onPress());
 expect(view.root.findAll(node=>node.type==='HtmlViewer')[0].props.origin).toEqual({x:24,y:300,width:340,height:340});
 await act(async()=>view.unmount());
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({compact:null,full:compact}));
 await act(async()=>{view=TestRenderer.create(tree());});await flushPreview();
 expect(view.root.findAll(node=>node.props.testID===`help-html-compact-${id}`)).toHaveLength(0);
 expect(view.root.findAll(node=>node.props.testID===`help-html-open-${id}`&&typeof node.props.onPress==='function')).toHaveLength(1);
});
test('account switch aborts old load and never displays old descriptor or its error',async()=>{
 let finish!:(value:string)=>void;
 jest.mocked(loadHelpAttachmentText).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(encode({id:other}));
 await act(async()=>{view=TestRenderer.create(tree());});await flushPreview();
 const signal=jest.mocked(loadHelpAttachmentText).mock.calls[0][2];
 await act(async()=>view.update(tree(122)));expect(signal.aborted).toBe(true);
 await act(async()=>finish(encode({full:compact})));
 expect(view.root.findAll(node=>node.type==='HtmlSurface'||node.type==='HtmlViewer')).toHaveLength(0);
});
test('descriptor id mismatch fails closed and offers explicit retry',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({id:other}));
 await act(async()=>{view=TestRenderer.create(tree());});await flushPreview();
 expect(view.root.findAll(node=>node.type==='HtmlSurface'||node.type==='HtmlViewer')).toHaveLength(0);
 expect(view.root.findAll(node=>node.props.accessibilityLabel==='Повторить загрузку примера'&&typeof node.props.onPress==='function')).toHaveLength(1);
});
test('a bound route intent opens once and exports a link back to its exact message',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));const consumed=jest.fn();
 const content=()=>React.createElement(AuthContext.Provider,{value:auth(121)},React.createElement(HelpHtmlMessage,{ticketId:50,messageId:1075,requestedId:id,onRequestConsumed:consumed,attachments:[file],resolve,children:null}));
 await act(async()=>{view=TestRenderer.create(content());});
 const viewer=view.root.findAll(node=>node.type==='HtmlViewer')[0];expect(viewer.props.link).toBe(`leaderproduct://services/help?ticketId=50&messageId=1075&htmlId=${id}`);expect(viewer.props.expectedUserId).toBe(121);expect(consumed).toHaveBeenCalledTimes(1);
 await act(async()=>viewer.props.onClose());await act(async()=>view.update(content()));
 expect(view.root.findAll(node=>node.type==='HtmlViewer')).toHaveLength(0);expect(consumed).toHaveBeenCalledTimes(1);
});

test('card tap opens the same entity viewer through a native press target; HTML keeps touch-through rendering',async()=>{
 const target={v:1,source:'app',kind:'user',id:'121'} as const,entity={url:'leaderproduct://entity/v1/user/121'},openEntity=jest.fn();
 const imageDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({entity,full:compact}));jest.mocked(loadHelpHtmlEntityPreview).mockResolvedValue({target,title:'Сотрудник',imageDataUrl});
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardContext.Provider,{value:{isOpen:false,openEntity,openEntityLink:jest.fn(),close:jest.fn(),back:jest.fn()}},tree()));});await flushPreview();
 const surface=view.root.findAll(node=>node.type==='HtmlSurface')[0];expect(surface.props.compact).toBe(true);expect(surface.props.imageDataUrl).toBe(imageDataUrl);
 const tap=view.root.findAll(node=>node.props.testID===`help-html-entity-${id}`&&typeof node.props.onPress==='function')[0];
 expect(tap.props.onStartShouldSetResponderCapture).toBeUndefined();expect(tap.props.onMoveShouldSetResponderCapture).toBeUndefined();
 await act(async()=>tap.props.onPress());expect(openEntity).toHaveBeenCalledWith(target,'Схема');
 const square=view.root.findAllByType(View).find(node=>node.props.testID===`help-html-compact-${id}`)!;square.instance.measureInWindow=(cb:Function)=>cb(0,120,340,340);
 const expand=view.root.findAll(node=>node.props.testID===`help-html-expand-${id}`&&typeof node.props.onPress==='function')[0];await act(async()=>expand.props.onPress());
 const viewer=view.root.findAll(node=>node.type==='HtmlViewer')[0];expect(viewer.props.imageDataUrl).toBe(imageDataUrl);expect(viewer.props.onOpenEntity).toEqual(expect.any(Function));
});
test('late image preview is aborted on account switch and cannot reveal old card or image',async()=>{
 let finish!:(value:any)=>void;
 jest.mocked(loadHelpAttachmentText).mockResolvedValueOnce(encode({entity:{url:'leaderproduct://entity/v1/user/121'}})).mockResolvedValueOnce(encode({id:other}));
 jest.mocked(loadHelpHtmlEntityPreview).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{view=TestRenderer.create(tree());});await flushPreview();const signal=jest.mocked(loadHelpHtmlEntityPreview).mock.calls[0][2];
 await act(async()=>view.update(tree(122)));expect(signal.aborted).toBe(true);
 await act(async()=>finish({target:{v:1,source:'app',kind:'user',id:'121'},title:'Сотрудник',imageDataUrl:'old-private-image'}));
 expect(view.root.findAll(node=>node.type==='HtmlSurface'||node.type==='HtmlViewer')).toHaveLength(0);
});

const priorityTree=(priority:React.ContextType<typeof HelpMediaLoadingContext>,userId=121)=>React.createElement(HelpMediaLoadingContext.Provider,{value:priority},tree(userId));
test('legacy square reserves its final size before both cancellable loading frames',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode());
 await act(async()=>{view=TestRenderer.create(priorityTree('visible'));});
 const square=()=>view.root.findAll(node=>node.props.testID===`help-html-compact-${id}`)[0];
 expect(StyleSheet.flatten(square().props.style)).toEqual({width:'100%',aspectRatio:1,overflow:'hidden'});
 expect(loadHelpAttachmentText).not.toHaveBeenCalled();expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(0);
 await act(async()=>{await jest.advanceTimersByTimeAsync(16);});expect(loadHelpAttachmentText).not.toHaveBeenCalled();
 await act(async()=>{await jest.advanceTimersByTimeAsync(16);});expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(1);
 expect(StyleSheet.flatten(square().props.style)).toEqual({width:'100%',aspectRatio:1,overflow:'hidden'});
});
test.each(['near','deferred','retained'] as const)('%s rows neither auto-download nor mount a compact WebView',async priority=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));
 await act(async()=>{view=TestRenderer.create(priorityTree(priority));});await flushPreview();
 expect(loadHelpAttachmentText).not.toHaveBeenCalled();expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(0);
 expect(view.root.findAll(node=>node.props.testID===`help-html-compact-${id}`)).not.toHaveLength(0);
 await act(async()=>view.update(priorityTree('visible')));await flushPreview();
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(1);
 await act(async()=>view.update(priorityTree(priority)));await flushPreview();
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(priority==='near'?1:0);
});
test.each([48,132,1200,undefined,1,NaN,1201])('attachment height %s reserves the same viewport before download, after parse and after eviction',async height=>{
 let finish!:(value:string)=>void;
 jest.mocked(loadHelpAttachmentText).mockImplementation(()=>new Promise(done=>{finish=done;}));
 const attachment={...file,height},content=(priority:'visible'|'retained')=>React.createElement(HelpMediaLoadingContext.Provider,{value:priority},tree(121,resolve,attachment));
 const geometry=()=>StyleSheet.flatten(view.root.findAllByProps({testID:`help-html-compact-${id}`})[0].props.style);
 await act(async()=>{view=TestRenderer.create(content('visible'));});
 const initial=geometry();
 expect(initial).toEqual({width:'100%',...(height!==undefined&&Number.isFinite(height)&&height>=48&&height<=1200?{height}:{aspectRatio:1}),overflow:'hidden'});
 await flushPreview();expect(geometry()).toEqual(initial);
 // CSS is downloaded later and must not become a second layout owner.
 await act(async()=>finish(encode({compact:{html:'<section style="height:180px">Карточка</section>',css:''}})));
 expect(geometry()).toEqual(initial);
 await act(async()=>view.update(content('retained')));expect(geometry()).toEqual(initial);
 await act(async()=>view.update(content('visible')));await flushPreview();expect(geometry()).toEqual(initial);
});
test('full-only metadata reserves its link height before the descriptor arrives',async()=>{
 let finish!:(value:string)=>void;
 jest.mocked(loadHelpAttachmentText).mockImplementation(()=>new Promise(done=>{finish=done;}));
 await act(async()=>{view=TestRenderer.create(tree(121,resolve,{...file,height:48}));});
 expect(StyleSheet.flatten(view.root.findAllByProps({testID:`help-html-compact-${id}`})[0].props.style).height).toBe(48);
 await flushPreview();await act(async()=>finish(encode({compact:null,full:compact})));
 expect(StyleSheet.flatten(view.root.findAllByProps({testID:`help-html-open-${id}`})[0].props.style).height).toBe(48);
});
test('priority downgrade or unmount cancels scheduled preview work',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode());
 await act(async()=>{view=TestRenderer.create(priorityTree('visible'));});
 await act(async()=>{await jest.advanceTimersByTimeAsync(16);});
 await act(async()=>view.update(priorityTree('near')));await flushPreview();expect(loadHelpAttachmentText).not.toHaveBeenCalled();
 await act(async()=>view.update(priorityTree('visible')));
 await act(async()=>view.unmount());await flushPreview();expect(loadHelpAttachmentText).not.toHaveBeenCalled();
});
test('an explicit matching link loads and opens immediately even in a deferred row',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));
 await act(async()=>{view=TestRenderer.create(priorityTree('deferred'));});
 const links=view.root.findAllByType(Text).filter(node=>node.props.accessibilityRole==='link');expect(links).toHaveLength(1);
 await act(async()=>links[0].props.onPress());
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlViewer')).toHaveLength(1);expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(0);
});
test('a bound route intent bypasses preview scheduling in a retained row',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));const consumed=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpMediaLoadingContext.Provider,{value:'retained'},React.createElement(AuthContext.Provider,{value:auth(121)},React.createElement(HelpHtmlMessage,{ticketId:50,messageId:1075,requestedId:id,onRequestConsumed:consumed,attachments:[file],resolve,children:null}))));});
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlViewer')).toHaveLength(1);expect(consumed).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(0);
});


test.each([
 {compact:{html:'<section>Профиль</section>',css:'section{height:180px}'},height:180},
 {compact:{html:'<section class="card">Профиль</section>',css:'.card{height:220px}'},height:220},
 {compact:{html:'<section style="height:140px">Профиль</section>',css:''},height:140},
])('uses fixed compact height $height independently of width',async({compact,height})=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({compact}));
 await act(async()=>{view=TestRenderer.create(tree(121,resolve,{...file,height}));});
 expect(StyleSheet.flatten(view.root.findAllByProps({testID:`help-html-compact-${id}`})[0].props.style).height).toBe(height);
 await flushPreview();
 const preview=view.root.findAllByType(View).find(node=>node.props.testID===`help-html-compact-${id}`)!;
 expect(StyleSheet.flatten(preview.props.style)).toEqual({width:'100%',height,overflow:'hidden'});
 expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(1);
});


test('a loaded widget retains its native surface across visible/near boundary oscillation',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode());
 await act(async()=>{view=TestRenderer.create(priorityTree('visible'));});await flushPreview();
 const surface=view.root.findAll(node=>node.type==='HtmlSurface')[0];expect(surface).toBeDefined();
 for(const priority of ['near','visible','near','visible'] as const){
  await act(async()=>view.update(priorityTree(priority)));
  expect(view.root.findAll(node=>node.type==='HtmlSurface')[0]).toBe(surface);
  await flushPreview();
  expect(view.root.findAll(node=>node.type==='HtmlSurface')[0]).toBe(surface);
 }
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);
 await act(async()=>view.update(priorityTree('deferred')));
 expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(0);
});

test('validated full HTML joins the app viewer and releases its source lease on account change',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));const openHtml=jest.fn(()=>true),releaseHtml=jest.fn();
 const screen=(userId:number)=>React.createElement(EntityCardContext.Provider,{value:{status:'ready',isOpen:false,openEntity:()=>false,openEntityLink:()=>false,openHtml,releaseHtml,close:()=>{},back:()=>{}}},tree(userId));
 await act(async()=>{view=TestRenderer.create(screen(121));});await flushPreview();
 const link=view.root.findAllByType(Text).find(node=>node.props.accessibilityRole==='link')!;await act(async()=>link.props.onPress());
 expect(openHtml).toHaveBeenCalledTimes(1);const payload=openHtml.mock.calls[0][0] as any;
 expect(payload).toMatchObject({expectedUserId:121,artifact:{id},scopeId:expect.any(String)});expect(payload.isCurrent()).toBe(true);
 expect(view.root.findAll(node=>node.type==='HtmlViewer')).toHaveLength(0);
 await act(async()=>view.update(screen(122)));expect(payload.isCurrent()).toBe(false);expect(releaseHtml).toHaveBeenCalledWith(payload.scopeId);
});

test('a ready shared viewer rejection cannot fall back to a second modal',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));const openHtml=jest.fn(()=>false);
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardContext.Provider,{value:{status:'ready',isOpen:false,openEntity:()=>false,openEntityLink:()=>false,openHtml,close:()=>{},back:()=>{}}},tree()));});await flushPreview();
 const link=view.root.findAllByType(Text).find(node=>node.props.accessibilityRole==='link')!;await act(async()=>link.props.onPress());
 expect(openHtml).toHaveBeenCalledTimes(1);expect(view.root.findAll(node=>node.type==='HtmlViewer')).toHaveLength(0);
});

test('viewer context updates retain the source lease, while a changed attachment resolver releases it',async()=>{
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({full:compact}));const openHtml=jest.fn((_payload:unknown)=>true),releaseHtml=jest.fn();
 const screen=(isOpen:boolean,resolver=resolve)=>React.createElement(EntityCardContext.Provider,{value:{status:'ready',isOpen,openEntity:()=>false,openEntityLink:()=>false,openHtml,releaseHtml,close:()=>{},back:()=>{}}},tree(121,resolver));
 await act(async()=>{view=TestRenderer.create(screen(false));});await flushPreview();
 const link=view.root.findAllByType(Text).find(node=>node.props.accessibilityRole==='link')!;await act(async()=>link.props.onPress());
 const payload=openHtml.mock.calls[0][0] as any;
 await act(async()=>view.update(screen(true)));expect(releaseHtml).not.toHaveBeenCalled();expect(payload.isCurrent()).toBe(true);
 await act(async()=>view.update(screen(true,async()=>({uri:'https://example.test/help/attachments/rebound'}))));
 expect(payload.isCurrent()).toBe(false);expect(releaseHtml).toHaveBeenCalledWith(payload.scopeId);
});

test('one website link makes an inert compact HTML card a native link without a nested WebView gesture',async()=>{
 const openWeb=jest.fn(()=>true);
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({compact:{html:'<section><a href="https://tass.ru/">Новости</a></section>',css:''}}));
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardContext.Provider,{value:{isOpen:false,status:'ready',openEntity:()=>false,openEntityLink:()=>false,openWeb,close:()=>{},back:()=>{}}},tree()));});
 await flushPreview();
 const link=view.root.findAll(n=>n.props.testID===`help-html-website-${id}`&&typeof n.props.onPress==='function')[0];
 expect(link).toBeDefined();await act(async()=>link.props.onPress());expect(openWeb).toHaveBeenCalledWith('https://tass.ru/','Схема');
 expect(view.root.findAll(n=>n.type==='HtmlViewer')).toHaveLength(0);
});


test('attachment height stays fixed while the descriptor and optional entity photo load',async()=>{
 let finish!:(value:any)=>void;
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({compact:{html:'<section>Профиль</section>',css:'section{height:132px}'},entity:{url:'leaderproduct://entity/v1/user/121'}}));
 jest.mocked(loadHelpHtmlEntityPreview).mockImplementation(()=>new Promise(done=>{finish=done;}));
 await act(async()=>{view=TestRenderer.create(tree(121,resolve,{...file,height:132}));});await flushPreview();
 const frame=view.root.findAllByType(View).find(node=>node.props.testID===`help-html-compact-${id}`)!;
 expect(StyleSheet.flatten(frame.props.style)).toEqual({width:'100%',height:132,overflow:'hidden'});
 expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(1);
 await act(async()=>finish({target:{v:1,source:'app',kind:'user',id:'121'},title:'Профиль'}));
 expect(StyleSheet.flatten(frame.props.style).height).toBe(132);
});

test('a cached message remount has its exact height immediately and does not refetch or show a skeleton',async()=>{
 const cache=createHelpHtmlCache();
 const imageDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 jest.mocked(loadHelpAttachmentText).mockResolvedValue(encode({compact:{html:'<section>Профиль</section>',css:'section{height:132px}'},entity:{url:'leaderproduct://entity/v1/user/121'}}));
 jest.mocked(loadHelpHtmlEntityPreview).mockResolvedValue({target:{v:1,source:'app',kind:'user',id:'121'},title:'Профиль',imageDataUrl});
 const content=(userId=121)=>React.createElement(HelpMediaLoadingContext.Provider,{value:'near'},React.createElement(HelpHtmlCacheContext.Provider,{value:cache},tree(userId,resolve,{...file,height:132})));
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlCacheContext.Provider,{value:cache},tree(121,resolve,{...file,height:132})));});await flushPreview();
 await act(async()=>view.unmount());
 await act(async()=>{view=TestRenderer.create(content());});
 const frame=view.root.findAllByType(View).find(node=>node.props.testID===`help-html-compact-${id}`)!;
 expect(StyleSheet.flatten(frame.props.style)).toEqual({width:'100%',height:132,overflow:'hidden'});
 expect(view.root.findAll(node=>node.type==='HtmlSurface')[0].props).toMatchObject({skipLoadingPlaceholder:true,imageDataUrl});
 expect(view.root.findAll(node=>node.props.accessibilityRole==='progressbar')).toHaveLength(0);
 await flushPreview();expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);expect(loadHelpHtmlEntityPreview).toHaveBeenCalledTimes(1);
 // Same component, another account: no cached descriptor/photo can render.
 jest.mocked(loadHelpAttachmentText).mockImplementation(()=>new Promise(()=>{}));
 await act(async()=>view.update(content(122)));
 expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(0);
 await flushPreview();expect(loadHelpAttachmentText).toHaveBeenCalledTimes(1);
});

// A single assistant response may contain a bounded list of independent HTML
// artifacts. Their authenticated photos and press targets must remain paired;
// the former server limit of two descriptors must not reappear in presentation.
test('all twelve cards in a bounded response retain their own photo and entity action',async()=>{
 const cards=Array.from({length:12},(_,index)=>{
  const suffix=String(index+1).padStart(12,'0'),artifactId=`00000000-0000-4000-8000-${suffix}`,guid=`11111111-1111-4111-8111-${suffix}`;
  const target={v:1,source:'app',kind:'product',guid} as const;
  return {id:artifactId,target,url:`leaderproduct://entity/v1/product/${guid}`,imageDataUrl:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,index+1,2,3,4]).toString('base64'),file:{...file,id:`attachment-${index}`,name:`${artifactId}.help-html.json`,url:`/help/attachments/attachment-${index}`}};
 });
 jest.mocked(loadHelpAttachmentText).mockImplementation(async attachment=>{
  const card=cards.find(item=>item.file.id===attachment.id)!;
  return JSON.stringify({version:1,id:card.id,title:`Товар ${card.target.guid}`,description:'',entity:{url:card.url},compact:{html:'<section><img src="help-entity-image" alt="Товар"></section>',css:'section{height:120px}'}});
 });
 jest.mocked(loadHelpHtmlEntityPreview).mockImplementation(async url=>{
  const card=cards.find(item=>item.url===url)!;return {target:card.target,title:'Товар',imageDataUrl:card.imageDataUrl};
 });
 const openEntity=jest.fn(()=>true);
 await act(async()=>{view=TestRenderer.create(React.createElement(EntityCardContext.Provider,{value:{isOpen:false,status:'ready',openEntity,openEntityLink:()=>false,close:()=>{},back:()=>{}}},React.createElement(AuthContext.Provider,{value:auth(121)},React.createElement(HelpHtmlMessage,{attachments:cards.map(card=>card.file),resolve,children:React.createElement(HelpHtmlAttachments)}))));});
 await flushPreview();
 expect(loadHelpAttachmentText).toHaveBeenCalledTimes(cards.length);expect(loadHelpHtmlEntityPreview).toHaveBeenCalledTimes(cards.length);
 expect(view.root.findAll(node=>node.type==='HtmlSurface')).toHaveLength(cards.length);
 for(const card of cards){
  const frame=view.root.findAllByType(View).find(node=>node.props.testID===`help-html-compact-${card.id}`)!;
  expect(frame.findAll(node=>node.type==='HtmlSurface')[0].props.imageDataUrl).toBe(card.imageDataUrl);
  const tap=view.root.findAll(node=>node.props.testID===`help-html-entity-${card.id}`&&typeof node.props.onPress==='function')[0];
  await act(async()=>tap.props.onPress());expect(openEntity).toHaveBeenLastCalledWith(card.target,`Товар ${card.target.guid}`);
 }
});
