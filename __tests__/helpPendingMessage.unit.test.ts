jest.mock('react-native-reanimated',()=>require('./mocks/reanimated'));
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {PanResponder} from 'react-native';

const mockPlayer={replace:jest.fn(),play:jest.fn(),pause:jest.fn(),seekTo:jest.fn()};
let mockBubbleProps:any;
jest.mock('expo-audio',()=>({useAudioPlayer:()=>mockPlayer,useAudioPlayerStatus:()=>({playing:true,currentTime:0,duration:10,playbackRate:1,isLoaded:true})}));
jest.mock('expo-image',()=>({Image:'CachedImage'}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file://cache/'}));
jest.mock('expo-sharing',()=>({}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({muted:'#999999',accent:'#3388ff',accentText:'#68B0FF',elevated:'#333333'}),useHelpReducedMotion:()=>true}));
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpIcon:'HelpIcon'}));
jest.mock('../src/features/help/components/HelpMessageQuote',()=>({HelpMessageQuote:'HelpMessageQuote'}));
jest.mock('../src/features/help/components/HelpInlineMessageStamp',()=>({HELP_MESSAGE_TEXT_STYLE:{},HelpInlineMessageStamp:'HelpInlineMessageStamp',HelpMessageStampReserve:'HelpMessageStampReserve'}));
// Keep the real standalone audio lifecycle under the pending presentation.
jest.mock('../src/features/help/components/HelpMessageBubble',()=>({HelpMessageBubble:(props:any)=>{
  mockBubbleProps=props;
  return require('react').createElement(require('../src/features/help/components/HelpMedia').HelpAudio,{attachment:props.message.attachments[0],resolve:props.resolve,onError:props.onError,uploading:props.delivery!=='failed'});
}}));
import {HelpPendingMessage} from '../src/features/help/components/HelpPendingMessage';
import type {HelpPending} from '../src/features/help/helpDurableTypes';

let screen:TestRenderer.ReactTestRenderer|undefined;
beforeEach(()=>{
  jest.clearAllMocks();
  jest.spyOn(PanResponder,'create').mockImplementation(config=>({panHandlers:config} as any));
  jest.spyOn(global,'requestAnimationFrame').mockReturnValue(1);
  jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{});
});
afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.restoreAllMocks();});

test('failed voice survives unrelated pending renders but a real account resolver change releases its player',async()=>{
  let item:HelpPending={key:'failed-voice',ticketId:7,create:false,createdAt:1,status:'failed',input:{text:'',clientMessageId:'failed-voice'},localFiles:[{uri:'file://voice.m4a',name:'voice.m4a',mimeType:'audio/mp4',durationMs:10000}]};
  let retry=jest.fn(),quote=jest.fn();
  let resolver=jest.fn(async()=>({uri:'file://remote.m4a'}));
  const tree=()=>React.createElement(HelpPendingMessage,{item,onRetry:retry,onQuote:quote,resolve:resolver});
  await act(async()=>{screen=TestRenderer.create(tree());});
  const first=mockBubbleProps;
  const play=screen!.root.findAll(node=>(node.props.label==='Воспроизвести голосовое сообщение'||node.props.accessibilityLabel==='Воспроизвести голосовое сообщение')&&typeof node.props.onPress==='function')[0];
  await act(async()=>play.props.onPress());
  expect(mockPlayer.replace).toHaveBeenCalledWith({uri:'file://voice.m4a'});
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  mockPlayer.replace.mockClear();mockPlayer.pause.mockClear();
  retry=jest.fn();quote=jest.fn();
  await act(async()=>screen!.update(tree()));
  expect(mockBubbleProps.message).toBe(first.message);
  expect(mockBubbleProps.resolve).toBe(first.resolve);
  expect(mockPlayer.pause).not.toHaveBeenCalled();
  expect(mockPlayer.replace).not.toHaveBeenCalled();
  first.onRetry();first.onQuote(42);
  expect(retry).toHaveBeenCalledTimes(1);expect(quote).toHaveBeenCalledWith(42);
  resolver=jest.fn(async()=>({uri:'file://other-account.m4a'}));
  await act(async()=>screen!.update(tree()));
  expect(mockBubbleProps.resolve).not.toBe(first.resolve);
  expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  expect(mockPlayer.replace).toHaveBeenCalledWith(null);
  item={...item,status:'queued',localFiles:[{...item.localFiles![0],uri:'file://replacement.m4a'}]};
  await act(async()=>screen!.update(tree()));
  expect(mockBubbleProps.message).not.toBe(first.message);
  expect(mockBubbleProps.message.attachments[0].localUri).toBe('file://replacement.m4a');
  expect(mockBubbleProps.delivery).toBe('queued');
});
