import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, Modal, PanResponder, StyleSheet } from 'react-native';
const mockUseHelpTheme = jest.fn(() => ({surface:'#222222',text:'#ffffff',muted:'#999999',accent:'#3388ff',accentText:'#88bbff',outgoing:'#334455',elevated:'#333333',line:'#444444'}));
jest.mock('@expo/vector-icons', () => ({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme', () => ({useHelpReducedMotion:()=>false,useHelpTheme:()=>mockUseHelpTheme()}));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({HelpIcon:'HelpIcon',HelpAvatar:'HelpAvatar'}));
jest.mock('../src/features/help/components/HelpMedia', () => ({HelpAudio:'HelpAudio',HelpImage:'HelpImage'}));
import { HelpMessageBubble } from '../src/features/help/components/HelpMessageBubble';
import { createHelpMessageLayoutCache, HelpMessageLayoutCacheContext } from '../src/features/help/helpMessageLayoutCache';

describe('Help message native layout and reply gestures', () => {
  let screen: TestRenderer.ReactTestRenderer;
  let props: any;
  let clock:number;
  beforeEach(() => {
    clock=Date.now();jest.spyOn(Date,"now").mockImplementation(()=>clock);
    mockUseHelpTheme.mockClear();
    jest.spyOn(PanResponder,'create').mockImplementation(config => ({panHandlers:config} as any));
    jest.spyOn(Animated,'spring').mockReturnValue({start:jest.fn(),stop:jest.fn(),reset:jest.fn()});
    props = {message:{id:1,authorId:7,kind:'TEXT',text:'Проверка',createdAt:'2026-10-23T10:00:00Z',attachments:[],reactions:[]},userId:7,open:true,canInteract:true,resolve:jest.fn(),onReply:jest.fn(),onMenu:jest.fn(),onDismissMenu:jest.fn(),onCopy:jest.fn(),onEdit:jest.fn(),onForward:jest.fn(),onReaction:jest.fn(),onQuote:jest.fn(),onImage:jest.fn(),onFile:jest.fn(),onCloseTicket:jest.fn(),onRequestIt:jest.fn(),onError:jest.fn()};
  });
  afterEach(async () => { if(screen) await act(async()=>screen.unmount()); jest.restoreAllMocks(); });
  const node = (id:string) => screen.root.findAll(n=>n.props.testID===id)[0];
  const g = (dx:number,dy=0) => ({dx,dy,numberActiveTouches:1});
  const event=(pageX:number)=>({nativeEvent:{pageX,touches:[{pageX}]}});
  const start=(pan:any,x=200)=>pan.onStartShouldSetPanResponderCapture(event(x));
  const hold=()=>{clock+=500;};
  async function render() { await act(async()=>{ screen=TestRenderer.create(React.createElement(HelpMessageBubble,props)); }); }
  test('reopening a measured incoming text restores its width and inline time before new measurements',async()=>{
    const cache=createHelpMessageLayoutCache();props.message={...props.message,ticketId:12,authorId:8};
    const tree=()=>React.createElement(HelpMessageLayoutCacheContext.Provider,{value:cache},React.createElement(HelpMessageBubble,props));
    await act(async()=>{screen=TestRenderer.create(tree());});
    await act(async()=>{
      node('help-message-1').props.onLayout({nativeEvent:{layout:{width:360}}});
      node('help-text-layout').props.onLayout({nativeEvent:{layout:{width:240}}});
      node('help-message-text').props.onTextLayout({nativeEvent:{lines:[{x:0,width:170}]}});
      node('help-message-time').props.onLayout({nativeEvent:{layout:{width:50}}});
    });
    const width=node('help-message-bubble').parent!.props.style.minWidth;
    expect(node('help-message-time').props.style.position).toBe('absolute');
    await act(async()=>screen.unmount());await act(async()=>{screen=TestRenderer.create(tree());});
    expect(node('help-message-bubble').parent!.props.style.minWidth).toBe(width);
    expect(node('help-message-time').props.style.position).toBe('absolute');
  });
  test('closure shows one centered event and the selected stars, even for older API messages', async () => {
    props.message = { ...props.message, kind: 'CLOSURE', rating: 4, text: 'Спасибо, помогло' };
    await render();
    expect(StyleSheet.flatten(node('help-ticket-status-1').props.style).alignItems).toBe('center');
    expect(node('help-ticket-status-1').findAll(n => n.props.children === 'Вы закрыли обращение').length).toBeGreaterThan(0);
    expect(node('help-closure-rating').props.accessibilityLabel).toBe('Оценка: 4 из 5');
    expect(screen.root.findAll(n => (n.type as any) === 'Ionicons' && n.props.name === 'star')).toHaveLength(4);
    expect(screen.root.findAll(n => (n.type as any) === 'Ionicons' && n.props.name === 'star-outline')).toHaveLength(1);
    expect(node('help-message-text').props.children).toBe('Спасибо, помогло');
  });
  test('reopen retains the reason below its event, without closure stars', async () => {
    props.message = { ...props.message, ticketStatusChange: 'REOPENED', text: 'Снова ошибка' };
    await render();
    expect(node('help-ticket-status-1').findAll(n => n.props.children === 'Вы открыли обращение повторно').length).toBeGreaterThan(0);
    expect(node('help-message-text').props.children).toBe('Снова ошибка');
    expect(screen.root.findAll(n => n.props.testID === 'help-closure-rating')).toHaveLength(0);
  });
  test('empty closure places time beside stars and omits the numeric fraction', async () => {
    props.message = { ...props.message, kind: 'CLOSURE', text: '', rating: 4 };
    await render();
    expect(node('help-closure-meta').findAll(n => n.props.testID === 'help-message-time').length).toBeGreaterThan(0);
    expect(StyleSheet.flatten(node('help-message-time').props.style)).toMatchObject({ alignSelf: 'center', marginTop: 0 });
    expect(screen.root.findAll(n => n.props.children === '4/5')).toHaveLength(0);
  });
  test('scroll callback churn skips the measured body but gestures always call the newest handlers', async () => {
    await render();
    const initialRenders = mockUseHelpTheme.mock.calls.length;
    const firstMenu = props.onMenu, firstReply = props.onReply;
    const longPress = node('help-message-bubble').props.onLongPress;
    const pan = node('help-message-1').props;
    const actionNames = Object.keys(props).filter(key => key.startsWith('on'));
    for (let iteration = 0; iteration < 10; iteration++) {
      props = { ...props, ...Object.fromEntries(actionNames.map(name => [name, jest.fn()])) };
      await act(async () => screen.update(React.createElement(HelpMessageBubble, props)));
    }
    expect(mockUseHelpTheme).toHaveBeenCalledTimes(initialRenders);
    expect(PanResponder.create).toHaveBeenCalledTimes(1);
    start(pan);await act(async () => {longPress();pan.onTouchEnd();});
    start(pan);hold();pan.onMoveShouldSetPanResponderCapture(null,g(-40));
    await act(async () => {pan.onPanResponderGrant(event(160),g(-40));pan.onPanResponderRelease(event(20),g(-180));});
    expect(props.onMenu).toHaveBeenCalledTimes(1); expect(props.onReply).toHaveBeenCalledTimes(1);
    expect(firstMenu).not.toHaveBeenCalled(); expect(firstReply).not.toHaveBeenCalled();
  });
  test.each([
    ['selected', true], ['highlighted', true], ['readByOthers', true], ['groupFirst', false], ['groupLast', false],
    ['open', false], ['canInteract', false], ['solution', true], ['searchQuery', 'Проверка'], ['userId', 8],
  ])('memo boundary retains the visual %s update', async (name, value) => {
    await render(); const before = mockUseHelpTheme.mock.calls.length;
    props = { ...props, [name as string]: value };
    await act(async () => screen.update(React.createElement(HelpMessageBubble, props)));
    expect(mockUseHelpTheme.mock.calls.length).toBeGreaterThan(before);
    expect(PanResponder.create).toHaveBeenCalledTimes(1);
  });
  test('message edits and account media resolver changes update through the memo boundary', async () => {
    props.message = { ...props.message, text: '', attachments: [{ id: 'voice', kind: 'AUDIO', name: 'Voice' }] };
    await render(); const before = mockUseHelpTheme.mock.calls.length;
    props = { ...props, resolve: jest.fn() };
    await act(async () => screen.update(React.createElement(HelpMessageBubble, props)));
    expect(mockUseHelpTheme.mock.calls.length).toBeGreaterThan(before);
    expect(screen.root.findByType('HelpAudio' as any).props.resolve).toBe(props.resolve);
    props = { ...props, message: { ...props.message, text: 'Исправлено' } };
    await act(async () => screen.update(React.createElement(HelpMessageBubble, props)));
    expect(node('help-message-text').props.children).toBe('Исправлено');
    expect(PanResponder.create).toHaveBeenCalledTimes(1);
  });
  test('memoized menu actions and media errors forward the latest callbacks with arguments', async () => {
    props.selected = true;
    props.message = { ...props.message, attachments: [{ id: 'voice', kind: 'AUDIO', name: 'Voice' }] };
    await render();
    const dismiss = node('help-message-menu-backdrop').props.onPress;
    const error = screen.root.findByType('HelpAudio' as any).props.onError;
    const reaction = screen.root.findAll(n => n.props.accessibilityLabel === 'Реакция ❤️')[0].props.onPress;
    const copy = screen.root.findAll(n => n.props.label === 'Копировать')[0].props.onPress;
    const before = mockUseHelpTheme.mock.calls.length;
    props = { ...props, onDismissMenu: jest.fn(), onError: jest.fn(), onReaction: jest.fn(), onCopy: jest.fn() };
    await act(async () => screen.update(React.createElement(HelpMessageBubble, props)));
    expect(mockUseHelpTheme).toHaveBeenCalledTimes(before);
    await act(async () => { dismiss(); error('Не удалось загрузить аудио'); reaction(); copy(); });
    expect(props.onDismissMenu).toHaveBeenCalledTimes(1); expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onError).toHaveBeenCalledWith('Не удалось загрузить аудио'); expect(props.onReaction).toHaveBeenCalledWith('❤️');
  });
  test('fallback measurement rerenders reuse gesture and animation identities', async () => {
    props.message={...props.message,authorId:8};
    await render();
    const firstHandlers = node('help-message-1').props.onPanResponderMove;
    await act(async () => {
      node('help-message-1').props.onLayout({ nativeEvent: { layout: { width: 360 } } });
      node('help-text-layout').props.onLayout({ nativeEvent: { layout: { width: 200 } } });
      node('help-message-text').props.onTextLayout({ nativeEvent: { lines: [{ x: 0, width: 120 }] } });
    });
    expect(mockUseHelpTheme.mock.calls.length).toBeGreaterThan(1);
    expect(PanResponder.create).toHaveBeenCalledTimes(1);
    expect(node('help-message-1').props.onPanResponderMove).toBe(firstHandlers);
  });
  test('selection keeps bubble geometry and floats a dismissible menu outside message layout',async()=>{
    await render();
    const original=StyleSheet.flatten(node('help-message-bubble').props.style);
    props.selected=true;
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(StyleSheet.flatten(node('help-message-bubble').props.style)).toEqual(original);
    expect(StyleSheet.flatten(node('help-message-outline').props.style)).toMatchObject({position:'absolute',borderWidth:2});
    expect(node('help-message-menu').props.style.position).toBe('absolute');
    node('help-message-menu-backdrop').props.onPress();
    expect(props.onDismissMenu).toHaveBeenCalledTimes(1);
    screen.root.findByType(Modal).props.onRequestClose();
    expect(props.onDismissMenu).toHaveBeenCalledTimes(2);
    expect(node('help-message-text').props.selectable).toBe(false);
    props.selected=false;
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(screen.root.findAll(n=>n.props.testID==='help-message-menu')).toHaveLength(0);
  });
  test('left swipe captures immediately and right swipe remains for navigation',async()=>{
    await render();const pan=node('help-message-1').props;
    start(pan);expect(pan.onMoveShouldSetPanResponderCapture(null,g(-30))).toBe(true);
    start(pan);expect(pan.onMoveShouldSetPanResponderCapture(null,g(30))).toBe(false);
  });
  test('short left swipe replies without hold or reaching the edge, on release',async()=>{
    await render();const pan=node('help-message-1').props;
    start(pan);expect(pan.onMoveShouldSetPanResponderCapture(null,g(-30))).toBe(true);
    await act(async()=>{pan.onPanResponderGrant(event(170),g(-30));pan.onPanResponderMove(event(161),g(-39));pan.onPanResponderRelease(event(161),g(-39));});
    expect(props.onReply).not.toHaveBeenCalled();
    start(pan);expect(pan.onMoveShouldSetPanResponderCapture(null,g(-30))).toBe(true);
    await act(async()=>{pan.onPanResponderGrant(event(170),g(-30));pan.onPanResponderMove(event(160),g(-40));});
    expect(props.onReply).not.toHaveBeenCalled();
    await act(async()=>pan.onPanResponderRelease(event(160),g(-40)));
    expect(props.onReply).toHaveBeenCalledTimes(1);expect(props.onMenu).not.toHaveBeenCalled();
  });
  test('returning below the short swipe threshold or termination cancels reply',async()=>{
    await render();const pan=node('help-message-1').props;
    start(pan);hold();pan.onMoveShouldSetPanResponderCapture(null,g(-30));
    await act(async()=>{pan.onPanResponderGrant(event(170),g(-30));pan.onPanResponderMove(event(20),g(-180));pan.onPanResponderMove(event(180),g(-20));pan.onPanResponderRelease(event(180),g(-20));});
    expect(props.onReply).not.toHaveBeenCalled();
    start(pan);hold();pan.onMoveShouldSetPanResponderCapture(null,g(-30));
    await act(async()=>{pan.onPanResponderGrant(event(170),g(-30));pan.onPanResponderTerminate();pan.onPanResponderRelease(event(20),g(-180));});
    expect(props.onReply).not.toHaveBeenCalled();
  });
  test('vertical moves, audio seek and noninteractive messages never capture',async()=>{
    await render();const pan=node('help-message-1').props;
    start(pan);hold();expect(pan.onMoveShouldSetPanResponderCapture(null,g(-10,80))).toBe(false);
    props.message={...props.message,attachments:[{id:'voice',kind:'AUDIO',name:'voice.m4a'}]};await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    start(pan);hold();node('help-audio-touch').props.onTouchStart();expect(pan.onMoveShouldSetPanResponderCapture(null,g(-80))).toBe(false);
    props.open=false;await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    start(pan);hold();expect(pan.onMoveShouldSetPanResponderCapture(null,g(-80))).toBe(false);
    props.open=true;props.canInteract=false;await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    start(pan);hold();expect(pan.onMoveShouldSetPanResponderCapture(null,g(-80))).toBe(false);
  });
  test('message moves left immediately and indicator fills after a short swipe',async()=>{
    props.message={...props.message,authorId:8};await render();const pan=node('help-message-1').props,content=node('help-message-swipe-content');
    expect(content.findAll(n=>n.props.testID==='help-message-avatar-slot').length).toBeGreaterThan(0);
    const translation=StyleSheet.flatten(content.props.style).transform[0].translateX as any;
    start(pan);hold();pan.onMoveShouldSetPanResponderCapture(null,g(-30));
    await act(async()=>{pan.onPanResponderGrant(event(170),g(-30));pan.onPanResponderMove(event(180),g(-20));});
    expect(translation.__getValue()).toBe(-20);
    const fill=StyleSheet.flatten(node('help-reply-swipe-fill').props.style).transform[0].scale;
    expect(fill.__getValue()).toBeCloseTo(.5);
    await act(async()=>pan.onPanResponderMove(event(20),g(-180)));
    expect(translation.__getValue()).toBe(-80);expect(fill.__getValue()).toBe(1);
    await act(async()=>pan.onPanResponderRelease(event(20),g(-180)));
    expect(props.onReply).toHaveBeenCalledTimes(1);
  });
  test('hold without dragging keeps the menu available on release, without intercepting the drag',async()=>{
    await render();const pan=node('help-message-1').props;
    start(pan);hold();node('help-message-bubble').props.onLongPress();
    expect(props.onMenu).not.toHaveBeenCalled();pan.onTouchEnd();expect(props.onMenu).toHaveBeenCalledTimes(1);
    start(pan);hold();node('help-message-bubble').props.onLongPress();pan.onMoveShouldSetPanResponderCapture(null,g(-30));pan.onTouchEnd();
    expect(props.onMenu).toHaveBeenCalledTimes(1);
  });
  test('stamp shares last line only when measured space exists, including edited text', async () => {
    props.message={...props.message,authorId:8};
    await render();
    await act(async()=>{
      node('help-text-layout').props.onLayout({nativeEvent:{layout:{width:240}}});
      node('help-message-text').props.onTextLayout({nativeEvent:{lines:[{x:0,width:170}]}});
      node('help-message-time').props.onLayout({nativeEvent:{layout:{width:50}}});
    });
    expect(node('help-message-time').props.style.position).toBe('absolute');
    await act(async()=>node('help-message-time').props.onLayout({nativeEvent:{layout:{width:100}}}));
    expect(node('help-message-time').props.style.position).toBeUndefined();
    props.message={...props.message,text:'Другой длинный текст',editedAt:'2026-10-23T10:05:00Z'};
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(node('help-message-time').props.style.position).toBeUndefined();
    props.message={...props.message,reactions:[{emoji:'❤️',mine:true,count:1}]};
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(node('help-message-time').props.style.position).toBeUndefined();
  });
  test('photo-only reserves metadata aspect ratio before loading and keeps timestamp over the image', async () => {
    props.message={...props.message,text:'',attachments:[{id:'photo',kind:'IMAGE',name:'Photo',width:800,height:400}]};
    await render();
    const image=screen.root.findByType('HelpImage' as any);
    expect(image.props.resizeMode).toBe('contain');
    expect(node('help-message-time').props.style.backgroundColor).toBe('#00000088');
    expect(node('help-message-time').props.style.position).toBe('absolute');
    expect(node('help-message-time').parent!.props.pointerEvents).toBe('none');
    expect(image.props.onAspectRatio).toBeUndefined();
    expect(image.parent!.props.style.width/image.parent!.props.style.height).toBeCloseTo(2);
  });
  test('short outgoing text keeps its first-paint timestamp through Android fractional row widths', async () => {
    props.message={...props.message,text:'132'};
    await render();
    const firstStamp=StyleSheet.flatten(node('help-message-time').props.style);
    expect(firstStamp).toMatchObject({position:'absolute',bottom:8,right:11});
    expect(node('help-message-stamp-reserve')).toBeDefined();
    expect(node('help-message-text').props.onTextLayout).toBeUndefined();
    expect(node('help-text-layout').props.onLayout).toBeUndefined();
    for(const width of [388,387.81]) {
      await act(async()=>node('help-message-1').props.onLayout({nativeEvent:{layout:{width}}}));
      expect(StyleSheet.flatten(node('help-message-time').props.style)).toEqual(firstStamp);
    }
  });
  test('audio-only timestamp is part of audio caption, not a separate footer', async () => {
    props.message={...props.message,text:'',attachments:[{id:'voice',kind:'AUDIO',name:'Voice'}]};
    await render();
    const audio=screen.root.findByType('HelpAudio' as any);
    expect(audio.props.captionRight.props.testID).toBe('help-message-time');
    expect(screen.root.findAll(n=>n.props.testID==='help-message-time')).toHaveLength(0);
  });
  test('sent messages stay single and muted until a participant read receipt is provided', async () => {
    await render();
    expect(node('help-message-receipt').props).toMatchObject({ name: 'checkmark', color: '#999999', accessibilityLabel: 'Отправлено' });
    expect(node('help-message-bubble').props.accessibilityLabel).toContain('Отправлено');
    props.readByOthers = true;
    await act(async () => screen.update(React.createElement(HelpMessageBubble, props)));
    expect(node('help-message-receipt').props).toMatchObject({ name: 'checkmark-done', color: '#88bbff', accessibilityLabel: 'Прочитано' });
    expect(node('help-message-bubble').props.accessibilityLabel).toContain('Прочитано');
  });
  test('incoming messages never show an outgoing delivery receipt', async () => {
    props.message = { ...props.message, authorId: 8 };
    props.readByOthers = true;
    await render();
    expect(screen.root.findAll(n => n.props.testID === 'help-message-receipt')).toHaveLength(0);
    expect(node('help-message-bubble').props.accessibilityLabel).not.toContain('Прочитано');
  });
});
