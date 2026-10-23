import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
import type { HelpDetail, HelpTicket } from '../src/features/help/helpApi';

const mockRouter = { replace: jest.fn() };
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({theme:'light'}) }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));
jest.mock('expo-router/react-navigation', () => ({ useFocusEffect: () => {} }));
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
    Object.assign(mockService,{tickets:[],selectedTicket:null,messages:[],loading:false,busy:false,error:null,online:true,connected:true,canManage:false,userId:5,typingByTicket:{},hasMore:false,
      loadTickets:jest.fn().mockResolvedValue(undefined),clearSelection:jest.fn(()=>{mockService.selectedTicket=null;}),openTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),getDraft:jest.fn().mockResolvedValue(''),setDraft:jest.fn().mockResolvedValue(undefined),emitTyping:jest.fn(),createTicket:jest.fn(async()=>{mockService.selectedTicket=ticket;return detail;}),sendMessage:jest.fn().mockResolvedValue(detail),uploadAttachments:jest.fn(),closeTicket:jest.fn().mockResolvedValue(detail),reopenTicket:jest.fn(),editMessage:jest.fn(),toggleReaction:jest.fn(),mediaSource:jest.fn(),loadOlder:jest.fn(),retryPending:jest.fn(),markAllRead:jest.fn(),requestIt:jest.fn(),claimTicket:jest.fn()});
  });
  afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpScreen));});}
  function button(label:string){return screen.root.findAll(node=>node.props.accessibilityLabel===label && typeof node.props.onPress==='function')[0];}
  function composer(){return screen.root.findByType('HelpComposer' as any);}
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
});
