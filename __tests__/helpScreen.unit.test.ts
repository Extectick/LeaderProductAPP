import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { HelpDetail, HelpTicket } from '../src/features/help/helpApi';

const mockRouter = { replace: jest.fn() };
let mockFocused = true;
let mockNativeChatLayout = false;
let mockTimelineProps:any;
const mockPlayback:any={};
const mockUseAudioController=jest.fn((_options:any)=>mockPlayback);
const mockTimelineDateJump=jest.fn();
const mockAttachmentDrafts={load:jest.fn(),save:jest.fn(),clear:jest.fn(),hold:jest.fn()};
jest.mock('../src/features/help/helpAttachmentDrafts',()=>({loadHelpAttachmentDraft:(...args:any[])=>mockAttachmentDrafts.load(...args),saveHelpAttachmentDraft:(...args:any[])=>mockAttachmentDrafts.save(...args),clearHelpAttachmentDraft:(...args:any[])=>mockAttachmentDrafts.clear(...args),holdHelpAttachmentFiles:(...args:any[])=>mockAttachmentDrafts.hold(...args)}));
jest.mock('../src/features/help/components/HelpPhotoPortal',()=>({HelpPhotoPortalProvider:({children}:any)=>require('react').createElement('HelpPhotoPortalProvider',null,children)}));
jest.mock('../src/features/help/HelpAudioPlayback',()=>({
  useHelpAudioController:(options:any)=>mockUseAudioController(options),
  HelpAudioPlaybackProvider:({value,children}:any)=>require('react').createElement('HelpAudioPlaybackProvider',{value},children),
  useHelpAudioPlayback:()=>mockPlayback,
}));
jest.mock('../src/features/help/components/HelpNativeChatLayout', () => ({
  get hasNativeChatLayout() { return mockNativeChatLayout; }, HelpNativeChatLayout:'HelpNativeChatLayout',
}));
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({theme:'light'}) }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused, useFocusEffect: (effect:any) => {
  require('react').useEffect(()=>mockFocused ? effect() : undefined,[effect,mockFocused]);
} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('../src/features/help/helpDiagnostics', () => ({helpDevActions:()=>()=>{},helpDevRef:jest.fn(),helpDevState:jest.fn(),helpDevEvent:jest.fn()}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/features/help/components/HelpMedia', () => ({ HelpGallery: 'HelpGallery', downloadHelpAttachment: jest.fn() }));
jest.mock('../src/features/help/components/HelpComposer', () => ({ HelpComposer: 'HelpComposer' }));
jest.mock('../src/features/help/components/HelpMessageBubble', () => ({ HelpMessageBubble: 'HelpMessageBubble' }));
jest.mock('../src/features/help/components/HelpAssistantMessage', () => ({HelpAssistantMessage:'HelpAssistantMessage',HelpAssistantPreviewMenu:'HelpAssistantPreviewMenu'}));
jest.mock('../src/features/help/components/HelpTimeline',()=>{
  const React=require('react'),{ScrollView}=require('react-native');
  return {HelpTimeline:React.forwardRef((props:any,ref:any)=>{
    mockTimelineProps=props;
    React.useImperativeHandle(ref,()=>({save:jest.fn(),prepareJump:jest.fn(),cancelJump:jest.fn(),jumpToDate:mockTimelineDateJump,scrollTo:jest.fn(),scrollToEnd:jest.fn()}));
    return React.createElement(ScrollView,{testID:'help-chat-scroll',nativeID:props.nativeID,onLayout:()=>{},onScrollBeginDrag:()=>{},contentContainerStyle:{paddingBottom:mockNativeChatLayout?0:props.dockHeight+12}},props.header,props.messages.map((message:any)=>React.createElement(React.Fragment,{key:message.id},props.renderMessage(message))),props.footer);
  })};
});

jest.mock('../src/features/help/components/HelpPrimitives', () => {
  const React = require('react'); const { Pressable, View, Text } = require('react-native');
  return {
    HelpIcon: ({label,onPress,disabled}:any) => React.createElement(Pressable,{accessibilityLabel:label,onPress,disabled}),
    HelpPrimaryButton: ({text,onPress,disabled}:any) => React.createElement(Pressable,{accessibilityLabel:text,onPress,disabled}),
    HelpDock: ({children}:any) => React.createElement(View,null,children),
    HelpBlurSurface: 'HelpBlurSurface',
    HelpAvatar: () => React.createElement(View),
    HelpTyping: ({text}:any) => React.createElement(Text,null,text),
    HelpNotice: ({text}:any) => React.createElement(Text,null,text),
    HelpSheet: ({title,children}:any) => React.createElement(View,{accessibilityLabel:title},children),
  };
});
const mockService: any = {};
jest.mock('../src/features/help/useHelpService', () => ({ useHelpService: () => mockService }));
import HelpScreen from '../src/features/help/HelpScreen';
import {HelpChatPlayback} from '../src/features/help/components/HelpPlaybackScope';
import {HelpChatEntry} from '../src/features/help/components/HelpChatEntry';

const ticket: HelpTicket = { id: 7, number: 1007, title: 'Принтер', status: 'OPEN', ownerId: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), closedAt: null, sourceTicketId: null, sourceTicket: null, itRequested: false, members: [], unreadCount: 0, lastMessage: null, canReopen: false, aiEnabled: false };
const detail: HelpDetail = { ticket, messages: [] };
describe('Help screen integration with service boundary', () => {
  let screen: TestRenderer.ReactTestRenderer;
  beforeEach(() => {
    mockFocused = true;
    mockAttachmentDrafts.load.mockReset().mockResolvedValue([]);mockAttachmentDrafts.save.mockReset().mockImplementation(async(_user:any,_key:any,files:any)=>files);mockAttachmentDrafts.clear.mockReset().mockResolvedValue(undefined);mockAttachmentDrafts.hold.mockReset().mockImplementation(()=>jest.fn());
    mockNativeChatLayout = false;
    mockTimelineProps=undefined;mockUseAudioController.mockClear();mockTimelineDateJump.mockClear();
    Object.assign(mockPlayback,{current:null,positionSeconds:0,durationSeconds:0,progress:0,playing:false,loading:false,ready:false,error:null,speed:1,toggle:jest.fn().mockResolvedValue(undefined),setSpeed:jest.fn(),stop:jest.fn(),seek:jest.fn().mockResolvedValue(undefined),play:jest.fn().mockResolvedValue(undefined)});
    Object.assign(mockService,{tickets:[],selectedTicket:null,messages:[],loading:false,busy:false,error:null,online:true,connected:true,canManage:false,userId:5,typingByTicket:{},hasMore:false,
      loadTickets:jest.fn().mockResolvedValue(undefined),clearSelection:jest.fn(()=>{mockService.selectedTicket=null;}),openTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),getDraft:jest.fn().mockResolvedValue(''),setDraft:jest.fn().mockResolvedValue(undefined),emitTyping:jest.fn(),createTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),sendMessage:jest.fn().mockResolvedValue(detail),uploadAttachments:jest.fn(),closeTicket:jest.fn().mockResolvedValue(detail),reopenTicket:jest.fn(),editMessage:jest.fn(),toggleReaction:jest.fn(),mediaSource:jest.fn(),loadOlder:jest.fn(),loadNewer:jest.fn(),jumpToLatest:jest.fn().mockResolvedValue(undefined),jumpToMessage:jest.fn().mockResolvedValue(undefined),saveViewport:jest.fn(),markVisibleRead:jest.fn(),searchMessages:jest.fn().mockResolvedValue({messages:[],total:0,nextCursor:null}),retryPending:jest.fn(),markAllRead:jest.fn(),requestIt:jest.fn(),claimTicket:jest.fn()});
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpScreen));});}
  function button(label:string){return screen.root.findAll(node=>node.props.accessibilityLabel===label && typeof node.props.onPress==='function')[0];}
  function composer(){return screen.root.findByType('HelpComposer' as any);}
  test('opening another chat does not carry a reply focus request into its composer',async()=>{
    mockService.tickets=[ticket];mockService.messages=[{id:81,ticketId:7,sequence:1,authorId:9,authorRole:'IT',text:'Ответ',kind:'TEXT',attachments:[],reactions:[],createdAt:new Date().toISOString()}];
    await render();await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(composer().props.focusKey).toBe(0);
    await act(async()=>screen.root.findByType('HelpMessageBubble' as any).props.onReply());
    expect(composer().props.focusKey).toBeGreaterThan(0);
    await act(async()=>button('Назад').props.onPress());
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(composer().props.focusKey).toBe(0);expect(composer().props.quote).toBeUndefined();
  });
  test('initial content growth motion stays disabled until entry completion',async()=>{
    mockNativeChatLayout=true;mockService.tickets=[ticket];await render();
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(screen.root.findByType('HelpNativeChatLayout' as any).props.animateTail).toBe(false);
    await act(async()=>screen.root.findByType(HelpChatEntry).props.onEntered());
    expect(screen.root.findByType('HelpNativeChatLayout' as any).props.animateTail).toBe(true);
  });
  async function archiveAction(label:string){await act(async()=>button('Меню поддержки').props.onPress());await act(async()=>button(label).props.onPress());}
  test('native chat owns the bottom inset instead of waiting for a JS dock measurement',async()=>{
    mockNativeChatLayout=true;
    await render();
    expect(screen.root.findAllByType('HelpNativeChatLayout' as any)).toHaveLength(0);
    await act(async()=>button('Новое обращение').props.onPress());
    const native=screen.root.findByType('HelpNativeChatLayout' as any);
    const chat=screen.root.findAllByType(ScrollView).find(node=>node.props.testID==='help-chat-scroll')!;
    expect(chat.props.contentContainerStyle.paddingBottom).toBe(0);
    expect(chat.props.nativeID).toBe(native.props.scrollId);
    expect(screen.root.findAll(node=>node.props.nativeID===native.props.dockId).length).toBeGreaterThan(0);
  });
  test('support header contains search and archive without the duplicated list heading',async()=>{
    await render();
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-header'}).props.style)).toMatchObject({paddingHorizontal:16});
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-header'}).props.style).backgroundColor).toBeUndefined();
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Поддержка')).toBe(true);
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Мои обращения')).toBe(false);
    expect(button('Прочитать все сообщения')).toBeUndefined();
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Архив')).toBe(false);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-search-surface'}).props.style)).toMatchObject({height:48,borderTopLeftRadius:0,borderBottomLeftRadius:0,borderTopRightRadius:24,borderBottomRightRadius:24,backgroundColor:'#EEF2F7'});
  });
  test('IT scope selection lives only inside the contextual menu',async()=>{
    mockService.canManage=true;
    await render();
    expect(screen.root.findAllByType(Text).some(node=>['Мои обращения','Очередь IT'].includes(node.props.children))).toBe(false);
    await act(async()=>button('Меню поддержки').props.onPress());
    await act(async()=>button('Показать очередь IT').props.onPress());
    expect(mockService.loadTickets).toHaveBeenLastCalledWith('OPEN','queue',false,'');
    await act(async()=>button('Меню поддержки').props.onPress());
    await act(async()=>button('Показать мои обращения').props.onPress());
    expect(mockService.loadTickets).toHaveBeenLastCalledWith('OPEN','mine',false,'');
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-list-header-overlay'}).props.style)).toMatchObject({position:'absolute',top:0});
    expect(screen.root.findByProps({testID:'help-ticket-list'}).props.contentContainerStyle.paddingTop).toBe(100);
  });
  test('header search stays connected when archive toggles and can be cleared',async()=>{
    await render();
    const search=()=>screen.root.findByType(TextInput);
    await act(async()=>search().props.onChangeText('принтер'));
    await archiveAction('Показать архив обращений');
    expect(mockService.loadTickets).toHaveBeenLastCalledWith('CLOSED','mine',false,'принтер');
    expect(button('Меню поддержки').props.accessibilityState.expanded).toBe(false);
    expect(search().props.value).toBe('принтер');
    await act(async()=>button('Очистить поиск').props.onPress());
    expect(search().props.value).toBe('');
    await archiveAction('Показать открытые обращения');
    expect(mockService.loadTickets).toHaveBeenLastCalledWith('OPEN','mine',false,'');
  });
  test('support menu opens without changing the list and dismisses outside or with Android Back',async()=>{
    await render();
    mockService.loadTickets.mockClear();
    await act(async()=>button('Меню поддержки').props.onPress());
    expect(button('Показать архив обращений')).toBeTruthy();
    expect(button('Прочитать все сообщения')).toBeUndefined();
    expect(mockService.loadTickets).not.toHaveBeenCalled();
    await act(async()=>button('Закрыть меню поддержки').props.onPress());
    expect(button('Показать архив обращений')).toBeUndefined();
    await act(async()=>button('Меню поддержки').props.onPress());
    await act(async()=>screen.root.findByType(Modal).props.onRequestClose());
    expect(button('Меню поддержки').props.accessibilityState.expanded).toBe(false);
    expect(mockService.markAllRead).not.toHaveBeenCalled();
  });
  test('closed list row uses compact gray styling, lock and account-scoped draft preview',async()=>{
    mockService.tickets=[{...ticket,status:'CLOSED'}];
    mockService.getDraft.mockResolvedValue('Дополнительная информация');
    await render();await archiveAction('Показать архив обращений');
    const row=screen.root.findByProps({testID:'help-ticket-row-7'});
    expect(StyleSheet.flatten(typeof row.props.style==='function' ? row.props.style({pressed:false}) : row.props.style)).toMatchObject({minHeight:76,paddingHorizontal:16,paddingVertical:12,backgroundColor:'#F0F1F3'});
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Черновик: ')).toBe(true);
    expect(screen.root.findByProps({name:'lock-closed-outline'}).props.size).toBe(15);
    expect(mockService.getDraft).toHaveBeenCalledWith('ticket:7');
  });
  test.each(['android','ios'] as const)('keyboard resize has a single owner on %s',async platform=>{
    const original=Platform.OS;
    try {
      Object.defineProperty(Platform,'OS',{configurable:true,value:platform});
      await render();
      expect(screen.root.findByType(KeyboardAvoidingView).props.behavior).toBe(platform==='android'?undefined:'padding');
      await act(async()=>button('Новое обращение').props.onPress());
      const chat=screen.root.findAll(n=>n.props.testID==='help-chat-scroll')[0];
      expect(typeof chat.props.onLayout).toBe('function');
      expect(typeof chat.props.onScrollBeginDrag).toBe('function');
    } finally {Object.defineProperty(Platform,'OS',{configurable:true,value:original});}
  });
  test('opening and cancelling empty draft never creates a ticket or consumes number',async()=>{
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    expect(composer().props.value).toBe(''); expect(mockService.createTicket).not.toHaveBeenCalled();
    await act(async()=>button('Назад').props.onPress());
    expect(mockService.createTicket).not.toHaveBeenCalled(); expect(button('Новое обращение')).toBeTruthy();
  });
  test('first send creates once and clears draft only after success',async()=>{
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Не печатает принтер'));
    await act(async()=>composer().props.onSend());
    expect(mockService.createTicket).toHaveBeenCalledTimes(1);
    expect(mockService.createTicket).toHaveBeenCalledWith({text:'Не печатает принтер',attachmentIds:[],sourceTicketId:undefined});
    expect(composer().props.value).toBe('');
  });
  test('network failure preserves draft instead of pretending sent',async()=>{
    mockService.createTicket.mockRejectedValueOnce(new Error('Сеть недоступна'));
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Не терять этот вопрос'));
    await act(async()=>composer().props.onSend());
    expect(composer().props.value).toBe('Не терять этот вопрос');
    expect(mockService.setDraft).not.toHaveBeenCalledWith('new:plain','');
  });
  test('late draft read cannot replace text already entered',async()=>{
    let resolveDraft!:(value:string)=>void;
    mockService.getDraft.mockImplementation(()=>new Promise<string>(resolve=>{resolveDraft=resolve;}));
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Новый текст'));
    await act(async()=>resolveDraft('Старый текст'));
    expect(composer().props.value).toBe('Новый текст');
  });
  test('account switch clears active text, attachments and overlays',async()=>{
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>{composer().props.onChange('Личные данные');composer().props.onFiles([{uri:'file://private',name:'private.txt'}]);});
    mockService.userId=9;
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findAllByType('HelpComposer' as any)).toHaveLength(0);
    await act(async()=>button('Новое обращение').props.onPress());
    expect(composer().props.value).toBe(''); expect(composer().props.files).toEqual([]);
  });
  test('late first-send response does not navigate over or clear a newer draft',async()=>{
    let resolveSend!:(value:HelpDetail)=>void;
    mockService.createTicket.mockImplementation(()=>new Promise<HelpDetail>(resolve=>{resolveSend=resolve;}));
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Первый вопрос'));
    let pending!:Promise<void>; await act(async()=>{pending=composer().props.onSend();});
    await act(async()=>button('Назад').props.onPress());
    await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Новый черновик'));
    await act(async()=>{resolveSend(detail);await pending;});
    expect(composer().props.value).toBe('Новый черновик');
    expect(mockService.createTicket).toHaveBeenCalledTimes(1);
    expect(mockService.setDraft).not.toHaveBeenCalledWith('new:plain','');
  });
  test('attachment draft survives list navigation within account session',async()=>{
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    const file={uri:'file://proof.png',name:'proof.png',mimeType:'image/png'};
    await act(async()=>composer().props.onFiles([file]));
    await act(async()=>button('Назад').props.onPress());
    await act(async()=>button('Новое обращение').props.onPress());
    expect(composer().props.files).toEqual([file]);
  });
  test('native attachment manifest restores files after a fresh screen mount',async()=>{
    const photo={uri:'file://documents/help-drafts/photo-restored.jpg',name:'Фото.jpg',mimeType:'image/jpeg'};
    mockAttachmentDrafts.load.mockResolvedValue([photo]);
    await render();await act(async()=>button('Новое обращение').props.onPress());
    expect(mockAttachmentDrafts.load).toHaveBeenCalledWith(5,'new:plain');expect(composer().props.files).toEqual([photo]);
    expect(screen.root.findByType('HelpPhotoPortalProvider' as any)).toBeDefined();
  });
  test('explicit photo send uses the supplied ordered snapshot before React commits onFiles',async()=>{
    const photos=[{uri:'file://first.jpg',name:'first.jpg'},{uri:'file://second.jpg',name:'second.jpg'}];
    mockService.uploadAttachments.mockImplementation(async([file]:any[])=>[{id:file.name}]);
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Подпись'));let result:any;
    const send=composer().props.onSend;
    await act(async()=>{composer().props.onFiles([{uri:'file://stale.jpg',name:'stale.jpg'}]);result=await send(undefined,photos);});
    expect(result).toBe(true);expect(mockService.uploadAttachments.mock.calls.map(([files]:any[])=>files[0].name)).toEqual(['first.jpg','second.jpg']);
    expect(mockService.createTicket).toHaveBeenCalledWith({text:'Подпись',attachmentIds:['first.jpg','second.jpg'],sourceTicketId:undefined});
    expect(mockAttachmentDrafts.clear).toHaveBeenCalledWith(5,'new:plain');expect(composer().props.files).toEqual([]);
  });
  test('failed explicit photo upload returns false and persists the selected array without sending a partial message',async()=>{
    const photos=[{uri:'file://a.jpg',name:'a.jpg'},{uri:'file://b.jpg',name:'b.jpg'}];
    mockService.uploadAttachments.mockResolvedValueOnce([{id:'a'}]).mockRejectedValueOnce(new Error('Сеть'));
    await render();await act(async()=>button('Новое обращение').props.onPress());let result:any;
    await act(async()=>{result=await composer().props.onSend(undefined,photos);});
    expect(result).toBe(false);expect(mockService.createTicket).not.toHaveBeenCalled();expect(composer().props.files).toEqual(photos);
    expect(mockAttachmentDrafts.save).toHaveBeenCalledWith(5,'new:plain',photos);expect(mockAttachmentDrafts.clear).not.toHaveBeenCalled();
    mockService.uploadAttachments.mockResolvedValue([{id:'b'}]);
    await act(async()=>{result=await composer().props.onSend();});
    expect(result).toBe(true);expect(mockService.uploadAttachments).toHaveBeenCalledTimes(3);
  });
  test('success cannot erase a newer same-chat caption or photo draft',async()=>{
    await openWithMessage();let finish!:(value:HelpDetail)=>void;
    mockService.sendMessage.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    mockService.uploadAttachments.mockResolvedValue([{id:'uploaded-photo'}]);
    const first=[{uri:'file://a.jpg',name:'a.jpg'}],newer=[{uri:'file://b.jpg',name:'b.jpg'}];
    await act(async()=>composer().props.onChange('Первая подпись'));let pending!:Promise<boolean>;
    await act(async()=>{pending=composer().props.onSend(undefined,first);});
    await act(async()=>{composer().props.onChange('Новый текст');composer().props.onFiles(newer);});
    mockAttachmentDrafts.clear.mockClear();mockService.setDraft.mockClear();
    await act(async()=>{finish(detail);expect(await pending).toBe(true);});
    expect(composer().props.value).toBe('Новый текст');expect(composer().props.files).toEqual(newer);
    expect(mockAttachmentDrafts.clear).not.toHaveBeenCalled();expect(mockService.setDraft).not.toHaveBeenCalledWith('ticket:7','');
  });
  test('account switch during local persistence cancels upload and cannot restore files into the next account',async()=>{
    let finish!:(files:any[])=>void;mockAttachmentDrafts.save.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    await render();await act(async()=>button('Новое обращение').props.onPress());let pending!:Promise<boolean>;
    const photos=[{uri:'file://private.jpg',name:'private.jpg'}];
    await act(async()=>{pending=composer().props.onSend(undefined,photos);});
    mockService.userId=9;await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>{finish(photos);expect(await pending).toBe(false);});
    expect(mockService.uploadAttachments).not.toHaveBeenCalled();expect(mockService.createTicket).not.toHaveBeenCalled();
    await act(async()=>button('Новое обращение').props.onPress());expect(composer().props.files).toEqual([]);
  });
  test('late attachment restoration cannot overwrite newly selected files',async()=>{
    let finish!:(files:any[])=>void;mockAttachmentDrafts.load.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    await render();await act(async()=>button('Новое обращение').props.onPress());
    const newer=[{uri:'file://new.jpg',name:'new.jpg'}];await act(async()=>composer().props.onFiles(newer));
    await act(async()=>finish([{uri:'file://old.jpg',name:'old.jpg'}]));expect(composer().props.files).toEqual(newer);
  });
  test('a stale photo-send callback cannot attach or send into a different account',async()=>{
    await render();await act(async()=>button('Новое обращение').props.onPress());const oldSend=composer().props.onSend;
    mockService.userId=9;await act(async()=>screen.update(React.createElement(HelpScreen)));await act(async()=>button('Новое обращение').props.onPress());
    mockAttachmentDrafts.save.mockClear();
    await act(async()=>expect(await oldSend(undefined,[{uri:'file://private.jpg',name:'private.jpg'}])).toBe(false));
    expect(mockAttachmentDrafts.save).not.toHaveBeenCalled();expect(mockService.uploadAttachments).not.toHaveBeenCalled();expect(composer().props.files).toEqual([]);
  });
  test('Back during successful draft cleanup cannot resurrect sent text or photos',async()=>{
    await openWithMessage();let finish!:()=>void;
    mockAttachmentDrafts.clear.mockReturnValue(new Promise<void>(resolve=>{finish=resolve;}));
    mockService.uploadAttachments.mockResolvedValue([{id:'photo-uploaded'}]);
    await act(async()=>composer().props.onChange('Уже отправлено'));let pending!:Promise<boolean>;
    await act(async()=>{pending=composer().props.onSend(undefined,[{uri:'file://sent.jpg',name:'sent.jpg'}]);});
    expect(mockService.sendMessage).toHaveBeenCalled();mockService.setDraft.mockClear();mockAttachmentDrafts.save.mockClear();
    await act(async()=>button('Назад').props.onPress());
    expect(mockService.setDraft).toHaveBeenCalledWith('ticket:7','');expect(mockService.setDraft).not.toHaveBeenCalledWith('ticket:7','Уже отправлено');
    expect(mockAttachmentDrafts.save).not.toHaveBeenCalled();
    await act(async()=>{finish();expect(await pending).toBe(true);});
  });
  test('hardware Back listener detaches while another route covers Help and restores on focus',async()=>{
    const remove=jest.fn(); const add=jest.spyOn(BackHandler,'addEventListener').mockReturnValue({remove});
    await render(); expect(add).toHaveBeenCalledTimes(1);
    mockFocused=false; await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(remove).toHaveBeenCalledTimes(1);
    mockFocused=true; await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(add).toHaveBeenCalledTimes(2);
  });
  async function openWithMessage() {
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Первый вопрос'));
    await act(async()=>composer().props.onSend());
    mockService.messages=[{id:31,ticketId:7,sequence:1,authorId:5,authorRole:'USER',author:{id:5,name:'Я'},kind:'TEXT',text:'Исходное сообщение',createdAt:new Date().toISOString(),attachments:[],reactions:[]}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
  }
  function bubble(){return screen.root.findByType('HelpMessageBubble' as any);}
  test('playback scope follows the current account and ticket, including a return to the list',async()=>{
    await openWithMessage();
    expect(mockUseAudioController).toHaveBeenLastCalledWith(expect.objectContaining({userId:5,ticketId:7,onError:expect.any(Function)}));
    expect(screen.root.findByType('HelpAudioPlaybackProvider' as any).props.value).toBe(mockPlayback);
    await act(async()=>button('Назад').props.onPress());
    expect(mockUseAudioController).toHaveBeenLastCalledWith(expect.objectContaining({userId:5,ticketId:null}));
    mockService.userId=9;await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(mockUseAudioController).toHaveBeenLastCalledWith(expect.objectContaining({userId:9,ticketId:null}));
  });
  test('active voice strip is in the chat header and its title uses bounded message navigation',async()=>{
    await openWithMessage();
    expect(screen.root.findAllByProps({testID:'help-voice-playback-bar'})).toHaveLength(0);
    mockPlayback.current={messageId:999,author:'Анна',ticketId:7,createdAt:new Date().toISOString(),attachment:{id:'voice',name:'voice.m4a',kind:'AUDIO'}};
    mockPlayback.positionSeconds=12;mockPlayback.durationSeconds=60;mockPlayback.ready=true;
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findByProps({testID:'help-chat-header-overlay'}).findAllByProps({testID:'help-voice-playback-bar'}).length).toBeGreaterThan(0);
    const wrapper=screen.root.findByType(HelpChatPlayback).children[0] as TestRenderer.ReactTestInstance;
    const wrapperInset=StyleSheet.flatten(wrapper.props.style).paddingHorizontal??0;
    const barInset=StyleSheet.flatten(screen.root.findByProps({testID:'help-voice-playback-bar'}).props.style).marginHorizontal??0;
    expect(wrapperInset+barInset).toBe(16);
    await act(async()=>button('К голосовому сообщению Анна').props.onPress());
    expect(mockService.jumpToMessage).toHaveBeenCalledWith(999);expect(mockService.loadOlder).not.toHaveBeenCalled();
    await act(async()=>button('Продолжить голосовое сообщение').props.onPress());expect(mockPlayback.toggle).toHaveBeenCalledTimes(1);
    await act(async()=>button('Закрыть воспроизведение').props.onPress());expect(mockPlayback.stop).toHaveBeenCalledTimes(1);
  });
  test('measured playback header growth updates timeline occlusion and recording area together',async()=>{
    await openWithMessage();
    await act(async()=>screen.root.findByProps({testID:'help-chat-viewport'}).props.onLayout({nativeEvent:{layout:{height:600}}}));
    const initialArea=composer().props.recordingAreaHeight;
    const initialHeight=mockTimelineProps.headerHeight;
    mockPlayback.current={messageId:31,author:'Я',ticketId:7,createdAt:new Date().toISOString(),attachment:{id:'voice',name:'voice.m4a',kind:'AUDIO'}};
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>screen.root.findByProps({testID:'help-chat-header-overlay'}).props.onLayout({nativeEvent:{layout:{height:initialHeight+44}}}));
    expect(mockTimelineProps.headerHeight).toBe(initialHeight+44);
    expect(composer().props.recordingAreaHeight).toBe(initialArea-44);
  });
  test('date chip sits outside the blur target, stays4px below the header surface and follows voice height',async()=>{
    await openWithMessage();const date='2026-10-27T12:00:00Z';
    expect(mockTimelineProps.hideStickyDate).toBe(true);
    await act(async()=>mockTimelineProps.onStickyDateChange(date));
    const overlay=()=>screen.root.findByProps({testID:'help-sticky-date-overlay'});
    const initialTop=StyleSheet.flatten(overlay().props.style).top;
    expect(initialTop).toBe(88);expect(initialTop-(100-16)).toBe(4);
    let ancestor=overlay().parent;while(ancestor){expect(ancestor.type).not.toBe('BlurTargetView');ancestor=ancestor.parent;}
    const chip=overlay().findAllByProps({testID:'help-date-jump'}).find(node=>node.props.accessibilityRole==='button')!;
    expect(StyleSheet.flatten(chip.props.style({pressed:false})).minHeight).toBe(24);expect(chip.props.hitSlop).toEqual({bottom:20,left:10,right:10});
    await act(async()=>chip.props.onPress());expect(mockTimelineDateJump).toHaveBeenCalledWith(date);
    await act(async()=>screen.root.findByProps({testID:'help-chat-header-overlay'}).props.onLayout({nativeEvent:{layout:{height:144}}}));
    expect(StyleSheet.flatten(overlay().props.style).top).toBe(initialTop+44);
    await act(async()=>mockTimelineProps.onStickyDateChange(null));expect(screen.root.findAllByProps({testID:'help-sticky-date-overlay'})).toHaveLength(0);
  });
  test('quote navigation loads around its message instead of walking older pages',async()=>{
    await openWithMessage();await act(async()=>bubble().props.onQuote(999));
    expect(mockService.jumpToMessage).toHaveBeenCalledWith(999);
    expect(mockService.loadOlder).not.toHaveBeenCalled();
  });
  test('chat search replaces the header and back closes search before leaving the ticket',async()=>{
    await openWithMessage();
    await act(async()=>composer().props.onChange('Неотправленный черновик'));
    await act(async()=>button('Поиск в переписке').props.onPress());
    expect(screen.root.findAllByProps({testID:'help-chat-search-input'}).length).toBeGreaterThan(0);
    expect(screen.root.findAllByType('HelpComposer' as any)).toHaveLength(0);
    expect(screen.root.findAllByProps({testID:'help-chat-search-dock'}).length).toBeGreaterThan(0);
    expect(screen.root.findAllByProps({testID:'help-chat-search-arrows'}).length).toBeGreaterThan(0);
    await act(async()=>button('Назад').props.onPress());
    expect(screen.root.findAllByProps({testID:'help-chat-search-input'})).toHaveLength(0);
    expect(composer().props.value).toBe('Неотправленный черновик');
    expect(bubble()).toBeTruthy();
  });
  test('chat uses the shared header, keeps IT in its menu, and excludes the header from the recording area',async()=>{
    await openWithMessage();expect(button('Подключить IT')).toBeUndefined();
    await act(async()=>button('Действия с обращением').props.onPress());
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Подключить IT')).toBe(true);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-header-overlay'}).props.style)).toMatchObject({position:'absolute',top:0});
    const thumbnail={id:'photo',name:'photo.png',kind:'IMAGE',url:'/help/photo',mimeType:'image/png',size:100};
    mockService.messages=[{...mockService.messages[0],attachments:[thumbnail]}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>bubble().props.onReply());
    await act(async()=>screen.root.findByProps({testID:'help-chat-viewport'}).props.onLayout({nativeEvent:{layout:{height:600}}}));
    expect(composer().props.recordingAreaHeight).toBe(444);
    expect(composer().props.quote.thumbnail).toEqual(thumbnail);expect(composer().props.resolve).toBe(mockService.mediaSource);
  });
  test('voice send keeps reply target and clears quote only after success',async()=>{
    await openWithMessage(); await act(async()=>bubble().props.onReply());
    expect(composer().props.quote).toBeTruthy();
    const voice={uri:'file://voice.m4a',name:'voice.m4a',mimeType:'audio/mp4'};
    mockService.uploadAttachments.mockResolvedValue([{id:'voice-upload'}]);
    await act(async()=>composer().props.onSend(voice));
    expect(mockService.sendMessage).toHaveBeenCalledWith(7,{text:'',attachmentIds:['voice-upload'],replyToId:31});
    expect(composer().props.quote).toBeUndefined();
  });
  test('switching close/edit modes preserves original message draft and disables replying',async()=>{
    await openWithMessage(); await act(async()=>composer().props.onChange('Мой обычный черновик'));
    await act(async()=>bubble().props.onCloseTicket());
    await act(async()=>composer().props.onChange('Отзыв о закрытии'));
    expect(bubble().props.open).toBe(false);
    await act(async()=>bubble().props.onReply());expect(composer().props.quote).toBeUndefined();
    await act(async()=>bubble().props.onEdit());
    await act(async()=>composer().props.onCancelMode());
    expect(composer().props.value).toBe('Мой обычный черновик');
  });
  test.each(['navigation','account'])('late source-return response cannot overwrite newer draft after %s change',async(change)=>{
    const linked={...ticket,sourceTicketId:8,sourceTicket:{id:8,number:1008,title:'Старое обращение'}};
    mockService.createTicket.mockImplementation(async()=>{mockService.selectedTicket=linked;return{ticket:linked,messages:[]};});
    await openWithMessage();await act(async()=>composer().props.onChange('Исходный черновик'));
    const sourceTicket={...ticket,id:8,number:1008,title:'Старое обращение'};
    mockService.openTicket.mockImplementation(async()=>{mockService.selectedTicket=sourceTicket;return{ticket:sourceTicket,messages:[]};});
    let link=screen.root.findByProps({name:'return-up-back'});while(typeof link.props.onPress!=='function')link=link.parent!;
    await act(async()=>link.props.onPress());
    let resolve!:(value:HelpDetail)=>void;
    mockService.openTicket.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    await act(async()=>button('Назад').props.onPress());
    if(change==='account'){mockService.userId=9;await act(async()=>screen.update(React.createElement(HelpScreen)));}
    else await act(async()=>button('Назад').props.onPress());
    await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Новый безопасный черновик'));
    await act(async()=>resolve({ticket:linked,messages:[]}));
    expect(composer().props.value).toBe('Новый безопасный черновик');
  });
});
