import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
let mockReduced=true;
const mockApi={audioTranscript:jest.fn()};
jest.mock('../src/features/help/helpApi',()=>({createHelpApi:jest.fn(()=>mockApi)}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced,useHelpTheme:()=>({text:'#111',muted:'#888',line:'#ddd',accentText:'#26f'})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},cancelAnimation:jest.fn(),Easing:{cubic:'cubic',out:(x:any)=>x},
  useSharedValue:(value:number)=>require('react').useRef({value}).current,
  useAnimatedStyle:(fn:any)=>({get height(){return fn().height;}}),withTiming:jest.fn((value:number)=>value),
}));
import {HelpAudioTranscriptScope} from '../src/features/help/helpAudioTranscript';
import {HelpAudioTranscriptButton,HelpAudioTranscriptText,useAudioTranscriptPresentation} from '../src/features/help/components/HelpAudioTranscript';
import {createHelpApi} from '../src/features/help/helpApi';
import {withTiming} from 'react-native-reanimated';

function Voice({id='audio-1'}:{id?:string}){const value=useAudioTranscriptPresentation(id,true);return React.createElement(React.Fragment,null,React.createElement(HelpAudioTranscriptButton,{value}),React.createElement(HelpAudioTranscriptText,{value}));}
let tree:TestRenderer.ReactTestRenderer;
const render=(userId=1,id='audio-1')=>React.createElement(HelpAudioTranscriptScope,{userId,ticketId:7,children:React.createElement(Voice,{id})});
const button=()=>tree.root.findByProps({testID:'help-audio-transcript-button'});
const click=()=>act(async()=>{button().props.onPress();});
const result={attachmentId:'audio-1',status:'transcribed',text:'Заказ 123'};
beforeEach(()=>{jest.clearAllMocks();mockReduced=true;mockApi.audioTranscript.mockReset();});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.useRealTimers();});

test('history mount is idle and a saved transcript opens without a second speech request',async()=>{
  mockApi.audioTranscript.mockResolvedValue(result);
  await act(async()=>{tree=TestRenderer.create(render());});expect(mockApi.audioTranscript).not.toHaveBeenCalled();
  await click();expect(mockApi.audioTranscript).toHaveBeenCalledWith('audio-1',false,expect.any(AbortSignal));
  expect(tree.root.findByProps({testID:'help-audio-transcript-text'}).props.children).toBe('Заказ 123');
  await click();expect(button().props.accessibilityState.expanded).toBe(false);
  await click();expect(button().props.accessibilityState.expanded).toBe(true);expect(mockApi.audioTranscript).toHaveBeenCalledTimes(1);
});
test('missing transcript is requested once; rapid double click cannot duplicate it',async()=>{
  let complete!:(v:unknown)=>void;
  mockApi.audioTranscript.mockResolvedValueOnce({attachmentId:'audio-1',status:'not_started'}).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  await act(async()=>{tree=TestRenderer.create(render());});
  await act(async()=>{const press=button().props.onPress;press();press();});
  expect(mockApi.audioTranscript.mock.calls.map(call=>call[1])).toEqual([false,true]);
  expect(button().props.accessibilityState.busy).toBe(true);expect(tree.root.findAllByProps({testID:'help-audio-transcript-border'}).length).toBeGreaterThan(0);
  await act(async()=>complete(result));expect(button().props.accessibilityState.busy).toBe(false);
});
test('pending work is polled using GET and never restarted',async()=>{
  jest.useFakeTimers();mockApi.audioTranscript.mockResolvedValueOnce({attachmentId:'audio-1',status:'pending'}).mockResolvedValueOnce(result);
  await act(async()=>{tree=TestRenderer.create(render());});await click();
  await act(async()=>jest.advanceTimersByTime(1000));
  expect(mockApi.audioTranscript.mock.calls.map(call=>call[1])).toEqual([false,false]);expect(button().props.accessibilityState.expanded).toBe(true);
});
test('failure stops frame animation without false text and permits retry',async()=>{
  mockApi.audioTranscript.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(result);
  await act(async()=>{tree=TestRenderer.create(render());});await click();
  expect(button().props.accessibilityLabel).toBe('Повторить распознавание');expect(button().props.accessibilityState.busy).toBe(false);
  expect(tree.root.findAllByProps({testID:'help-audio-transcript-border'})).toHaveLength(0);expect(tree.root.findAllByProps({testID:'help-audio-transcript-text'})).toHaveLength(0);
  await click();expect(button().props.accessibilityState.expanded).toBe(true);
});
test('account change aborts old request and never displays its late text',async()=>{
  let complete!:(v:unknown)=>void;mockApi.audioTranscript.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  await act(async()=>{tree=TestRenderer.create(render());});await click();const signal=mockApi.audioTranscript.mock.calls[0][2];
  await act(async()=>tree.update(render(2)));expect(signal.aborted).toBe(true);expect(createHelpApi).toHaveBeenLastCalledWith(2);
  await act(async()=>complete(result));expect(tree.root.findAllByProps({testID:'help-audio-transcript-text'})).toHaveLength(0);
});
test('recycled attachment ignores previous completion',async()=>{
  let complete!:(v:unknown)=>void;mockApi.audioTranscript.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
  await act(async()=>{tree=TestRenderer.create(render());});await click();
  await act(async()=>tree.update(render(1,'audio-2')));await act(async()=>complete(result));
  expect(tree.root.findAllByProps({testID:'help-audio-transcript-text'})).toHaveLength(0);expect(button().props.accessibilityState.busy).toBe(false);
});
test('text uses measured expansion and collapse with reduced motion respected',async()=>{
  mockApi.audioTranscript.mockResolvedValue(result);await act(async()=>{tree=TestRenderer.create(render());});await click();
  const measure=()=>tree.root.findByProps({testID:'help-audio-transcript-content'}).props.onLayout({nativeEvent:{layout:{height:72}}});
  await act(async()=>measure());const height=()=>StyleSheet.flatten(tree.root.findByProps({testID:'help-audio-transcript-reveal'}).props.style).height;
  expect(height()).toBe(72);expect(withTiming).not.toHaveBeenCalled();
  mockReduced=false;await click();expect(height()).toBe(0);expect(withTiming).toHaveBeenLastCalledWith(0,expect.objectContaining({duration:220}));
  await click();expect(height()).toBe(72);
});
