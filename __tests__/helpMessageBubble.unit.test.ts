import {Dimensions} from 'react-native';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, Animated, Modal, PanResponder, Platform, Pressable, StyleSheet } from 'react-native';
const mockUseHelpTheme = jest.fn(() => ({surface:'#222222',text:'#ffffff',muted:'#999999',accent:'#3388ff',accentText:'#88bbff',outgoing:'#334455',elevated:'#333333',line:'#444444'}));
jest.mock('@expo/vector-icons', () => ({Ionicons:'Ionicons',MaterialCommunityIcons:'MaterialCommunityIcons'}));
jest.mock('../src/features/help/helpTheme', () => ({useHelpReducedMotion:()=>false,useHelpTheme:()=>mockUseHelpTheme()}));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({HelpIcon:'HelpIcon',HelpAvatar:'HelpAvatar'}));
jest.mock('../src/features/help/components/HelpMedia', () => ({HelpAudio:'HelpAudio',HelpImage:'HelpImage'}));
import { HelpMessageBubble } from '../src/features/help/components/HelpMessageBubble';
import { HelpPendingMessage } from '../src/features/help/components/HelpPendingMessage';
import {HelpFileAttachment} from '../src/features/help/components/HelpFileAttachment';
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
  test.each(['web','android'] as const)('question exchange shows one full-width prompt/answer with original controls on %s',async platform=>{
    jest.replaceProperty(Platform,'OS',platform);
    const message={...props.message,text:'Какая ОС?\nОтвет: Windows 11',createdAt:new Date(clock).toISOString(),replyTo:{id:42,text:'Какая ОС?'},replyToId:42};
    props={...props,message,questionExchange:{message,answers:[{questionId:'os',question:'Какая ОС?',answer:'Windows 11',skipped:false}]},selected:true,highlighted:true};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    expect(node('help-message-frame').props.style).toMatchObject({width:'100%',maxWidth:'100%'});
    expect(node('help-message-1').props.style).toMatchObject({justifyContent:'flex-start',marginLeft:0,marginRight:0});
    expect(node('help-message-bubble').props.style.backgroundColor).toBe('transparent');
    expect(node('help-question-answer-os').props.children).toBe('Windows 11');
    expect(screen.root.findAll(n=>n.type===Text&&n.props.children==='Ваш ответ')).toHaveLength(0);
    expect(node('help-question-answer-os').props.numberOfLines).toBeUndefined();
    expect(screen.root.findAll(n=>n.props.testID==='help-question-exchange-toggle')).toHaveLength(0);
    expect(screen.root.findAll(n=>n.props.testID==='help-message-text')).toHaveLength(0);
    expect(screen.root.findAll(n=>n.props.testID==='help-message-avatar-slot')).toHaveLength(0);
    expect(screen.root.findAll(n=>n.type===Text&&n.props.children==='Какая ОС?')).toHaveLength(1);
    expect(node('help-message-outline')).toBeTruthy();
    expect(node('help-message-time')).toBeTruthy();
    expect(node('help-message-receipt')).toBeTruthy();
    const edit=screen.root.findByProps({label:'Редактировать'});
    await act(async()=>edit.props.onPress());expect(props.onEdit).toHaveBeenCalledTimes(1);
    const forward=screen.root.findAll(n=>n.props.accessibilityLabel==='Переслать'&&n.props.onPress)[0];
    await act(async()=>forward.props.onPress());expect(props.onForward).toHaveBeenCalledTimes(1);
  });
  test('grouped exchange retains files/reactions and immediately updates the visible answer',async()=>{
    const file={id:'file',kind:'FILE',name:'report.csv',mimeType:'text/csv',size:100,url:'/file'};
    const message={...props.message,text:'Какая ОС?\nОтвет: См. вложение',attachments:[file],reactions:[{emoji:'👍',count:1,mine:true,userIds:[7]}]};
    props={...props,message,questionExchange:{message,answers:[{questionId:'os',question:'Какая ОС?',answer:'См. вложение',skipped:false}]}};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    expect(screen.root.findByType(HelpFileAttachment).props.file).toBe(file);
    const reaction=screen.root.findAll(n=>n.props.accessibilityLabel==='👍, 1, ваша реакция'&&n.props.onPress)[0];
    await act(async()=>reaction.props.onPress());expect(props.onReaction).toHaveBeenCalledWith('👍');
    props={...props,questionExchange:{...props.questionExchange,answers:[{questionId:'os',question:'Какая ОС?',answer:'',skipped:true}]}};
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(node('help-question-answer-os').props.children).toBe('Вопрос пропущен');
    expect(screen.root.findAll(n=>n.props.testID==='help-question-history-toggle')).toHaveLength(0);
  });
  test.each(['queued','sending','failed'] as const)('grouped pending answer retains %s status and retry action',async delivery=>{
    const message={...props.message,text:'Какая ОС?\nОтвет: Windows 11'};
    props={...props,message,delivery,onRetry:jest.fn(),questionExchange:{message,answers:[{questionId:'os',question:'Какая ОС?',answer:'Windows 11',skipped:false}]}};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    expect(node('help-question-answer-os').props.children).toBe('Windows 11');
    expect(node('help-message-pending-clock').props.name).toBe(delivery==='failed'?'alert-circle-outline':'time-outline');
    expect(screen.root.findAll(n=>n.props.testID==='help-message-receipt')).toHaveLength(0);
    if(delivery==='failed'){
      const retry=screen.root.findAll(n=>n.props.accessibilityLabel==='Не удалось отправить. Отправить снова'&&n.props.onPress)[0];
      await act(async()=>retry.props.onPress());expect(props.onRetry).toHaveBeenCalledTimes(1);
    }
  });
  test('web text is selectable and mouse selection is not owned by the reply swipe responder',async()=>{
    const previous=Platform.OS;
    try{
      Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
      await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
      expect(node('help-message-text').props.selectable).toBe(true);
      expect(node('help-message-text').props.children).toBe('Проверка');
      expect(node('help-message-1').props.onMoveShouldSetPanResponderCapture).toBeUndefined();
      expect(node('help-message-bubble').props.onLongPress).toBeUndefined();
      const preventDefault=jest.fn();node('help-message-bubble').props.onContextMenu({preventDefault});
      expect(props.onMenu).toHaveBeenCalledTimes(1);
    }finally{Object.defineProperty(Platform,'OS',{configurable:true,value:previous});}
  });
  test('web message menu follows the pointer, measures its height and clamps all viewport edges',async()=>{
    jest.replaceProperty(Platform,'OS','web');const oldWindow=Dimensions.get('window');
    Dimensions.set({window:{...oldWindow,width:1280,height:800}});
    try{
      await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
      expect(node('help-message-bubble').props.tabIndex).toBe(0);
      await act(async()=>node('help-message-bubble').props.onContextMenu({clientX:1270,clientY:795,preventDefault:jest.fn()}));
      props={...props,selected:true};await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
      expect(node('help-message-menu').props.style).toMatchObject({left:948,top:692,marginTop:0});
      await act(async()=>node('help-message-menu').props.onLayout({nativeEvent:{layout:{height:132}}}));
      expect(node('help-message-menu').props.style.top).toBe(656);
      props={...props,selected:false};await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
      await act(async()=>node('help-message-bubble').props.onKeyDown({key:'F10',shiftKey:true,preventDefault:jest.fn(),currentTarget:{getBoundingClientRect:()=>({left:100,top:40,bottom:120,width:200})}}));
      props={...props,selected:true};await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
      expect(node('help-message-menu').props.style).toMatchObject({left:132,top:112});
    }finally{await act(async()=>Dimensions.set({window:oldWindow}));}
  });
  test('desktop text width and timestamp expansion share the same bound while mobile and media retain their bounds',async()=>{
    jest.replaceProperty(Platform,'OS','web');const oldWindow=Dimensions.get('window');
    Dimensions.set({window:{...oldWindow,width:1440,height:900}});
    try{
      await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
      await act(async()=>{
        node('help-message-1').props.onLayout({nativeEvent:{layout:{width:800}}});
        node('help-text-layout').props.onLayout({nativeEvent:{layout:{width:600}}});
        node('help-message-text').props.onTextLayout({nativeEvent:{lines:[{x:0,width:620}]}});
        node('help-message-time').props.onLayout({nativeEvent:{layout:{width:70}}});
      });
      expect(node('help-message-frame').props.style).toMatchObject({maxWidth:'80%',minWidth:640});
      props={...props,message:{...props.message,attachments:[{id:'portrait',kind:'IMAGE',name:'Screenshot',width:1080,height:2400}]}};
      await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
      expect(node('help-message-frame').props.style).toMatchObject({maxWidth:'86%',width:640});
      props={...props,message:{...props.message,attachments:[]}};
      await act(async()=>{Dimensions.set({window:{...oldWindow,width:390,height:844}});screen.update(React.createElement(HelpMessageBubble,props));});
      expect(node('help-message-frame').props.style.maxWidth).toBe('86%');
    }finally{await act(async()=>Dimensions.set({window:oldWindow}));}
  });
  test('file-only messages place one timestamp in the last file metadata row',async()=>{
    props.message={...props.message,text:'',attachments:[
      {id:'excel',kind:'FILE',name:'Склад.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:2048,url:'/sheet'},
      {id:'word',kind:'FILE',name:'Письмо.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:1024,url:'/document'},
    ]};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    const files=screen.root.findAllByType(HelpFileAttachment);
    expect(files).toHaveLength(2);expect(files[0].props.trailing).toBeUndefined();expect(files[1].props.trailing.props.testID).toBe('help-message-time');
    const content=node('help-message-content');
    expect(content.children.filter(child=>typeof child!=='string'&&child.props.testID==='help-message-time')).toHaveLength(0);
  });
  test.each(['sending','failed'])('file delivery %s keeps its delivery action outside the download button',async delivery=>{
    props.delivery=delivery;props.onRetry=jest.fn();
    props.message={...props.message,text:'',attachments:[{id:'sheet',kind:'FILE',name:'Report.xlsx',mimeType:'application/octet-stream',size:2048,url:'/sheet'}]};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    expect(screen.root.findByType(HelpFileAttachment).props.trailing).toBeUndefined();
    const stamp=node('help-message-time');
    const retry=stamp.findAll(n=>typeof n.props.onPress==='function'&&n.props.accessibilityRole==='button')[0];
    expect(retry.props.disabled).toBe(delivery!=='failed');
    if(delivery==='failed'){await act(async()=>retry.props.onPress());expect(props.onRetry).toHaveBeenCalledTimes(1);}
    for(let parent=retry.parent;parent;parent=parent.parent)expect(parent.type).not.toBe(HelpFileAttachment);
  });
  test('IT join is a minimal system line with the actual specialist avatar',async()=>{
    props.message={...props.message,kind:'SYSTEM',itStatusChange:'JOINED',authorId:9,author:{id:9,name:'Иванов Иван',avatarUrl:'/avatar9.jpg'},text:'Иванов Иван подключился'};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    const status=node('help-it-status-JOINED');
    expect(StyleSheet.flatten(status.props.style).backgroundColor).toBeUndefined();
    expect(screen.root.findByType('HelpAvatar' as any).props).toMatchObject({id:9,name:'Иванов Иван',uri:'/avatar9.jpg',size:24});
    expect(screen.root.findAllByProps({testID:'help-message-bubble'})).toHaveLength(0);
  });
  test('messages no longer display the Helped action even for a solution',async()=>{
    props.solution=true;
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Помогло')).toBe(false);
  });
  test('IT leave keeps the recorded surname-first name and the real avatar',async()=>{
    props.message={...props.message,kind:'SYSTEM',itStatusChange:'LEFT',authorId:9,author:{id:9,name:'Иванов Иван',avatarUrl:'/avatar9.jpg'},text:'Иванов Иван отключился'};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageBubble,props));});
    expect(node('help-it-status-LEFT')).toBeTruthy();
    expect(screen.root.findByType('HelpAvatar' as any).props).toMatchObject({id:9,name:'Иванов Иван',uri:'/avatar9.jpg'});
    expect(screen.root.findAllByType(Text).some(node=>node.props.children==='Иванов Иван отключился')).toBe(true);
  });
  test('photo outbox reserves the accepted album geometry before upload acknowledgement',async()=>{
    const files=[{uri:'file:///one.jpg',name:'one.jpg',mimeType:'image/jpeg',width:900,height:1600},{uri:'file:///two.jpg',name:'two.jpg',mimeType:'image/jpeg',width:1600,height:900}];
    const item:any={key:'media',ticketId:12,create:false,input:{text:'Подпись',clientMessageId:'media'},localFiles:files,createdAt:Date.now(),status:'sending'};
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpPendingMessage,{item,onRetry:jest.fn()}));});
    const pendingAlbum=StyleSheet.flatten(node('help-image-album').props.style);
    expect(pendingAlbum.height).toBeGreaterThan(64);
    const pendingContent=StyleSheet.flatten(node('help-message-content').props.style);
    expect(node('help-message-text').props.children).toBe('Подпись');
    props.message={...props.message,text:'Подпись',attachments:files.map((file,index)=>({id:`accepted-${index}`,kind:'IMAGE',name:file.name,mimeType:file.mimeType,size:0,url:file.uri,width:file.width,height:file.height})),reactions:[]};
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(StyleSheet.flatten(node('help-image-album').props.style)).toEqual(pendingAlbum);
    expect(StyleSheet.flatten(node('help-message-content').props.style)).toEqual(pendingContent);
  });
  test('voice outbox uses the same waveform and timestamp slot as its accepted receipt',async()=>{
    const item:any={key:'voice',ticketId:12,create:false,input:{text:''},localFiles:[{uri:'file:///voice.m4a',name:'voice.m4a',mimeType:'audio/mp4',size:4096}],createdAt:Date.now(),status:'sending'};
    const retry=jest.fn();
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpPendingMessage,{item,onRetry:retry}));});
    let player=screen.root.findByType('HelpAudio' as any);
    const pendingContent=StyleSheet.flatten(node('help-message-content').props.style);
    expect(player.props.messageId).toBeUndefined();
    expect(player.props.captionRight).toBeTruthy();
    expect(screen.root.findAll(n=>n.props.testID==='help-message-text')).toHaveLength(0);
    let stampScreen:TestRenderer.ReactTestRenderer;
    await act(async()=>{stampScreen=TestRenderer.create(player.props.captionRight);});
    expect(stampScreen!.root.findAll(n=>n.props.testID==='help-message-pending-clock').length).toBeGreaterThan(0);
    await act(async()=>screen.update(React.createElement(HelpPendingMessage,{item:{...item,status:'failed'},onRetry:retry})));
    player=screen.root.findByType('HelpAudio' as any);
    await act(async()=>stampScreen!.update(player.props.captionRight));
    const retryButton=stampScreen!.root.findAll(n=>n.props.accessibilityLabel==='Не удалось отправить. Отправить снова'&&typeof n.props.onPress==='function')[0];
    await act(async()=>retryButton.props.onPress());expect(retry).toHaveBeenCalledTimes(1);
    await act(async()=>stampScreen!.unmount());
    props.message={...props.message,text:'',attachments:[{id:'voice',kind:'AUDIO',url:'https://voice',name:'voice.m4a',mimeType:'audio/mp4',size:4096}],reactions:[]};
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    player=screen.root.findByType('HelpAudio' as any);
    expect(player.props.captionRight).toBeTruthy();
    expect(StyleSheet.flatten(node('help-message-content').props.style)).toEqual(pendingContent);
  });
  test('reaction picker offers exactly the five current reactions',async()=>{
    props.selected=true;await render();
    const labels=[...new Set(screen.root.findAll(n=>typeof n.props.onPress==='function'&&String(n.props.accessibilityLabel??'').startsWith('Реакция ')).map(n=>n.props.accessibilityLabel))];
    expect(labels).toEqual(['Реакция ❤️','Реакция 👍','Реакция 👎','Реакция 🤝','Реакция 🔥']);
  });
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
  test.each(['web','android'] as const)('photo caption uses the measured chat column on %s, not the portrait width',async platform=>{
    jest.replaceProperty(Platform,'OS',platform);
    props.message={...props.message,text:'Длинное описание фотографии. '.repeat(25),attachments:[{id:'portrait',kind:'IMAGE',name:'Screenshot',width:1080,height:2400}]};
    await render();
    for(const rowWidth of [876,366,296,720]){
      await act(async()=>node('help-message-1').props.onLayout({nativeEvent:{layout:{width:rowWidth}}}));
      const frame=StyleSheet.flatten(node('help-message-frame').props.style),album=StyleSheet.flatten(node('help-image-album').props.style);
      expect(frame.width).toBeCloseTo(Math.min(640,rowWidth*.86));
      expect(frame.width).toBeGreaterThan(album.width);
      expect(album.height).toBeGreaterThan(350);
      expect(album.width/album.height).toBeCloseTo(1080/2400);
      expect(album.width).toBeLessThanOrEqual(frame.width);
      expect(node('help-message-content').props.style.width).toBeUndefined();
    }
  });
  test('incoming photo caption reserves the avatar and image-only keeps its natural frame',async()=>{
    props.message={...props.message,authorId:9,text:'Подробная подпись '.repeat(20),attachments:[{id:'portrait',kind:'IMAGE',name:'Screenshot',width:1080,height:2400}]};
    await render();await act(async()=>node('help-message-1').props.onLayout({nativeEvent:{layout:{width:600}}}));
    expect(node('help-message-frame').props.style.width).toBe(564);
    props={...props,message:{...props.message,text:''}};
    await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(node('help-message-frame').props.style.width).toBeCloseTo(node('help-image-album').props.style.width);
    expect(node('help-message-time').props.style.position).toBe('absolute');
  });
  test('short outgoing text keeps its first-paint timestamp through Android fractional row widths', async () => {
    props.message={...props.message,text:'132'};
    await render();
    const firstStamp=StyleSheet.flatten(node('help-message-time').props.style);
    expect(firstStamp).toMatchObject({position:'absolute',bottom:5,right:11});
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
