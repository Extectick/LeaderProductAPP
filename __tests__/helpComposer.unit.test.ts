import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PanResponder, Platform } from 'react-native';

const mockRecorder = { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), getStatus: jest.fn(() => ({durationMillis:1000})), uri: 'file://voice.m4a' };
const mockPermission = jest.fn();
const mockAudioMode = jest.fn();
const mockPicker = jest.fn();
jest.mock('expo-audio', () => ({RecordingPresets:{HIGH_QUALITY:{}},requestRecordingPermissionsAsync:(...args:any[])=>mockPermission(...args),setAudioModeAsync:(...args:any[])=>mockAudioMode(...args),useAudioRecorder:()=>mockRecorder,useAudioRecorderState:()=>({isRecording:false,durationMillis:0})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:(...args:any[])=>mockPicker(...args)}));
jest.mock('expo-linear-gradient', () => ({LinearGradient:'LinearGradient'}));
jest.mock('@expo/vector-icons', () => ({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme', () => ({useHelpTheme:()=>({surface:'#222222',text:'#ffffff',muted:'#999999',accent:'#3388ff',elevated:'#333333',line:'#444444'}),useHelpReducedMotion:()=>true}));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({HelpIcon:'HelpIcon'}));
import { HelpComposer } from '../src/features/help/components/HelpComposer';

describe('Help composer recorder lifecycle', () => {
  let screen:TestRenderer.ReactTestRenderer|undefined;
  const originalPlatform=Platform.OS;
  let props:any;
  beforeEach(()=>{
    jest.spyOn(PanResponder,'create').mockImplementation(config=>({panHandlers:config} as any));
    mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
    mockRecorder.record.mockReset();mockRecorder.stop.mockReset().mockResolvedValue(undefined);
    mockPermission.mockReset().mockResolvedValue({granted:true});
    mockAudioMode.mockReset().mockResolvedValue(undefined);mockPicker.mockReset();
    props={value:'',onChange:jest.fn(),files:[],onFiles:jest.fn(),onSend:jest.fn().mockResolvedValue(undefined),busy:false,mode:'message',rating:0,onRating:jest.fn(),onCancelMode:jest.fn(),onCancelQuote:jest.fn(),error:jest.fn(),onResize:jest.fn()};
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});jest.restoreAllMocks();});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpComposer,props));});}
  function mic(){return screen!.root.findAll(n=>typeof n.props.onPanResponderGrant==='function')[0];}
  function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
  test('release while web preparation is pending releases acquired microphone without sending',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    const preparation=deferred<void>();mockRecorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    await act(async()=>mic().props.onPanResponderRelease());
    await act(async()=>preparation.resolve());
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(props.onSend).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();
  });
  test('unmount during native preparation stops prepared recorder without starting it',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
    const preparation=deferred<void>();mockRecorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>preparation.resolve());
    expect(mockRecorder.record).not.toHaveBeenCalled();expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(props.onFiles).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();
  });
  test('lock acquired during preparation survives release and provides explicit stop controls',async()=>{
    const preparation=deferred<void>();mockRecorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>mic().props.onPanResponderMove(null,{dy:-80,dx:0}));
    await act(async()=>mic().props.onPanResponderRelease());
    await act(async()=>preparation.resolve());
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);expect(mockRecorder.stop).not.toHaveBeenCalled();
    const stop=screen!.root.findAll(n=>n.props.label==='Остановить и сохранить запись в черновик')[0];
    await act(async()=>stop.props.onPress());
    expect(props.onFiles).toHaveBeenCalledWith([expect.objectContaining({uri:'file://voice.m4a'})]);
    expect(props.onSend).not.toHaveBeenCalled();
  });
  test('cancel before permission resolves never prepares or records',async()=>{
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>mic().props.onPanResponderMove(null,{dy:0,dx:-100}));
    await act(async()=>permission.resolve({granted:true}));
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();expect(mockRecorder.record).not.toHaveBeenCalled();
  });
  test('late permission denial after unmount does not show an error in another chat',async()=>{
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>permission.resolve({granted:false}));expect(props.error).not.toHaveBeenCalled();
  });
  test('late picker rejection after unmount does not show an error in another chat',async()=>{
    const picker=deferred<never>();mockPicker.mockReturnValue(picker.promise);await render();
    const attach=screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0];
    await act(async()=>attach.props.onPress());await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>picker.reject(new Error('cancelled by OS')));expect(props.error).not.toHaveBeenCalled();
  });
});
