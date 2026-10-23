import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, PanResponder } from 'react-native';
jest.mock('@expo/vector-icons', () => ({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme', () => ({useHelpReducedMotion:()=>false,useHelpTheme:()=>({surface:'#222222',text:'#ffffff',muted:'#999999',accent:'#3388ff',accentText:'#88bbff',outgoing:'#334455',elevated:'#333333',line:'#444444'})}));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({HelpIcon:'HelpIcon',HelpAvatar:'HelpAvatar'}));
jest.mock('../src/features/help/components/HelpMedia', () => ({HelpAudio:'HelpAudio',HelpImage:'HelpImage'}));
import { HelpMessageBubble } from '../src/features/help/components/HelpMessageBubble';

describe('Help message native layout and reply gestures', () => {
  let screen: TestRenderer.ReactTestRenderer;
  let props: any;
  beforeEach(() => {
    jest.spyOn(PanResponder,'create').mockImplementation(config => ({panHandlers:config} as any));
    jest.spyOn(Animated,'spring').mockReturnValue({start:jest.fn(),stop:jest.fn(),reset:jest.fn()});
    props = {message:{id:1,authorId:7,kind:'TEXT',text:'Проверка',createdAt:'2026-10-23T10:00:00Z',attachments:[],reactions:[]},userId:7,open:true,canInteract:true,onReply:jest.fn(),onMenu:jest.fn()};
  });
  afterEach(async () => { if(screen) await act(async()=>screen.unmount()); jest.restoreAllMocks(); });
  const node = (id:string) => screen.root.findAll(n=>n.props.testID===id)[0];
  const g = (dx:number,dy=0) => ({dx,dy,numberActiveTouches:1});
  async function render() { await act(async()=>{ screen=TestRenderer.create(React.createElement(HelpMessageBubble,props)); }); }
  test('rightward diagonal swipe replies once; vertical and leftward starts stay rejected', async () => {
    await render(); const pan=node('help-message-1').props;
    pan.onStartShouldSetPanResponderCapture();
    expect(pan.onMoveShouldSetPanResponderCapture(null,g(60,18))).toBe(true);
    await act(async()=>{pan.onPanResponderGrant(null,g(60,18));pan.onPanResponderMove(null,g(70,20));pan.onPanResponderRelease(null,g(70,20));});
    expect(props.onReply).toHaveBeenCalledTimes(1);
    for(const movement of [g(-40),g(2,40)]) {
      pan.onStartShouldSetPanResponderCapture();
      expect(pan.onMoveShouldSetPanResponderCapture(null,movement)).toBe(false);
      expect(pan.onMoveShouldSetPanResponderCapture(null,g(70))).toBe(false);
    }
  });
  test('termination or a short swipe cannot reply; next gesture starts cleanly', async () => {
    await render(); const pan=node('help-message-1').props;
    pan.onStartShouldSetPanResponderCapture();
    await act(async()=>{pan.onPanResponderMove(null,g(30));pan.onPanResponderRelease(null,g(30));pan.onPanResponderTerminate();});
    expect(props.onReply).not.toHaveBeenCalled();
    pan.onStartShouldSetPanResponderCapture();
    expect(pan.onMoveShouldSetPanResponderCapture(null,g(60))).toBe(true);
  });
  test('audio seek and closed/nonparticipant messages never get captured', async () => {
    props.message.attachments=[{id:'voice',kind:'AUDIO',name:'voice.m4a'}]; await render();
    const pan=node('help-message-1').props; pan.onStartShouldSetPanResponderCapture();
    node('help-audio-touch').props.onTouchStart();
    expect(pan.onMoveShouldSetPanResponderCapture(null,g(80))).toBe(false);
    props.open=false; await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    pan.onStartShouldSetPanResponderCapture(); expect(pan.onMoveShouldSetPanResponderCapture(null,g(80))).toBe(false);
    props.open=true;props.canInteract=false;await act(async()=>screen.update(React.createElement(HelpMessageBubble,props)));
    expect(pan.onMoveShouldSetPanResponderCapture(null,g(80))).toBe(false);
  });
  test('reversing a rightward swipe cancels reply even when release remains past threshold', async () => {
    await render(); const pan=node('help-message-1').props;
    pan.onStartShouldSetPanResponderCapture();
    await act(async()=>{pan.onPanResponderGrant(null,g(20));pan.onPanResponderMove(null,g(100));pan.onPanResponderMove(null,g(65));pan.onPanResponderRelease(null,g(65));});
    expect(props.onReply).not.toHaveBeenCalled();
  });
  test('stamp shares last line only when measured space exists, including edited text', async () => {
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
  test('photo-only timestamp overlays image; a single photo preserves aspect ratio', async () => {
    props.message={...props.message,text:'',attachments:[{id:'photo',kind:'IMAGE',name:'Photo'}]};
    await render();
    const image=screen.root.findByType('HelpImage' as any);
    expect(image.props.resizeMode).toBe('contain');
    expect(node('help-message-time').props.style.backgroundColor).toBe('#00000088');
    expect(node('help-message-time').props.style.position).toBe('absolute');
    expect(node('help-message-time').parent!.props.pointerEvents).toBe('none');
    await act(async()=>image.props.onAspectRatio(2));
    expect(image.parent!.props.style.height).toBeLessThan(160);
  });
  test('audio-only timestamp is part of audio caption, not a separate footer', async () => {
    props.message={...props.message,text:'',attachments:[{id:'voice',kind:'AUDIO',name:'Voice'}]};
    await render();
    const audio=screen.root.findByType('HelpAudio' as any);
    expect(audio.props.captionRight.props.testID).toBe('help-message-time');
    expect(screen.root.findAll(n=>n.props.testID==='help-message-time')).toHaveLength(0);
  });
});
