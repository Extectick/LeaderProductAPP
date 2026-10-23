import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { HelpDetail, HelpTicket } from '../src/features/help/helpApi';

const mockRouter = { replace: jest.fn() };
let mockFocused = true;
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({theme:'light'}) }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused, useFocusEffect: (effect:any) => {
  require('react').useEffect(()=>mockFocused ? effect() : undefined,[effect,mockFocused]);
} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/features/help/components/HelpMedia', () => ({ HelpGallery: 'HelpGallery', downloadHelpAttachment: jest.fn() }));
jest.mock('../src/features/help/components/HelpComposer', () => ({ HelpComposer: 'HelpComposer' }));
jest.mock('../src/features/help/components/HelpMessageBubble', () => ({ HelpMessageBubble: 'HelpMessageBubble' }));
jest.mock('../src/features/help/components/HelpPrimitives', () => {
  const React = require('react'); const { Pressable, View, Text } = require('react-native');
  return {
    HelpIcon: ({label,onPress,disabled}:any) => React.createElement(Pressable,{accessibilityLabel:label,onPress,disabled}),
    HelpPrimaryButton: ({text,onPress,disabled}:any) => React.createElement(Pressable,{accessibilityLabel:text,onPress,disabled}),
    HelpDock: ({children}:any) => React.createElement(View,null,children),
    HelpAvatar: () => React.createElement(View),
    HelpTyping: ({text}:any) => React.createElement(Text,null,text),
    HelpNotice: ({text}:any) => React.createElement(Text,null,text),
    HelpSheet: ({title,children}:any) => React.createElement(View,{accessibilityLabel:title},children),
  };
});
const mockService: any = {};
jest.mock('../src/features/help/useHelpService', () => ({ useHelpService: () => mockService }));
import HelpScreen from '../src/features/help/HelpScreen';

const ticket: HelpTicket = { id: 7, number: 1007, title: 'Принтер', status: 'OPEN', ownerId: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), closedAt: null, sourceTicketId: null, sourceTicket: null, itRequested: false, members: [], unreadCount: 0, lastMessage: null, canReopen: false, aiEnabled: false };
const detail: HelpDetail = { ticket, messages: [] };
describe('Help screen integration with service boundary', () => {
  let screen: TestRenderer.ReactTestRenderer;
  beforeEach(() => {
    mockFocused = true;
    Object.assign(mockService,{tickets:[],selectedTicket:null,messages:[],loading:false,busy:false,error:null,online:true,connected:true,canManage:false,userId:5,typingByTicket:{},hasMore:false,
      loadTickets:jest.fn().mockResolvedValue(undefined),clearSelection:jest.fn(()=>{mockService.selectedTicket=null;}),openTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),getDraft:jest.fn().mockResolvedValue(''),setDraft:jest.fn().mockResolvedValue(undefined),emitTyping:jest.fn(),createTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),sendMessage:jest.fn().mockResolvedValue(detail),uploadAttachments:jest.fn(),closeTicket:jest.fn().mockResolvedValue(detail),reopenTicket:jest.fn(),editMessage:jest.fn(),toggleReaction:jest.fn(),mediaSource:jest.fn(),loadOlder:jest.fn(),retryPending:jest.fn(),markAllRead:jest.fn(),requestIt:jest.fn(),claimTicket:jest.fn()});
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpScreen));});}
  function button(label:string){return screen.root.findAll(node=>node.props.accessibilityLabel===label && typeof node.props.onPress==='function')[0];}
  function composer(){return screen.root.findByType('HelpComposer' as any);}
  test('approved list header and search retain final 56px header and 125px list offset',async()=>{
    await render();
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-header'}).props.style)).toMatchObject({height:56,paddingHorizontal:14,gap:8,backgroundColor:'#FFFFFF'});
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Помощь')).toBe(true);
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Мои обращения')).toBe(true);
    expect(StyleSheet.flatten(screen.root.findByProps({testID:'help-search-surface'}).props.style)).toMatchObject({height:40,marginTop:19,marginBottom:10,marginHorizontal:14,borderRadius:22,backgroundColor:'#EEF2F7'});
  });
  test('closed list row uses compact gray styling, lock and account-scoped draft preview',async()=>{
    mockService.tickets=[{...ticket,status:'CLOSED'}];
    mockService.getDraft.mockResolvedValue('Дополнительная информация');
    await render();await act(async()=>button('Закрытые обращения').props.onPress());
    const row=screen.root.findByProps({testID:'help-ticket-row-7'});
    expect(StyleSheet.flatten(typeof row.props.style==='function' ? row.props.style({pressed:false}) : row.props.style)).toMatchObject({minHeight:76,paddingHorizontal:14,paddingVertical:12,backgroundColor:'#F0F1F3'});
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Черновик: ')).toBe(true);
    expect(screen.root.findByProps({name:'lock-closed-outline'}).props.size).toBe(15);
    expect(mockService.getDraft).toHaveBeenCalledWith('ticket:7');
  });
  test.each(['android','ios'] as const)('keyboard avoidance is enabled on %s',async platform=>{
    const original=Platform.OS;
    try {
      Object.defineProperty(Platform,'OS',{configurable:true,value:platform});
      await render();
      expect(screen.root.findByType(KeyboardAvoidingView).props.behavior).toBe(platform==='android'?'height':'padding');
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
  const scrollEvent = (y:number,height=1000,viewport=400) => ({nativeEvent:{contentOffset:{y},contentSize:{height},layoutMeasurement:{height:viewport}}});
  test.each(['wheel','touch','scrollbar','keyboard'])('web %s scroll-up preserves history across new messages and composer/layout changes',async intent=>{
    const originalPlatform=Platform.OS, originalWindow=globalThis.window;
    const frames:FrameRequestCallback[]=[];
    const raf=jest.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    (globalThis as any).window={location:{href:'http://localhost/qa'},history:{state:null,pushState:jest.fn()},addEventListener:jest.fn(),removeEventListener:jest.fn()};
    try {
      await openWithMessage();
      const chat=()=>screen.root.findAll(n=>n.props.testID==='help-chat-scroll')[0];
      const end=jest.spyOn(screen.root.findByType(ScrollView).instance,'scrollToEnd');
      await act(async()=>{while(frames.length)frames.shift()!(0);chat().props.onScroll(scrollEvent(600));});end.mockClear();
      // Queue an automatic follow, then interrupt it before the animation frame.
      await act(async()=>chat().props.onContentSizeChange());
      await act(async()=>{
        if(intent==='wheel')chat().props.onWheel({deltaY:-120,currentTarget:{scrollHeight:1000,clientHeight:400}});
        if(intent==='touch')chat().props.onTouchMove();
        if(intent==='scrollbar')chat().props.onPointerDown();
        if(intent==='keyboard')chat().props.onKeyDown({key:'PageUp',target:{tagName:'DIV'}});
        chat().props.onScroll(scrollEvent(300));
        if(intent==='scrollbar')chat().props.onPointerUp();
        while(frames.length)frames.shift()!(0);
      });
      mockService.messages=[...mockService.messages,{...mockService.messages[0],id:32,sequence:2}];
      await act(async()=>screen.update(React.createElement(HelpScreen)));
      await act(async()=>{chat().props.onContentSizeChange();chat().props.onLayout();composer().props.onResize();while(frames.length)frames.shift()!(0);});
      expect(end).not.toHaveBeenCalled();
      await act(async()=>{chat().props.onScroll(scrollEvent(600));composer().props.onResize();while(frames.length)frames.shift()!(0);});
      expect(end).toHaveBeenCalled();
      await act(async()=>screen.unmount());
    } finally {raf.mockRestore();Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});globalThis.window=originalWindow;}
  });
  test.each(['web','android'])('%s layout resize without user scroll intent keeps bottom anchoring',async platform=>{
    const originalPlatform=Platform.OS, originalWindow=globalThis.window;
    const frames:FrameRequestCallback[]=[];
    const raf=jest.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
    Object.defineProperty(Platform,'OS',{configurable:true,value:platform});
    if(platform==='web')(globalThis as any).window={location:{href:'http://localhost/qa'},history:{state:null,pushState:jest.fn()},addEventListener:jest.fn(),removeEventListener:jest.fn()};
    try {
      await openWithMessage();
      const chat=screen.root.findAll(n=>n.props.testID==='help-chat-scroll')[0];
      const end=jest.spyOn(screen.root.findByType(ScrollView).instance,'scrollToEnd');
      await act(async()=>{while(frames.length)frames.shift()!(0);chat.props.onScroll(scrollEvent(600));});end.mockClear();
      await act(async()=>{chat.props.onScroll(scrollEvent(600,1000,250));chat.props.onLayout();composer().props.onResize();while(frames.length)frames.shift()!(0);});
      expect(end).toHaveBeenCalled();
      await act(async()=>screen.unmount());
    } finally {raf.mockRestore();Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});globalThis.window=originalWindow;}
  });
  test('floating date appears only after its inline separator leaves viewport and resets between chats/accounts',async()=>{
    await openWithMessage();
    const chat=()=>screen.root.findAll(n=>n.props.testID==='help-chat-scroll')[0];
    const dates=()=>screen.root.findAllByType(Text).filter(n=>n.props.children==='Сегодня');
    await act(async()=>screen.root.findByProps({testID:'help-date-Сегодня'}).props.onLayout({nativeEvent:{layout:{y:12,height:24}}}));
    await act(async()=>chat().props.onScroll(scrollEvent(0)));expect(dates()).toHaveLength(1);
    await act(async()=>chat().props.onScroll(scrollEvent(30)));expect(dates()).toHaveLength(1);
    await act(async()=>chat().props.onScroll(scrollEvent(37)));expect(dates()).toHaveLength(2);
    await act(async()=>chat().props.onScroll(scrollEvent(0)));expect(dates()).toHaveLength(1);
    await act(async()=>chat().props.onScroll(scrollEvent(37)));expect(dates()).toHaveLength(2);
    await act(async()=>button('Назад').props.onPress());
    await act(async()=>button('Новое обращение').props.onPress());expect(dates()).toHaveLength(0);
    mockService.userId=9;await act(async()=>screen.update(React.createElement(HelpScreen)));expect(dates()).toHaveLength(0);
  });
  test('chat header IT action is visible and quote exposes thumbnail plus measured recording area',async()=>{
    await openWithMessage();expect(button('Подключить IT').props.disabled).toBe(false);
    const thumbnail={id:'photo',name:'photo.png',kind:'IMAGE',url:'/help/photo',mimeType:'image/png',size:100};
    mockService.messages=[{...mockService.messages[0],attachments:[thumbnail]}];
    await act(async()=>screen.update(React.createElement(HelpScreen)));
    await act(async()=>bubble().props.onReply());
    await act(async()=>screen.root.findByProps({testID:'help-chat-viewport'}).props.onLayout({nativeEvent:{layout:{height:600}}}));
    expect(composer().props.recordingAreaHeight).toBe(544);
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
