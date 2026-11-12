import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Platform,Text} from 'react-native';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({text:'#123',muted:'#456',background:'#fff',soft:'#def',line:'#eee',incoming:'#fff',panel:'#eee',accentText:'#38f',draftText:'#d33',closedText:'#789',closedBackground:'#eee'}),useHelpReducedMotion:()=>false}));
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpAvatar:'HelpAvatar',HelpTyping:'HelpTyping'}));
jest.mock('../src/features/help/components/HelpAiIcon',()=>({HelpAiIcon:'HelpAiIcon'}));
jest.mock('../src/features/help/components/HelpAssistantAvatar',()=>({HelpAssistantAvatar:'HelpAssistantAvatar'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevRef:jest.fn()}));
import {HelpTicketRow} from '../src/features/help/components/HelpTicketRow';
import {helpDevRef} from '../src/features/help/helpDiagnostics';

const ticket:any={id:14,number:14,title:'Проверка пересылки',status:'OPEN',members:[],unreadCount:3,createdAt:'2026-11-07T08:00:00Z',lastMessage:{text:'Последнее сообщение',createdAt:'2026-11-07T09:00:00Z',attachments:[]}};
const dateNow=Date.parse('2026-11-07T10:00:00Z');
let view:TestRenderer.ReactTestRenderer;
const row=()=>view.root.findAll(n=>n.props.testID==='help-ticket-row-14'&&typeof n.props.style==='function')[0];
beforeEach(()=>jest.clearAllMocks());
afterEach(async()=>{if(view)await act(async()=>view.unmount());jest.restoreAllMocks();});

test.each(['android','web'])('destination row on %s only selects the ticket, without menu gestures',async platform=>{
 jest.replaceProperty(Platform,'OS',platform as any);const onPress=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpTicketRow,{ticket,dateNow,onPress,diagnostics:false}));});
 expect(row().props.onLongPress).toBeUndefined();expect(row().props.onContextMenu).toBeUndefined();expect(row().props.onKeyDown).toBeUndefined();
 expect(row().props.accessibilityRole).toBe('button');
 expect(row().props.accessibilityLabel).toBe('Обращение 14, Проверка пересылки, непрочитанных: 3');
 expect(row().props.style({pressed:false})).toMatchObject({minHeight:76,paddingVertical:12,gap:12});
 expect(view.root.findByType('HelpAssistantAvatar' as any).props).toMatchObject({ticketId:14,size:46,muted:false});
 expect(view.root.findAllByType(Text).some(n=>React.Children.toArray(n.props.children).join('')==='#14')).toBe(true);
 expect(view.root.findAllByType(Text).some(n=>n.props.children==='Последнее сообщение')).toBe(true);
 await act(async()=>row().props.onPress());expect(onPress).toHaveBeenCalledTimes(1);
 expect(helpDevRef).not.toHaveBeenCalled();
});

test('main-list menu retains mouse, keyboard and native hold callbacks without selecting a destination',async()=>{
 jest.replaceProperty(Platform,'OS','web');const onPress=jest.fn(),onMenu=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpTicketRow,{ticket,dateNow,onPress,onMenu}));});
 const event={clientX:123,clientY:234,preventDefault:jest.fn(),stopPropagation:jest.fn()};
 await act(async()=>row().props.onContextMenu(event));expect(onMenu).toHaveBeenLastCalledWith({x:123,y:234});
 await act(async()=>row().props.onContextMenu({...event,pointerType:'touch'}));expect(onMenu).toHaveBeenCalledTimes(1);
 await act(async()=>row().props.onKeyDown({...event,key:'F10',shiftKey:true,currentTarget:{getBoundingClientRect:()=>({left:10,top:20,bottom:100,width:240})}}));
 expect(onMenu).toHaveBeenLastCalledWith({x:42,y:92});
 await act(async()=>row().props.onLongPress());expect(onMenu).toHaveBeenLastCalledWith(undefined);expect(onPress).not.toHaveBeenCalled();
});

test('memoized row calls fresh selection handlers and removes optional menu handlers when reused by a picker',async()=>{
 jest.replaceProperty(Platform,'OS','web');const first=jest.fn(),next=jest.fn(),onMenu=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpTicketRow,{ticket,dateNow,onPress:first,onMenu}));});
 const activate=row().props.onPress;
 await act(async()=>view.update(React.createElement(HelpTicketRow,{ticket,dateNow,onPress:next,onMenu})));
 expect(row().props.onPress).toBe(activate);await act(async()=>activate());expect(first).not.toHaveBeenCalled();expect(next).toHaveBeenCalledTimes(1);
 await act(async()=>view.update(React.createElement(HelpTicketRow,{ticket,dateNow,onPress:next,disabled:true,diagnostics:false})));
 expect(row().props.disabled).toBe(true);expect(row().props.accessibilityState.disabled).toBe(true);
 expect(row().props.onLongPress).toBeUndefined();expect(row().props.onContextMenu).toBeUndefined();expect(row().props.onKeyDown).toBeUndefined();
 expect(row().props.style({pressed:false})).toMatchObject({minHeight:76,opacity:.5});
});
