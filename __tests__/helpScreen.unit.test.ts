import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { HelpDetail, HelpTicket } from '../src/features/help/helpApi';

jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:(props:any)=>{require('react').useLayoutEffect(()=>{props.onLayout?.({nativeEvent:{layout:{width:390,height:800}}});},[]);return require('react').createElement(require('react-native').View,props);}},cancelAnimation:jest.fn(),runOnJS:(fn:any)=>fn,
  useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:()=>any)=>Object.defineProperties({},Object.fromEntries(Object.keys(fn()).map(key=>[key,{enumerable:true,get:()=>fn()[key]}]))),
  withTiming:(value:number,_config:any,done?:any)=>{done?.(true);return value;},Easing:{out:(fn:any)=>fn,cubic:(x:number)=>x},
}));
const mockRouter = { replace: jest.fn(), dismissTo: jest.fn() };
jest.mock('@shopify/flash-list',()=>{
  const React=require('react'),{ScrollView}=require('react-native');
  return {FlashList:React.forwardRef((props:any,ref:any)=>{
    React.useImperativeHandle(ref,()=>({scrollToOffset:jest.fn()}));
    return React.createElement(ScrollView,props,props.data.length?props.data.map((item:any)=>React.createElement(React.Fragment,{key:item.id},props.renderItem({item}))):props.ListEmptyComponent,props.ListFooterComponent);
  })};
});
let mockFocused = true;
let mockNativeChatLayout = false;
let mockNativeAtomicTailMotion = false;
let mockNativeImeLayout = false;
let mockNativeStableImeLayout = false;
let mockNativeDockControls = false;
let mockTimelineProps:any;
const mockPlayback:any={};
const mockUseAudioController=jest.fn((_options:any)=>mockPlayback);
const mockTimelineDateJump=jest.fn();
const mockAttachmentDrafts={load:jest.fn(),save:jest.fn(),clear:jest.fn(),hold:jest.fn()};
jest.mock('../src/features/knowledge/api', () => ({ knowledgeApi: { config: jest.fn(async () => ({ canManage: false })) } }));
jest.mock('../src/features/help/helpAttachmentDrafts',()=>({loadHelpAttachmentDraft:(...args:any[])=>mockAttachmentDrafts.load(...args),saveHelpAttachmentDraft:(...args:any[])=>mockAttachmentDrafts.save(...args),clearHelpAttachmentDraft:(...args:any[])=>mockAttachmentDrafts.clear(...args),holdHelpAttachmentFiles:(...args:any[])=>mockAttachmentDrafts.hold(...args)}));
jest.mock('../src/features/help/components/HelpPhotoPortal',()=>({HelpPhotoPortalProvider:({children}:any)=>require('react').createElement('HelpPhotoPortalProvider',null,children)}));
jest.mock('../src/features/help/HelpAudioPlayback',()=>({
  useHelpAudioController:(options:any)=>mockUseAudioController(options),
  HelpAudioPlaybackProvider:({value,children}:any)=>require('react').createElement('HelpAudioPlaybackProvider',{value},children),
  useHelpAudioPlayback:()=>mockPlayback,
}));
jest.mock('../src/features/help/components/HelpNativeChatLayout', () => ({
  get hasNativeChatLayout() { return mockNativeChatLayout; }, get hasNativeAtomicTailMotion() { return mockNativeAtomicTailMotion; }, get hasNativeImeLayout() { return mockNativeImeLayout; },get hasNativeStableImeLayout(){return mockNativeStableImeLayout;},get hasNativeDockControls(){return mockNativeDockControls;}, HelpNativeChatLayout:'HelpNativeChatLayout',
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
    return React.createElement(ScrollView,{testID:'help-chat-scroll',nativeID:props.nativeID,onLayout:()=>{},onScrollBeginDrag:()=>{},contentContainerStyle:{paddingBottom:mockNativeChatLayout?0:props.dockHeight+12}},props.header,props.messages.map((message:any)=>React.createElement(React.Fragment,{key:message.id},props.renderMessage(message))),(props.pendingMessages??[]).map((item:any)=>React.createElement(React.Fragment,{key:item.key},props.renderPending(item))),props.footer);
  })};
});

jest.mock('../src/features/help/components/HelpPrimitives', () => {
  const React = require('react'); const { Pressable, View, Text } = require('react-native');
  return {
    HelpIcon: ({label,onPress,disabled}:any) => React.createElement(Pressable,{accessibilityLabel:label,onPress,disabled}),
    HelpPrimaryButton: ({text,onPress,disabled}:any) => React.createElement(Pressable,{accessibilityLabel:text,onPress,disabled}),
    HelpDock: ({children}:any) => React.createElement(View,null,children),
    HelpBlurSurface: (props:any) => React.useContext(require('../src/features/help/helpVisualEffects').HelpVisualEffectsContext) ? React.createElement('HelpBlurSurface',props) : null,
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
import {HelpPendingMessage} from '../src/features/help/components/HelpPendingMessage';

const ticket: HelpTicket = { id: 7, number: 1007, title: 'Принтер', status: 'OPEN', ownerId: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), closedAt: null, sourceTicketId: null, sourceTicket: null, itRequested: false, members: [], unreadCount: 0, lastMessage: null, canReopen: false, aiEnabled: false };
const detail: HelpDetail = { ticket, messages: [] };
describe('Help screen integration with service boundary', () => {
  let screen: TestRenderer.ReactTestRenderer;
  beforeEach(() => {
    jest.spyOn(PanResponder,'create').mockImplementation(config=>({panHandlers:config} as any));
    mockFocused = true;
    mockAttachmentDrafts.load.mockReset().mockResolvedValue([]);mockAttachmentDrafts.save.mockReset().mockImplementation(async(_user:any,_key:any,files:any)=>files);mockAttachmentDrafts.clear.mockReset().mockResolvedValue(undefined);mockAttachmentDrafts.hold.mockReset().mockImplementation(()=>jest.fn());
    mockNativeChatLayout = false;mockNativeAtomicTailMotion=false;
    mockNativeImeLayout = false;mockNativeStableImeLayout=false;mockNativeDockControls=false;
    mockTimelineProps=undefined;mockUseAudioController.mockClear();mockTimelineDateJump.mockClear();
    Object.assign(mockPlayback,{current:null,positionSeconds:0,durationSeconds:0,progress:0,playing:false,loading:false,ready:false,error:null,speed:1,toggle:jest.fn().mockResolvedValue(undefined),setSpeed:jest.fn(),stop:jest.fn(),seek:jest.fn().mockResolvedValue(undefined),play:jest.fn().mockResolvedValue(undefined)});
    Object.assign(mockService,{queueFileTicket:undefined,tickets:[],selectedTicket:null,messages:[],pendingMessages:[],lastCreatedOperation:null,loading:false,busy:false,error:null,online:true,connected:true,canManage:false,userId:5,typingByTicket:{},hasMore:false,
      loadTickets:jest.fn().mockResolvedValue(undefined),clearSelection:jest.fn(()=>{mockService.selectedTicket=null;}),openTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),getDraft:jest.fn().mockResolvedValue(''),setDraft:jest.fn().mockResolvedValue(undefined),emitTyping:jest.fn(),createTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),sendMessage:jest.fn().mockResolvedValue(detail),uploadAttachments:jest.fn(),closeTicket:jest.fn().mockResolvedValue(detail),reopenTicket:jest.fn(),editMessage:jest.fn(),toggleReaction:jest.fn(),mediaSource:jest.fn(),loadOlder:jest.fn(),loadNewer:jest.fn(),jumpToLatest:jest.fn().mockResolvedValue(undefined),jumpToMessage:jest.fn().mockResolvedValue(undefined),saveViewport:jest.fn(),markVisibleRead:jest.fn(),searchMessages:jest.fn().mockResolvedValue({messages:[],total:0,nextCursor:null}),retryPending:jest.fn(),retryPendingOperation:jest.fn().mockResolvedValue(undefined),markAllRead:jest.fn(),requestIt:jest.fn(),claimTicket:jest.fn()});
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());jest.restoreAllMocks();});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpScreen));});}
  test('default list is owned by the service; later searches still debounce a request',async()=>{
    jest.useFakeTimers();
    try{
      await render();await act(async()=>jest.advanceTimersByTimeAsync(300));
      expect(mockService.loadTickets).not.toHaveBeenCalled();
      await act(async()=>screen.root.findByType(TextInput).props.onChangeText('принтер'));
      await act(async()=>jest.advanceTimersByTimeAsync(300));
      expect(mockService.loadTickets).toHaveBeenLastCalledWith('OPEN','mine',false,'принтер');
    }finally{jest.useRealTimers();}
  });
  test('recovery action ignores healthy sends and retries only interrupted operations without blocking the composer',async()=>{
    const item={key:'upload',ticketId:7,create:false,createdAt:1,input:{text:'QA'},status:'sending',attempts:0};
    mockService.pendingMessages=[item];mockService.pendingCount=1;mockService.tickets=[ticket];
    await render();await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(button('Восстановить отправку')).toBeUndefined();
    mockService.pendingMessages=[item,{...item,key:'retry',status:'queued',attempts:1}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>button('Восстановить отправку').props.onPress());
    expect(mockService.retryPendingOperation).toHaveBeenCalledWith('retry');expect(mockService.retryPendingOperation).toHaveBeenCalledTimes(1);
    expect(mockService.retryPending).not.toHaveBeenCalled();expect(composer().props.busy).toBe(false);
  });
  test('old native chat layout receives the keyboard offset on both composer and timeline',async()=>{
    jest.replaceProperty(Platform,'OS','android');
    let inset!: (height:number)=>void;
    jest.spyOn(require('../src/features/help/useHelpKeyboardInset'),'useHelpKeyboardInset').mockImplementation((...args:any[])=>{if(args[1])inset=args[2];return ()=>{};});
    mockNativeChatLayout=true;mockNativeImeLayout=false;mockService.tickets=[ticket];await render();
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    const viewport=()=>StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-visible-viewport'}).props.style);
    const before=viewport().bottom;
    await act(async()=>inset(250));
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-dock-layout'}).props.style).bottom).toBe(250);
    expect(viewport().bottom).toBe(before+250);expect(mockTimelineProps.dockHeight).toBe(0);
    await act(async()=>inset(0));expect(viewport().bottom).toBe(before);
  });
  test('Help has no duplicate section title and returns to the existing catalogue route',async()=>{
    mockRouter.dismissTo.mockClear();mockRouter.replace.mockClear();await render();
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Поддержка')).toBe(false);
    let exitFrame!:FrameRequestCallback;
    jest.spyOn(global,'requestAnimationFrame').mockImplementation(callback=>{exitFrame=callback;return 1;});
    await act(async()=>button('Назад').props.onPress());
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.root.findByProps({testID:'help-screen-navigation'}).props.pointerEvents).toBe('none');
    await act(async()=>exitFrame(0));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/services');expect(mockRouter.replace).not.toHaveBeenCalled();
    mockFocused=false;await act(async()=>screen.update(React.createElement(HelpScreen)));
    mockFocused=true;await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findByProps({testID:'help-screen-navigation'}).props.pointerEvents).toBe('auto');
  });
  test('the same list instance survives opening, entry completion and returning from a chat',async()=>{
    mockService.tickets=[ticket];await render();
    const list=screen.root.findByProps({testID:'help-ticket-list'});
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(screen.root.findByProps({testID:'help-header-ticket-number'}).props.children).toBe('#1007');
    expect(screen.root.findByProps({testID:'help-header-status'}).props.accessibilityLabel).toBe('Обращение открыто');
    await act(async()=>mockTimelineProps.onReady());
    expect(screen.root.findByProps({testID:'help-ticket-list'})).toBe(list);
    const progress=screen.root.findByType(HelpChatEntry).props.progress!;
    await act(async()=>button('Назад').props.onPress());
    expect(screen.root.findByProps({testID:'help-ticket-list'})).toBe(list);
    expect(screen.root.findAllByProps({testID:'help-chat-viewport'})).toHaveLength(0);
    act(()=>{progress.value=1;});
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-list-scene'}).props.style).transform).toEqual([{translateX:0}]);
  });
  test('new activity moves a chat to the top, including when returning from that chat',async()=>{
    const older={...ticket,id:8,number:1008,title:'Сеть',updatedAt:'2026-10-01T10:00:00Z'};
    const original={...ticket,updatedAt:'2026-10-02T10:00:00Z'};
    mockService.tickets=[original,older];
    mockService.openTicket.mockImplementation(async()=>{mockService.selectedTicket=older;return {ticket:older,messages:[]};});
    await render();
    const list=()=>screen.root.findByProps({testID:'help-ticket-list'});
    const ids=()=>list().props.data.map((row:HelpTicket)=>row.id);
    expect(ids()).toEqual([7,8]);
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-8'}).props.onPress());
    const extraData=list().props.extraData,renderItem=list().props.renderItem;
    await act(async()=>composer().props.onChange('Уточнение'));
    expect(list().props.extraData).toBe(extraData);expect(list().props.renderItem).toBe(renderItem);
    const updated={...older,updatedAt:'2026-11-04T10:00:00Z',unreadCount:2};
    mockService.tickets=[updated,original];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(ids()).toEqual([8,7]);
    await act(async()=>button('Назад').props.onPress());
    expect(ids()).toEqual([8,7]);
    expect(list().props.data[0]).toBe(updated);expect(list().props.data[1]).toBe(original);
    expect(mockService.loadTickets).toHaveBeenLastCalledWith('OPEN','mine',false,'',true);
  });
  test('a new chat appears above existing rows and the list anchors only when scrolled away from the top',async()=>{
    const older={...ticket,id:8,number:1008,updatedAt:'2026-10-01T10:00:00Z'};
    mockService.tickets=[ticket,older];await render();
    const list=()=>screen.root.findByProps({testID:'help-ticket-list'});
    expect(list().props.maintainVisibleContentPosition).toEqual({disabled:true});
    await act(async()=>list().props.onScroll({nativeEvent:{contentOffset:{y:300}}}));
    const anchorPolicy=list().props.maintainVisibleContentPosition;
    expect(anchorPolicy).toEqual({disabled:false});
    const fresh={...ticket,id:9,number:1009,updatedAt:'2026-11-05T12:00:00Z'};
    mockService.tickets=[older,fresh,ticket];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(list().props.data.map((row:HelpTicket)=>row.id)).toEqual([9,7,8]);
    expect(list().props.maintainVisibleContentPosition).toBe(anchorPolicy);
    await act(async()=>list().props.onScroll({nativeEvent:{contentOffset:{y:0}}}));
    expect(list().props.maintainVisibleContentPosition).toEqual({disabled:true});
  });
  test('read receipts and typing update the row without changing its activity order',async()=>{
    const older={...ticket,id:8,number:1008,updatedAt:'2026-10-01T10:00:00Z'};
    mockService.tickets=[ticket,older];await render();
    mockService.tickets=[{...older,unreadCount:0},ticket];
    mockService.typingByTicket={8:[{userId:3,name:'IT',avatarUrl:null}]};
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findByProps({testID:'help-ticket-list'}).props.data.map((row:HelpTicket)=>row.id)).toEqual([7,8]);
  });
  test('a cached ticket does not slide in before its message viewport is positioned',async()=>{
    mockService.tickets=[ticket];await render();
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(screen.root.findByType(HelpChatEntry).props.ready).toBe(false);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-viewport'}).props.style).opacity).toBe(0);
    await act(async()=>mockTimelineProps.onReady());
    expect(screen.root.findByType(HelpChatEntry).props.ready).toBe(true);
    expect(composer().props.navigationReady).toBe(true);
  });
  test('closing waits for IME without tearing down the outgoing composer geometry',async()=>{
    mockNativeChatLayout=true;mockService.tickets=[ticket];await render();
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());await act(async()=>mockTimelineProps.onReady());
    jest.spyOn(Keyboard,'isVisible').mockReturnValue(true);jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
    let hidden!:()=>void;const remove=jest.fn();jest.spyOn(Keyboard,'addListener').mockImplementation((_event,callback)=>{hidden=callback as ()=>void;return {remove} as any;});
    await act(async()=>button('Назад').props.onPress());
    expect(screen.root.findByType(HelpChatEntry).props.interactive).toBe(false);
    expect(composer().props.screenActive).toBe(true);expect(composer().props.navigationReady).toBe(false);
    expect(screen.root.findByType('HelpNativeChatLayout' as any).props.animateTail).toBe(false);
    await act(async()=>hidden());
    expect(screen.root.findAllByType(HelpChatEntry)).toHaveLength(0);expect(remove).toHaveBeenCalledTimes(1);
    expect(mockService.loadTickets).toHaveBeenLastCalledWith('OPEN','mine',false,'',true);
  });
  function button(label:string){return screen.root.findAll(node=>node.props.accessibilityLabel===label && typeof node.props.onPress==='function')[0];}
  function composer(){return screen.root.findByType('HelpComposer' as any);}
  test('attachment overlay cannot start chat back navigation',async()=>{
    await render();await act(async()=>button('Новое обращение').props.onPress());
    const pan=()=>screen.root.findAll(n=>n.props.testID==='help-screen-navigation')[0].props;
    const move={dx:120,dy:0,numberActiveTouches:1};
    expect(composer().props.navigationReady).toBe(true);
    await act(async()=>composer().props.onAttachmentVisibility(true));
    const closeKey=composer().props.closeAttachmentsKey;
    const dismiss=jest.spyOn(Keyboard,'dismiss');dismiss.mockClear();
    await act(async()=>button('Назад').props.onPress());
    expect(composer().props.closeAttachmentsKey).toBe(closeKey+1);
    expect(dismiss).not.toHaveBeenCalled();
    expect(composer().props.navigationReady).toBe(true);
    pan().onStartShouldSetPanResponderCapture();
    expect(pan().onMoveShouldSetPanResponderCapture(null,move)).toBe(false);
    await act(async()=>composer().props.onAttachmentVisibility(false));
    pan().onStartShouldSetPanResponderCapture();
    expect(pan().onMoveShouldSetPanResponderCapture(null,move)).toBe(true);
  });
  test('chat list shows a loading animation instead of action errors while its request is pending',async()=>{
    mockService.loading=true;mockService.error='Не удалось выполнить действие';await render();
    expect(screen.root.findByProps({testID:'help-chats-loading'}).props.accessibilityRole).toBe('progressbar');
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Загружаем чаты…')).toBe(true);
    expect(screen.root.findAllByType(Text).some(node=>String(node.props.children).includes('Повторить'))).toBe(false);
    mockService.loading=false;await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findAllByProps({testID:'help-chats-loading'})).toHaveLength(0);
    const retry=screen.root.findAll(node=>typeof node.props.onPress==='function'&&node.findAllByType(Text).some(text=>String(text.props.children).includes('Повторить'))).at(-1)!;
    mockService.loadTickets.mockClear();await act(async()=>retry.props.onPress());
    expect(mockService.loadTickets).toHaveBeenCalledWith('OPEN','mine',false,'');expect(mockService.retryPending).not.toHaveBeenCalled();
  });
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
  test('failed ticket opening returns to an interactive list and allows another attempt',async()=>{
    mockService.tickets=[ticket];mockService.openTicket.mockRejectedValueOnce(new Error('Не удалось открыть обращение'));
    await render();await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(screen.root.findAllByType(HelpChatEntry)).toHaveLength(0);
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(mockService.openTicket).toHaveBeenCalledTimes(2);
    expect(screen.root.findAllByType(HelpChatEntry)).toHaveLength(1);
  });
  test('timeline owns content growth while native layout keeps keyboard ownership',async()=>{
    mockNativeChatLayout=true;mockNativeImeLayout=true;mockService.tickets=[ticket];await render();
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    expect(screen.root.findByType('HelpNativeChatLayout' as any).props.animateTail).toBe(false);
    await act(async()=>{mockTimelineProps.onReady();screen.root.findByType(HelpChatEntry).props.onEntered();});
    expect(screen.root.findByType('HelpNativeChatLayout' as any).props.animateTail).toBe(false);
  });
  test('native keyboard reduces the actual chat viewport without duplicating the inset inside the list',async()=>{
    mockNativeChatLayout=true;mockNativeImeLayout=true;mockService.tickets=[ticket];await render();
    await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    const viewport=()=>StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-visible-viewport'}).props.style);const before=viewport().bottom;expect(viewport().overflow).toBe('hidden');expect(mockTimelineProps.dockHeight).toBe(0);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(250));
    expect(viewport().bottom).toBe(before+250);expect(mockTimelineProps.dockHeight).toBe(0);expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-dock-layout'}).props.style).bottom).toBe(250);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(0));
    expect(viewport().bottom).toBe(before);expect(mockTimelineProps.dockHeight).toBe(0);expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-dock-layout'}).props.style).bottom).toBe(0);
  });
  async function archiveAction(label:string){await act(async()=>button('Меню поддержки').props.onPress());await act(async()=>button(label).props.onPress());}
  test('stable native IME keeps Yoga bounds fixed while reporting occlusion to visibility tracking',async()=>{
    mockNativeChatLayout=true;mockNativeImeLayout=true;mockNativeStableImeLayout=true;
    await render();await act(async()=>button('Новое обращение').props.onPress());
    const viewport=()=>StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-visible-viewport'}).props.style);
    const before=viewport().bottom;
    const dock=mockTimelineProps.dockHeight;
    expect(before).toBe(0);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(250));
    expect(viewport().bottom).toBe(before);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-dock-layout'}).props.style).bottom).toBe(0);
    expect(mockTimelineProps.dockHeight).toBe(dock+250);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(0));
    expect(viewport().bottom).toBe(before);expect(mockTimelineProps.dockHeight).toBe(dock);
  });
  test('a completed right swipe anywhere in the chat navigates back and preserves the draft',async()=>{
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Черновик перед свайпом'));
    const pan=screen.root.findAll(n=>n.props.testID==='help-screen-navigation')[0].props;
    const gesture=(dx:number,dy=0)=>({dx,dy,x0:0,numberActiveTouches:1});
    const start=(pageX=10)=>pan.onStartShouldSetPanResponderCapture({nativeEvent:{touches:[{pageX}]}});
    start(200);
    expect(pan.onMoveShouldSetPanResponderCapture(null,gesture(40))).toBe(true);
    for(const [movement,pageX] of [[gesture(-120),200],[gesture(10,100),200]] as const){
      start(pageX);
      expect(pan.onMoveShouldSetPanResponderCapture(null,movement)).toBe(false);
    }
    start();
    expect(pan.onMoveShouldSetPanResponderCapture(null,gesture(40))).toBe(true);
    await act(async()=>pan.onPanResponderRelease(null,gesture(95)));
    expect(composer()).toBeDefined();
    start();
    await act(async()=>{pan.onPanResponderMove(null,gesture(140));pan.onPanResponderMove(null,gesture(110));pan.onPanResponderRelease(null,gesture(110));});
    expect(composer()).toBeDefined();
    start();
    await act(async()=>{pan.onPanResponderTerminate();pan.onPanResponderRelease(null,gesture(120));});
    expect(composer()).toBeDefined();
    start();
    expect(pan.onMoveShouldSetPanResponderCapture(null,gesture(100))).toBe(true);
    await act(async()=>pan.onPanResponderRelease(null,gesture(100)));
    expect(mockService.setDraft).toHaveBeenCalledWith('new:plain','Черновик перед свайпом');
    expect(button('Новое обращение')).toBeDefined();
    start();
    expect(pan.onMoveShouldSetPanResponderCapture(null,gesture(120))).toBe(false);
  });
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
  test('new ticket menu enables only search and keeps the unsent draft',async()=>{
    await render();
    await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Черновик нового обращения'));
    await act(async()=>button('Действия с обращением').props.onPress());
    expect(button('Поиск в переписке').props.disabled).not.toBe(true);
    expect(button('Закрыть обращение').props.disabled).toBe(true);
    expect(button('Подключить IT').props.disabled).toBe(true);
    await act(async()=>button('Поиск в переписке').props.onPress());
    expect(screen.root.findAllByProps({testID:'help-chat-search-input'}).length).toBeGreaterThan(0);
    await act(async()=>screen.root.findAllByProps({testID:'help-chat-search-input'})[0].props.onChangeText('заказ'));
    expect(mockService.searchMessages).not.toHaveBeenCalled();
    await act(async()=>button('Закрыть поиск').props.onPress());
    expect(composer().props.value).toBe('Черновик нового обращения');
    expect(mockService.createTicket).not.toHaveBeenCalled();
  });
  test('support header contains search and archive without the duplicated list heading',async()=>{
    await render();
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-header'}).props.style)).toMatchObject({paddingHorizontal:16});
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-header'}).props.style).backgroundColor).toBeUndefined();
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Поддержка')).toBe(false);
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Мои обращения')).toBe(false);
    expect(button('Прочитать все сообщения')).toBeUndefined();
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Архив')).toBe(false);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-search-surface'}).props.style)).toMatchObject({height:48,borderRadius:24,backgroundColor:'#EEF2F7'});
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
    expect(screen.root.findByProps({testID:'help-ticket-list'}).props.contentContainerStyle.paddingTop).toBe(68);
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
  test('text send keeps the visible keyboard and the same scene while enqueuing',async()=>{
    await render();await act(async()=>button('Новое обращение').props.onPress());
    const entry=screen.root.findByType(HelpChatEntry);
    const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});jest.spyOn(Keyboard,'isVisible').mockReturnValue(true);
    await act(async()=>composer().props.onChange('QA keyboard'));
    await act(async()=>composer().props.onSend());
    expect(mockService.createTicket).toHaveBeenCalledTimes(1);expect(dismiss).not.toHaveBeenCalled();
    expect(screen.root.findByType(HelpChatEntry)).toBe(entry);
  });
  test('header blur covers the status inset without an opaque header plate',async()=>{
    await render();
    expect(screen.root.findByProps({testID:'help-list-header-overlay'}).findAllByType('HelpBlurSurface' as any)).toHaveLength(1);
    await act(async()=>button('Новое обращение').props.onPress());
    expect(StyleSheet.flatten(screen.root.findByType(KeyboardAvoidingView).props.style).paddingTop).toBe(0);
    const header=screen.root.findByProps({testID:'help-chat-header-overlay'});
    expect(header.findAllByType('HelpBlurSurface' as any)).toHaveLength(1);
    expect(StyleSheet.flatten(header.props.style).backgroundColor).toBeUndefined();
    expect(StyleSheet.flatten(header.findByProps({testID:'help-chat-header-backdrop'}).props.style)).toMatchObject({top:0,bottom:-36,left:0,right:0});
  });
  test('retained ticket list releases its blur after chat entry and restores it on back',async()=>{
    await render();
    const list=screen.root.findByProps({testID:'help-ticket-list'});
    const header=()=>screen.root.findByProps({testID:'help-list-header-overlay'});
    expect(header().findAllByType('HelpBlurSurface' as any)).toHaveLength(1);
    await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>screen.root.findByType(HelpChatEntry).props.onEntered());
    expect(header().findAllByType('HelpBlurSurface' as any)).toHaveLength(0);
    expect(screen.root.findByProps({testID:'help-ticket-list'})).toBe(list);
    await act(async()=>button('Назад').props.onPress());
    expect(header().findAllByType('HelpBlurSurface' as any)).toHaveLength(1);
    expect(screen.root.findByProps({testID:'help-ticket-list'})).toBe(list);
  });
  test('typing preserves timeline data, renderers and chrome while row actions use the current draft',async()=>{
    const message={id:91,ticketId:7,sequence:1,text:'Первый текст',authorId:5,authorRole:'USER',createdAt:new Date().toISOString(),kind:'TEXT',attachments:[],reactions:[]} as any;
    const pending={key:'queued-photo',ticketId:7,create:false,createdAt:1,status:'queued',input:{text:'Фото',clientMessageId:'queued-photo'},localFiles:[{uri:'file://photo.jpg',name:'photo.jpg',mimeType:'image/jpeg'}]};
    mockService.tickets=[ticket];mockService.messages=[message];mockService.pendingMessages=[pending];
    await render();await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    const before=mockTimelineProps;
    const previousRow=before.renderMessage(message);
    await act(async()=>composer().props.onChange('Новый черновик'));
    for(const key of ['messages','pendingMessages','renderMessage','renderPending','header','footer'])expect(mockTimelineProps[key]).toBe(before[key]);
    // A retained row callback must capture the draft at invocation, not at render.
    await act(async()=>previousRow.props.onEdit());
    expect(composer().props.mode).toBe('edit');
    await act(async()=>composer().props.onCancelMode());
    expect(composer().props.value).toBe('Новый черновик');
    const previousRenderer=mockTimelineProps.renderMessage;
    await act(async()=>mockTimelineProps.renderMessage(message).props.onMenu());
    expect(mockTimelineProps.renderMessage).not.toBe(previousRenderer);
    expect(mockTimelineProps.renderMessage(message).props.selected).toBe(true);
    mockService.selectedTicket={...ticket,members:[{userId:6,lastReadSequence:1}]};
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(mockTimelineProps.renderMessage(message).props.readByOthers).toBe(true);
    mockService.messages=[{...message,clientMessageId:'queued-photo'}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(mockTimelineProps.pendingMessages).toHaveLength(0);
  });
  test('first send creates once and clears draft only after success',async()=>{
    mockNativeChatLayout=true;
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>mockTimelineProps.onReady());
    const entry=screen.root.findByType(HelpChatEntry),timeline=screen.root.findByProps({testID:'help-chat-scroll'}),input=composer();
    const native=screen.root.findByType('HelpNativeChatLayout' as any);
    expect(native.props.animateTail).toBe(false);
    expect(mockTimelineProps.bottomAligned).toBe(true);
    await act(async()=>mockTimelineProps.onFollow(true));
    expect(native.props.allowFollow).toBe(true);
    await act(async()=>composer().props.onChange('Не печатает принтер'));
    await act(async()=>composer().props.onSend());
    expect(mockService.createTicket).toHaveBeenCalledTimes(1);
    expect(mockService.createTicket).toHaveBeenCalledWith({text:'Не печатает принтер',attachmentIds:[],sourceTicketId:undefined},expect.any(Function));
    expect(composer().props.value).toBe('');
    expect(screen.root.findByType(HelpChatEntry)).toBe(entry);
    expect(screen.root.findByProps({testID:'help-chat-scroll'})).toBe(timeline);
    expect(composer()).toBe(input);
    expect(screen.root.findByType('HelpNativeChatLayout' as any)).toBe(native);
    expect(native.props.allowFollow).toBe(true);
    expect(native.props.animateTail).toBe(false);
    expect(mockTimelineProps.bottomAligned).toBe(true);
  });
  test('first message stays visible after the durable queue clears and before the chat page is installed',async()=>{
    let resolve!:(value:HelpDetail)=>void;
    mockService.createTicket.mockImplementation(()=>new Promise<HelpDetail>(done=>{resolve=done;}));
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Первое сообщение'));
    let request!:Promise<boolean>;await act(async()=>{request=composer().props.onSend();});
    const pending={key:'first-create',create:true,createdAt:1,status:'sending',input:{text:'Первое сообщение',clientMessageId:'first-create'}};
    mockService.pendingMessages=[pending];await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findByType(HelpPendingMessage).props.item.key).toBe(pending.key);
    mockService.pendingMessages=[];await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findByType(HelpPendingMessage).props.item.key).toBe(pending.key);
    const echoed=mockTimelineProps.pendingMessages;
    await act(async()=>mockTimelineProps.onLatestState({visible:true,count:0,loading:false}));
    expect(mockTimelineProps.pendingMessages).toBe(echoed);
    mockService.selectedTicket=ticket;mockService.messages=[{id:91,ticketId:7,sequence:1,clientMessageId:'first-create',text:'Первое сообщение',authorId:5,createdAt:new Date().toISOString(),kind:'TEXT',attachments:[],reactions:[]}];
    await act(async()=>{resolve({...detail,messages:mockService.messages});await request;});
    expect(screen.root.findAllByType(HelpPendingMessage)).toHaveLength(0);
    expect(mockTimelineProps.messages[0].clientMessageId).toBe('first-create');
  });
  test('new appeal composer clears after durable enqueue and keeps the queued row on network failure',async()=>{
    const pending={key:'queued-first-create',create:true,createdAt:1,status:'queued',input:{text:'Первое обращение',clientMessageId:'queued-first-create'}};
    mockService.createTicket.mockImplementation(async(_input:any,onQueued:(item:any)=>Promise<void>)=>{await onQueued(pending);mockService.pendingMessages=[pending];throw new Error('Сеть недоступна');});
    await render();await act(async()=>button('Новое обращение').props.onPress());await act(async()=>composer().props.onChange('Первое обращение'));
    let accepted=false;await act(async()=>{accepted=await composer().props.onSend();});
    expect(accepted).toBe(true);
    expect(composer().props.value).toBe('');
    expect(mockService.setDraft).toHaveBeenCalledWith('new:plain','');
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(screen.root.findByType(HelpPendingMessage).props.item.key).toBe(pending.key);
  });
  test('a background retry binds the created ticket after its original draft was cleared',async()=>{
    const pending={key:'retried-first-create',create:true,createdAt:1,status:'failed',input:{text:'Сохранённый вопрос',clientMessageId:'retried-first-create'}};
    // Storage events may be coalesced before the screen sees the queue snapshot.
    mockService.createTicket.mockImplementation(async(_input:any,onQueued:(item:any)=>Promise<void>)=>{await onQueued(pending);throw new Error('Сеть недоступна');});
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Сохранённый вопрос'));
    await act(async()=>composer().props.onSend());
    expect(composer().props.value).toBe('');expect(composer().props.disabled).toBe(false);expect(composer().props.sendBlocked).toBe(true);
    mockService.pendingMessages=[];mockService.lastCreatedOperation={key:pending.key,ticketId:ticket.id,text:pending.input.text};
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(mockService.openTicket).toHaveBeenCalledWith(ticket.id,undefined);
    expect(composer().props.disabled).toBe(false);expect(composer().props.value).toBe('');
  });
  test('a delivered old creation cannot clear a later scene with the same text and new files',async()=>{
    const pending={key:'old-creation',create:true,createdAt:1,status:'failed',input:{text:'Одинаковый вопрос',clientMessageId:'old-creation'}};
    mockService.createTicket.mockImplementation(async(_input:any,onQueued:(item:any)=>Promise<void>)=>{await onQueued(pending);mockService.pendingMessages=[pending];throw new Error('Сеть недоступна');});
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange(pending.input.text));await act(async()=>composer().props.onSend());
    await act(async()=>button('Назад').props.onPress());await act(async()=>button('Новое обращение').props.onPress());
    const files=[{uri:'file://new-photo.jpg',name:'new-photo.jpg',mimeType:'image/jpeg'}];
    await act(async()=>{composer().props.onChange(pending.input.text);composer().props.onFiles(files);});
    mockService.openTicket.mockClear();mockService.pendingMessages=[];
    mockService.lastCreatedOperation={key:pending.key,ticketId:ticket.id,text:pending.input.text};
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(mockService.openTicket).not.toHaveBeenCalled();
    expect(composer().props.value).toBe(pending.input.text);expect(composer().props.files).toEqual(files);
  });
  test('typing the next correction before the first ticket acknowledgement transfers its draft to that chat',async()=>{
    const item={key:'first-with-correction',create:true,status:'sending',createdAt:1,input:{text:'Первый вопрос',clientMessageId:'first-with-correction'}};
    let resolveSend!:(value:HelpDetail)=>void,pending!:Promise<boolean>;
    mockService.createTicket.mockImplementation(async(_input:any,onQueued:(item:any)=>Promise<void>)=>{await onQueued(item);return new Promise<HelpDetail>(resolve=>{resolveSend=resolve;});});
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Первый вопрос'));
    await act(async()=>{pending=composer().props.onSend();});
    const correctionFiles=[{uri:'file://correction.jpg',name:'correction.jpg',mimeType:'image/jpeg'}];
    await act(async()=>{composer().props.onChange('Ещё уточнение');composer().props.onFiles(correctionFiles);});
    mockService.lastCreatedOperation={key:item.key,ticketId:ticket.id,text:item.input.text};
    await act(async()=>{resolveSend(detail);await pending;});
    expect(mockService.openTicket).toHaveBeenCalledWith(ticket.id,undefined);
    expect(composer().props.value).toBe('Ещё уточнение');expect(composer().props.files).toEqual(correctionFiles);
    expect(mockService.setDraft).toHaveBeenCalledWith(`ticket:${ticket.id}`,'Ещё уточнение');
    expect(mockAttachmentDrafts.save).toHaveBeenCalledWith(5,`ticket:${ticket.id}`,correctionFiles);
    expect(composer().props.disabled).toBe(false);expect(composer().props.sendBlocked).toBe(false);
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
  test('file enqueue clears the composer without waiting for upload or keyboard dismissal',async()=>{
    const keyboard=require('react-native').Keyboard;
    jest.spyOn(keyboard,'isVisible').mockReturnValue(true);
    const dismiss=jest.spyOn(keyboard,'dismiss');
    mockService.tickets=[ticket];mockService.queueFileTicket=jest.fn();
    await render();await act(async()=>screen.root.findByProps({testID:'help-ticket-row-7'}).props.onPress());
    const files=[{uri:'file://draft.pdf',name:'draft.pdf'}];
    await act(async()=>{composer().props.onChange('Документ');composer().props.onFiles(files);});
    dismiss.mockClear();
    await act(async()=>{expect(await composer().props.onSend()).toBe(true);});
    expect(mockService.uploadAttachments).not.toHaveBeenCalled();
    expect(mockService.sendMessage).toHaveBeenCalledWith(7,{text:'Документ',replyToId:undefined},files);
    expect(dismiss).not.toHaveBeenCalled();expect(composer().props.value).toBe('');expect(composer().props.files).toEqual([]);expect(composer().props.busy).toBe(false);
  });
  test('first file enqueue paints the pending message and clears only the submitted draft',async()=>{
    const files=[{uri:'file://photo.jpg',name:'photo.jpg',mimeType:'image/jpeg'}];
    mockService.queueFileTicket=jest.fn(async(input:any,localFiles:any,onQueued:any)=>{
      const item={key:'queued-file-create',create:true,status:'queued',createdAt:Date.now(),input,localFiles};
      mockService.pendingMessages=[item];await onQueued(item);return item;
    });
    await render();await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>{composer().props.onChange('С фото');composer().props.onFiles(files);});
    await act(async()=>{expect(await composer().props.onSend()).toBe(true);});
    expect(mockService.uploadAttachments).not.toHaveBeenCalled();expect(mockService.createTicket).not.toHaveBeenCalled();
    expect(composer().props.files).toEqual([]);expect(composer().props.value).toBe('');expect(composer().props.busy).toBe(false);
    expect(screen.root.findAllByType(HelpPendingMessage)).toHaveLength(1);
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
  test.each(['Новый черновик','Первый вопрос'])('late first-send response cannot replace a newer draft or retain its pending row: %s',async(newDraft)=>{
    let resolveSend!:(value:HelpDetail)=>void;
    mockService.createTicket.mockImplementation(()=>new Promise<HelpDetail>(resolve=>{resolveSend=resolve;}));
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Первый вопрос'));
    let pending!:Promise<void>; await act(async()=>{pending=composer().props.onSend();});
    mockService.pendingMessages=[{key:'abandoned-create',create:true,createdAt:1,status:'sending',input:{text:'Первый вопрос',clientMessageId:'abandoned-create'}}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>button('Назад').props.onPress());
    await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange(newDraft));
    mockService.pendingMessages=[];
    await act(async()=>{resolveSend(detail);await pending;});
    expect(composer().props.value).toBe(newDraft);
    expect(screen.root.findAllByType(HelpPendingMessage)).toHaveLength(0);
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
    expect(mockService.createTicket).toHaveBeenCalledWith({text:'Подпись',attachmentIds:['first.jpg','second.jpg'],sourceTicketId:undefined},expect.any(Function));
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
  test('native keyboard ownership follows chat focus and releases when another screen covers it',async()=>{
    mockNativeChatLayout=true;mockNativeImeLayout=true;
    await render();await act(async()=>button('Новое обращение').props.onPress());
    const native=()=>screen.root.findByType('HelpNativeChatLayout' as any);
    expect(native().props.manageIme).toBe(true);
    mockFocused=false;await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(native().props.manageIme).toBe(false);
    mockFocused=true;await act(async()=>screen.update(React.createElement(HelpScreen)));
    expect(native().props.manageIme).toBe(true);
  });
  async function openWithMessage() {
    await render(); await act(async()=>button('Новое обращение').props.onPress());
    await act(async()=>composer().props.onChange('Первый вопрос'));
    await act(async()=>composer().props.onSend());
    mockService.messages=[{id:31,ticketId:7,sequence:1,authorId:5,authorRole:'USER',author:{id:5,name:'Я'},kind:'TEXT',text:'Исходное сообщение',createdAt:new Date().toISOString(),attachments:[],reactions:[]}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
  }

  test('question and ordinary message drafts remain separate through mode switches and final submission', async () => {
    await openWithMessage();
    await act(async () => composer().props.onChange('Отдельный черновик'));
    mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 32, sequence: 2, authorId: 0, authorRole: 'SYSTEM', text: 'Уточните систему.', assistantRun: { runId: 'draft-modes', status: 'completed', questions: [{ id: 'os', header: 'Система', question: 'Какая ОС?', multiSelect: false, options: [] }] } }];
    await act(async () => screen.update(React.createElement(HelpScreen)));
    await act(async () => screen.root.findByType(HelpChatEntry).props.onEntered());
    expect(composer().props.value).toBe('Отдельный черновик');
    await act(async () => button('Развернуть вопросы ИИ').props.onPress());
    expect(composer().props.value).toBe('');
    await act(async () => composer().props.onChange('Windows 11'));
    await act(async () => button('Обычное сообщение').props.onPress());
    expect(composer().props.value).toBe('Отдельный черновик');
    await act(async () => button('Развернуть вопросы ИИ').props.onPress());
    expect(composer().props.value).toBe('Windows 11');
    mockService.sendMessage.mockClear().mockImplementation(async (_id: number, input: any) => {
      mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 33, sequence: 3, authorId: 5, text: input.text }];
      return { ...detail, messages: mockService.messages };
    });
    await act(async () => button('Проверить ответы').props.onPress());
    expect(mockService.sendMessage).not.toHaveBeenCalled();
    await act(async () => button('Отправить ответы').props.onPress());
    expect(mockService.sendMessage.mock.calls[0][1].text).toBe('Какая ОС?\nОтвет: Windows 11');
    expect(composer().props.value).toBe('Отдельный черновик');
    expect(composer().props.questionActionLabel).toBeUndefined();
  });
  test('photo-picker sends only stage files for the questionnaire until the explicit review submission', async () => {
    await openWithMessage();
    mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 32, sequence: 2, authorId: 0, authorRole: 'SYSTEM', text: 'Нужен файл.', assistantRun: { runId: 'file-answer', status: 'completed', questions: [{ id: 'log', header: 'Лог', question: 'Пришлите лог', multiSelect: false, options: [] }] } }];
    await act(async () => screen.update(React.createElement(HelpScreen)));
    await act(async () => screen.root.findByType(HelpChatEntry).props.onEntered());
    mockService.sendMessage.mockClear();
    const file = { uri: 'file://diagnostics.txt', name: 'diagnostics.txt', mimeType: 'text/plain', size: 12 };
    const uploaded = { id: 'attached-file', kind: 'FILE', name: file.name, mimeType: file.mimeType, size: 12, url: '/help/attachments/attached-file' };
    mockService.uploadAttachments.mockResolvedValue([uploaded]);
    let staged: boolean | undefined;
    await act(async () => { staged = await composer().props.onSend(undefined, [file]); });
    expect(staged).toBe(true);
    expect(mockService.sendMessage).not.toHaveBeenCalled();
    expect(mockService.uploadAttachments).not.toHaveBeenCalled();
    expect(composer().props.files).toEqual([file]);
    await act(async () => button('Отправить ответы').props.onPress());
    expect(mockService.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockService.sendMessage.mock.calls[0][1].text).toContain('вложен');
    expect(mockService.sendMessage.mock.calls[0][1].attachmentIds).toEqual(['attached-file']);
  });


  test('typing during questionnaire send keeps the new text and the previous ordinary draft', async () => {
    await openWithMessage();
    await act(async () => composer().props.onChange('Черновик сообщения'));
    mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 32, sequence: 2, authorId: 0, authorRole: 'SYSTEM', text: 'Уточните систему.', assistantRun: { runId: 'send-race', status: 'completed', questions: [{ id: 'os', header: 'Система', question: 'Какая ОС?', multiSelect: false, options: [] }] } }];
    await act(async () => screen.update(React.createElement(HelpScreen)));
    await act(async () => screen.root.findByType(HelpChatEntry).props.onEntered());
    await act(async () => button('Развернуть вопросы ИИ').props.onPress());
    await act(async () => composer().props.onChange('Windows 11'));
    await act(async () => button('Проверить ответы').props.onPress());
    let release!: (value: any) => void;
    mockService.sendMessage.mockClear().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await act(async () => button('Отправить ответы').props.onPress());
    expect(mockService.sendMessage.mock.calls[0][1].text).toBe('Какая ОС?\nОтвет: Windows 11');
    await act(async () => composer().props.onChange('Windows 11 — новое уточнение'));
    mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 33, sequence: 3, authorId: 5, text: 'Какая ОС?\nОтвет: Windows 11' }];
    await act(async () => release({ ...detail, messages: mockService.messages }));
    expect(composer().props.value).toBe('Черновик сообщения\n\nWindows 11 — новое уточнение');
    expect(composer().props.questionActionLabel).toBeUndefined();
  });

  function bubble(){return screen.root.findByType('HelpMessageBubble' as any);}
  test('questions live in the measured dock, preserve the composer and send chosen answers through the normal durable send', async () => {
    await openWithMessage();
    const originalComposer = composer();
    mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 32, sequence: 2, authorId: 0, authorRole: 'SYSTEM', text: 'Уточните систему.', assistantRun: { runId: 'questions', status: 'completed', questions: [{ id: 'os', header: 'Система', question: 'Какая ОС?', multiSelect: false, options: [{ label: 'Windows 11' }] }] } }];
    await act(async () => screen.update(React.createElement(HelpScreen)));
    await act(async () => screen.root.findByType(HelpChatEntry).props.onEntered());
    expect(composer()).toBe(originalComposer);
    expect(screen.root.findByProps({ testID: 'help-chat-dock-layout' }).findByProps({ testID: 'help-question-panel' })).toBeTruthy();
    expect(screen.root.findByType('HelpAssistantMessage' as any).props.onSuggestion).toBeUndefined();
    mockService.sendMessage.mockClear();
    await act(async () => button('Windows 11').props.onPress());
    expect(mockService.sendMessage).not.toHaveBeenCalled();
    await act(async () => button('Проверить ответы').props.onPress());
    expect(mockService.sendMessage).not.toHaveBeenCalled();
    await act(async () => button('Отправить ответы').props.onPress());
    expect(mockService.sendMessage).toHaveBeenCalledWith(7, { text: 'Какая ОС?\nОтвет: Windows 11', attachmentIds: [], replyToId: undefined });
  });
  test('AI IT button opens confirmation; cancelling leaves the ticket with AI and double confirmation sends once', async () => {
    await openWithMessage();
    mockService.messages = [...mockService.messages, { ...mockService.messages[0], id: 32, sequence: 2, authorId: 0, authorRole: 'SYSTEM', text: 'Можно вызвать специалиста.', assistantRun: { runId: 'it-offer', status: 'completed', action: { type: 'request_it' } } }];
    await act(async () => screen.update(React.createElement(HelpScreen)));
    const offer = () => screen.root.findByType('HelpAssistantMessage' as any);
    await act(async () => offer().props.onRequestIt());
    expect(mockService.requestIt).not.toHaveBeenCalled();
    await act(async () => button('Отмена').props.onPress());
    expect(mockService.requestIt).not.toHaveBeenCalled();
    await act(async () => offer().props.onRequestIt());
    let resolve!: () => void;
    mockService.requestIt.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const confirm = button('Подтвердить вызов');
    await act(async () => { confirm.props.onPress(); confirm.props.onPress(); });
    expect(mockService.requestIt).toHaveBeenCalledTimes(1);
    expect(mockService.requestIt).toHaveBeenCalledWith(7);
    await act(async () => resolve());
    mockService.selectedTicket = { ...ticket, itRequested: true };
    await act(async () => screen.update(React.createElement(HelpScreen)));
    expect(offer().props.onRequestIt).toBeUndefined();
  });
  test('latest and search controls use a full scene native sibling throughout keyboard movement',async()=>{
    mockNativeChatLayout=true;mockNativeImeLayout=true;mockNativeStableImeLayout=true;mockNativeDockControls=true;
    await openWithMessage();await act(async()=>mockTimelineProps.onReady());
    await act(async()=>mockTimelineProps.onLatestState({visible:true,count:2,loading:false}));
    const dock=()=>screen.root.findByProps({testID:'help-chat-dock-layout'});
    const controls=()=>screen.root.findByProps({testID:'help-dock-controls'});
    const latest=()=>controls().findByProps({testID:'help-jump-to-latest-motion'});
    const initialBottom=StyleSheet.flatten(latest().props.style).bottom;
    const anchor={position:'absolute',right:13,bottom:initialBottom};
    expect(dock().findAllByProps({testID:'help-jump-to-latest-motion'})).toHaveLength(0);
    expect(controls().props.nativeID).toBe(screen.root.findByType('HelpNativeChatLayout' as any).props.controlsId);
    expect(StyleSheet.flatten(latest().props.style)).toMatchObject(anchor);
    expect(StyleSheet.flatten(latest().props.style).bottom).toBe(initialBottom);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(260));
    expect(StyleSheet.flatten(latest().props.style)).toMatchObject(anchor);
    expect(StyleSheet.flatten(dock().props.style).bottom).toBe(0);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(0));
    expect(StyleSheet.flatten(latest().props.style)).toMatchObject(anchor);
    await act(async()=>button('Действия с обращением').props.onPress());
    await act(async()=>button('Поиск в переписке').props.onPress());
    const search=controls().findByProps({testID:'help-chat-search-arrows'});
    expect(StyleSheet.flatten(search.props.style)).toMatchObject({...anchor,right:8});
  });
  test('legacy APK shares native dock motion visually while full-scene proxies retain valid touch bounds',async()=>{
    mockNativeChatLayout=true;mockNativeImeLayout=true;mockNativeStableImeLayout=true;mockNativeDockControls=false;
    await openWithMessage();await act(async()=>mockTimelineProps.onReady());
    await act(async()=>mockTimelineProps.onLatestState({visible:true,count:2,loading:false}));
    const dock=()=>screen.root.findByProps({testID:'help-chat-dock-layout'});
    const controls=()=>screen.root.findByProps({testID:'help-dock-controls'});
    const visual=()=>dock().findByProps({testID:'help-jump-to-latest-motion'});
    const proxy=()=>controls().findAllByProps({testID:'help-jump-to-latest'}).find(node=>node.props.accessibilityRole==='button')!;
    const visualBottom=StyleSheet.flatten(visual().props.style).bottom;
    const proxyBottom=StyleSheet.flatten(proxy().parent!.props.style).bottom as number;
    expect(StyleSheet.flatten(visual().props.style)).toMatchObject({bottom:'100%',marginBottom:12});
    expect(dock().findByProps({testID:'help-dock-controls-native-visual'}).props.pointerEvents).toBe('none');
    expect(visual().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(proxy().props.accessibilityLabel).toBe('К последним сообщениям. Новых: 2');
    expect(StyleSheet.flatten(proxy().props.style).backgroundColor).toBe('transparent');
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(260));
    expect(StyleSheet.flatten(visual().props.style).bottom).toBe(visualBottom);
    expect(StyleSheet.flatten(proxy().parent!.props.style).bottom).toBe(proxyBottom+260);
    await act(async()=>screen.root.findByType('HelpNativeChatLayout' as any).props.onImeInsetChange(0));
    expect(StyleSheet.flatten(proxy().parent!.props.style).bottom).toBe(proxyBottom);
    await act(async()=>button('Действия с обращением').props.onPress());
    await act(async()=>button('Поиск в переписке').props.onPress());
    expect(dock().findByProps({testID:'help-chat-search-arrows-visual'}).props.pointerEvents).toBe('none');
    expect(controls().findByProps({testID:'help-chat-search-arrows'})).toBeTruthy();
  });
  test('image viewer pages through loaded message images without quoted previews or duplicate ids',async()=>{
    await openWithMessage();const first=mockService.messages[0];
    const image=(id:string)=>({id,kind:'IMAGE',name:`${id}.jpg`,width:100,height:100});
    const a=image('a'),b=image('b'),c=image('c'),missing=image('new');
    mockService.messages=[{...first,attachments:[a,{id:'file',kind:'FILE',name:'file.pdf'}],replyTo:{...first,attachments:[image('quoted')]}},{...first,id:32,sequence:2,attachments:[b,c,a]}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>screen.root.findAllByType('HelpMessageBubble' as any)[1].props.onImage([b,c,missing],1));
    const gallery=screen.root.findByType('HelpGallery' as any);
    expect(gallery.props.attachments.map((item:any)=>item.id)).toEqual(['a','b','c','new']);
    expect(gallery.props.initialIndex).toBe(2);
  });
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
    expect(StyleSheet.flatten(overlay().props.style).opacity).toBe(0);
    expect(overlay().props.pointerEvents).toBe('none');
    await act(async()=>mockTimelineProps.onHistoryScroll(true));
    expect(StyleSheet.flatten(overlay().props.style).opacity).toBe(1);
    expect(overlay().props.pointerEvents).toBe('box-none');
    jest.useFakeTimers();
    try{
      await act(async()=>mockTimelineProps.onHistoryScroll(true));
      await act(async()=>jest.advanceTimersByTime(2100));
      expect(StyleSheet.flatten(overlay().props.style).opacity).toBe(0);
      await act(async()=>mockTimelineProps.onHistoryScroll(true));
      await act(async()=>mockTimelineProps.onHistoryScroll(false));
      expect(StyleSheet.flatten(overlay().props.style).opacity).toBe(0);
    }finally{jest.useRealTimers();}
    const initialTop=StyleSheet.flatten(overlay().props.style).top;
    expect(initialTop).toBe(56);expect(initialTop-(68-16)).toBe(4);
    let ancestor=overlay().parent;while(ancestor){expect(ancestor.type).not.toBe('BlurTargetView');ancestor=ancestor.parent;}
    const chip=overlay().findAllByProps({testID:'help-date-jump'}).find(node=>node.props.accessibilityRole==='button')!;
    expect(StyleSheet.flatten(chip.props.style({pressed:false})).minHeight).toBe(24);expect(chip.props.hitSlop).toEqual({bottom:20,left:10,right:10});
    await act(async()=>chip.props.onPress());expect(mockTimelineDateJump).toHaveBeenCalledWith(date);
    await act(async()=>screen.root.findByProps({testID:'help-chat-header-overlay'}).props.onLayout({nativeEvent:{layout:{height:112}}}));
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
    expect(button('Поиск в переписке')).toBeUndefined();
    await act(async()=>button('Действия с обращением').props.onPress());
    expect(screen.root.findAllByProps({testID:'help-chat-dropdown'}).length).toBeGreaterThan(0);
    expect(screen.root.findAllByProps({testID:'help-sheet-surface'})).toHaveLength(0);
    await act(async()=>button('Поиск в переписке').props.onPress());
    expect(screen.root.findAllByProps({testID:'help-chat-dropdown'})).toHaveLength(0);
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
    expect(button('Действия с обращением')).toBeDefined();
    expect(screen.root.findByProps({testID:'help-chat-header-overlay'}).findByProps({testID:'help-search-surface'}).findAll(node=>node.props.accessibilityLabel==='Действия с обращением')).toHaveLength(0);
    await act(async()=>button('Действия с обращением').props.onPress());
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Подключить IT')).toBe(true);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-chat-header-overlay'}).props.style)).toMatchObject({position:'absolute',top:0});
    const thumbnail={id:'photo',name:'photo.png',kind:'IMAGE',url:'/help/photo',mimeType:'image/png',size:100};
    mockService.messages=[{...mockService.messages[0],attachments:[thumbnail]}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>bubble().props.onReply());
    await act(async()=>screen.root.findByProps({testID:'help-chat-viewport'}).props.onLayout({nativeEvent:{layout:{height:600}}}));
    expect(composer().props.recordingAreaHeight).toBe(476);
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
