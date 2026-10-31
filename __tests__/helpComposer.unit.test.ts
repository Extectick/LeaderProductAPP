import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, AppState, Image, PanResponder, Platform, StyleSheet, TextInput } from 'react-native';

const mockRecorder = { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), getStatus: jest.fn(() => ({durationMillis:1000})), uri: 'file://voice.m4a' };
const mockPermission = jest.fn();
const mockGetPermission = jest.fn();
const mockAudioMode = jest.fn();
const mockPicker = jest.fn();
const mockPhotoPicker = jest.fn();
const mockStopPlayback=jest.fn();
let mockReducedMotion = true;
jest.mock('expo-audio', () => ({RecordingPresets:{HIGH_QUALITY:{}},getRecordingPermissionsAsync:(...args:any[])=>mockGetPermission(...args),requestRecordingPermissionsAsync:(...args:any[])=>mockPermission(...args),setAudioModeAsync:(...args:any[])=>mockAudioMode(...args),useAudioRecorder:()=>mockRecorder,useAudioRecorderState:()=>({isRecording:false,durationMillis:0})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:(...args:any[])=>mockPicker(...args)}));
jest.mock('expo-image-picker', () => ({launchImageLibraryAsync:(...args:any[])=>mockPhotoPicker(...args)}));
jest.mock('../src/features/help/HelpAudioPlayback',()=>({useHelpAudioCommands:()=>({stop:mockStopPlayback})}));
jest.mock('expo-linear-gradient', () => ({LinearGradient:'LinearGradient'}));
jest.mock('@expo/vector-icons', () => ({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme', () => ({useHelpTheme:()=>({surface:'#222222',text:'#ffffff',muted:'#999999',accent:'#3388ff',elevated:'#333333',line:'#444444'}),useHelpReducedMotion:()=>mockReducedMotion}));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({HelpIcon:'HelpIcon',HelpSheet:'HelpSheet'}));
jest.mock('../src/features/help/components/HelpMedia', () => ({HelpImage:'HelpImage'}));
jest.mock('../src/features/help/components/HelpPhotoPicker', () => ({HelpPhotoPicker:'HelpPhotoPicker'}));
import { HelpComposer } from '../src/features/help/components/HelpComposer';

describe('Help composer recorder lifecycle', () => {
  let screen:TestRenderer.ReactTestRenderer|undefined;
  const originalPlatform=Platform.OS;
  const originalAppState=AppState.currentState;
  let appStateChange:(state:string)=>void;
  let props:any;
  beforeEach(()=>{
    mockReducedMotion = true;
    jest.spyOn(PanResponder,'create').mockImplementation(config=>({panHandlers:config} as any));
    Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
    jest.spyOn(AppState,'addEventListener').mockImplementation((_, listener)=>{appStateChange=listener as any;return {remove:jest.fn()};});
    mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
    mockRecorder.record.mockReset();mockRecorder.stop.mockReset().mockResolvedValue(undefined);
    mockPermission.mockReset().mockResolvedValue({granted:true});
    mockGetPermission.mockReset().mockResolvedValue({granted:true});
    mockAudioMode.mockReset().mockResolvedValue(undefined);mockPicker.mockReset();mockPhotoPicker.mockReset();mockStopPlayback.mockReset();
    props={value:'',onChange:jest.fn(),files:[],onFiles:jest.fn(),onSend:jest.fn().mockResolvedValue(undefined),busy:false,mode:'message',rating:0,onRating:jest.fn(),onCancelMode:jest.fn(),onCancelQuote:jest.fn(),error:jest.fn(),onResize:jest.fn()};
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});Object.defineProperty(AppState,'currentState',{configurable:true,value:originalAppState});for(const key of ['stream','mediaRecorder','analyserSource','analyser','analyserBuffer','handleDeviceChange'])delete (mockRecorder as any)[key];jest.restoreAllMocks();});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpComposer,props));});}
  async function choose(kind:'photos'|'files'){
    // This helper covers the browser's system pickers; native uses the inline tray.
    if(Platform.OS!=='web'){
      Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
      await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    }
    await act(async()=>screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0].props.onPress());
    await act(async()=>screen!.root.findAll(n=>n.props.accessibilityLabel===(kind==='photos'?'Выбрать фотографии':'Выбрать файлы'))[0].props.onPress());
  }
  function mic(){return screen!.root.findAll(n=>typeof n.props.onPanResponderGrant==='function')[0];}
  function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
  test('AI correction can send a draft while the previous reply is processing',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    const stop=jest.fn();props={...props,value:'Следующий вопрос',files:[{uri:'file://draft.pdf',name:'draft.pdf'}],onStopAssistant:stop};
    await render();
    const button=screen!.root.findAll(n=>n.props.label==='Отправить сообщение')[0];
    expect(button.props.name).toBe('arrow-up');expect(button.props.disabled).toBe(false);
    expect(screen!.root.findAll(n=>n.props.label==='Остановить ответ ИИ')).toHaveLength(0);
    expect(screen!.root.findByType(TextInput).props.editable).toBe(true);
    await act(async()=>button.props.onPress());
    expect(stop).not.toHaveBeenCalled();expect(props.onSend).toHaveBeenCalledTimes(1);
    expect(props.onChange).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();
  });
  test('AI stop replaces an empty composer microphone until processing ends',async()=>{
    props.onStopAssistant=jest.fn();await render();
    expect(screen!.root.findAll(n=>n.props.accessibilityLabel==='Удерживайте для записи голосового сообщения. Проведите вверх, чтобы закрепить запись')).toHaveLength(0);
    props={...props,onStopAssistant:undefined};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    expect(screen!.root.findAll(n=>n.props.accessibilityLabel==='Удерживайте для записи голосового сообщения. Проведите вверх, чтобы закрепить запись').length).toBeGreaterThan(0);
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });
  test('gallery regression: one composer in the tray, then back restores selected thumbnails above input',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
    props.value='Подпись';props.files=[{uri:'file://draft.jpg',name:'draft.jpg',mimeType:'image/jpeg'}];await render();
    await act(async()=>screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0].props.onPress());
    const picker=()=>screen!.root.findByType('HelpPhotoPicker' as any);
    expect(picker().props.open).toBe(true);expect(picker().props.caption).toBe('Подпись');
    expect(screen!.root.findAllByProps({testID:'help-composer-surface'})).toHaveLength(0);
    await act(async()=>picker().props.onVisibility(true));await act(async()=>picker().props.onClose());
    expect(screen!.root.findAllByProps({testID:'help-composer-surface'})).toHaveLength(0);
    await act(async()=>picker().props.onVisibility(false));
    expect(screen!.root.findAllByProps({testID:'help-attachment-drafts'}).length).toBeGreaterThan(0);
    expect(screen!.root.findByType(Image).props.source.uri).toBe('file://draft.jpg');expect(props.onFiles).not.toHaveBeenCalled();
  });
  test('photo draft strip regression: large borderless thumbnails share overlay removal while preserving caption and file order',async()=>{
    const first={uri:'file://first.jpg',name:'first.jpg',mimeType:'image/jpeg'},document={uri:'file://guide.pdf',name:'guide.pdf',mimeType:'application/pdf'},audio={uri:'file://voice.m4a',name:'voice.m4a',mimeType:'audio/mp4'},last={uri:'file://last.png',name:'last.png',mimeType:'image/png'};
    props.value='Общая подпись';props.files=[first,document,audio,last];props.existingFiles=[{id:'remote-photo',name:'remote.jpg',kind:'IMAGE'},{id:'remote-file',name:'remote.pdf',kind:'FILE'}];props.resolve=jest.fn();props.onRemoveExisting=jest.fn();await render();
    const photos=screen!.root.findAllByProps({testID:'help-draft-photo'}).filter(node=>node.type==='View');expect(photos).toHaveLength(3);
    expect(screen!.root.findAllByProps({testID:'help-attachment-drafts'})[0].props.contentContainerStyle).toMatchObject({alignItems:'center'});
    for(const photo of photos){
      const style=StyleSheet.flatten(photo.props.style);expect(style).toMatchObject({width:80,height:80});expect(style.backgroundColor).toBeUndefined();expect(style.borderWidth).toBeUndefined();
      const remove=photo.findAll(node=>node.props.accessibilityRole==='button'&&typeof node.props.onPress==='function')[0];
      expect(StyleSheet.flatten(remove.props.style)).toMatchObject({position:'absolute',top:0,right:0,width:44,height:44});
      const icon=remove.findByType('Ionicons' as any);expect(icon.props).toMatchObject({name:'close',size:16,color:'#FFF'});
      expect(StyleSheet.flatten(icon.parent!.props.style)).toMatchObject({width:24,height:24,borderRadius:12,backgroundColor:'#00000080'});
    }
    expect(screen!.root.findByType('HelpImage' as any).props.style).toMatchObject({width:80,height:80});
    expect(screen!.root.findAllByType(Image).map(image=>image.props.source.uri)).toEqual([first.uri,last.uri]);
    for(const image of screen!.root.findAllByType(Image))expect(image.props.style).toMatchObject({width:80,height:80});
    for(const name of ['guide.pdf','voice.m4a','remote.pdf']){const remove=screen!.root.findAll(node=>node.props.label===`Убрать ${name}`)[0];expect(remove.props.style).toEqual({width:44,height:52});expect(StyleSheet.flatten(remove.parent!.props.style)).toMatchObject({minHeight:52,backgroundColor:'#333333'});}
    const removePhoto=(name:string)=>screen!.root.findAll(node=>node.props.accessibilityLabel===`Убрать ${name}`&&typeof node.props.onPress==='function')[0];
    await act(async()=>removePhoto('remote.jpg').props.onPress());expect(props.onRemoveExisting).toHaveBeenCalledWith('remote-photo');
    await act(async()=>removePhoto('first.jpg').props.onPress());expect(props.onFiles).toHaveBeenLastCalledWith([document,audio,last]);expect(props.value).toBe('Общая подпись');expect(props.onChange).not.toHaveBeenCalled();
    props={...props,busy:true};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));expect(removePhoto('remote.jpg').props.disabled).toBe(true);expect(removePhoto('last.png').props.disabled).toBe(true);
  });
  test('recording stops shared playback before switching audio mode or preparing the microphone',async()=>{
    const order:string[]=[];
    mockStopPlayback.mockImplementation(()=>order.push('stop-playback'));
    mockAudioMode.mockImplementation(async(options:any)=>{if(options.allowsRecording)order.push('recording-mode');});
    mockRecorder.prepareToRecordAsync.mockImplementation(async()=>{order.push('prepare-microphone');});
    mockRecorder.record.mockImplementation(()=>order.push('record'));
    await render();await act(async()=>mic().props.onPanResponderGrant());
    expect(order).toEqual(['stop-playback','recording-mode','prepare-microphone','record']);
    expect(mockStopPlayback).toHaveBeenCalledTimes(1);
  });
  test('denied microphone permission does not interrupt a playing message',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});mockPermission.mockResolvedValue({granted:false});
    await render();await act(async()=>mic().props.onPanResponderGrant());
    expect(mockStopPlayback).not.toHaveBeenCalled();expect(mockRecorder.record).not.toHaveBeenCalled();
  });
  test('height growth is interruptible and scoped to the composer, with reduced-motion fallback',async()=>{
    mockReducedMotion=false;
    const stop=jest.fn(),start=jest.fn();
    const timing=jest.spyOn(Animated,'timing').mockReturnValue({start,stop,reset:jest.fn()});
    await render();
    const field=()=>screen!.root.findAll(n=>n.type===TextInput)[0];
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:66}}}));
    expect(timing).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({toValue:66,duration:180,useNativeDriver:false}));
    expect(stop).toHaveBeenCalled();
    mockReducedMotion=true;
    await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    const entry=screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0];
    expect(entry.props.style.height.__getValue()).toBe(90);
  });
  test('native caret viewport stays stable while the border grows and the cap inset shrinks continuously',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
    mockReducedMotion=false;
    const timing=jest.spyOn(Animated,'timing').mockReturnValue({start:jest.fn(),stop:jest.fn(),reset:jest.fn()});
    await render();
    const field=()=>screen!.root.findByType(TextInput);
    const entry=()=>screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0];
    const animated=timing.mock.calls[0][0] as Animated.Value;
    expect(field().props.style.height).toBe(145);
    expect(field().props.placeholder).toBeUndefined();
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-placeholder')).not.toHaveLength(0);
    props={...props,value:'A\nB'};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    await act(async()=>screen!.root.findAll(n=>n.props.testID==='help-composer-measure')[0].props.onTextLayout({nativeEvent:{lines:[{y:22,height:22}]}}));
    expect(field().props.style.height).toBe(145);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-placeholder')).toHaveLength(0);
    act(()=>animated.setValue(33));
    expect(entry().props.style.height.__getValue()).toBe(57);
    act(()=>animated.setValue(138.5));
    expect(entry().props.style.paddingBottom.__getValue()).toBe(6);
    expect(entry().props.style.height.__getValue()).toBe(156.5);
  });
  test('Android ignores temporary viewport size before the actual text measure',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
    props.value='A\nB';await render();
    const field=()=>screen!.root.findByType(TextInput);
    const entry=()=>screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0];
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:145}}}));
    expect(entry().props.style.height.__getValue()).toBe(46);
    expect(props.onResize).not.toHaveBeenCalled();
    await act(async()=>screen!.root.findAll(n=>n.props.testID==='help-composer-measure')[0].props.onTextLayout({nativeEvent:{lines:[{y:22,height:22}]}}));
    expect(entry().props.style.height.__getValue()).toBe(68);
    props={...props,value:''};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:145}}}));
    expect(entry().props.style.height.__getValue()).toBe(46);
  });
  test('release while web preparation is pending releases acquired microphone without recording or sending',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    const trackStop=jest.fn(),disconnect=jest.fn();
    Object.assign(mockRecorder,{stream:{getTracks:()=>[{stop:trackStop}]},mediaRecorder:{state:'inactive'},analyserSource:{disconnect},analyser:{disconnect}});
    const preparation=deferred<void>();mockRecorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    await act(async()=>mic().props.onPanResponderRelease());
    await act(async()=>preparation.resolve());
    expect(mockRecorder.record).not.toHaveBeenCalled();expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalledTimes(1);expect(disconnect).toHaveBeenCalledTimes(2);expect((mockRecorder as any).mediaRecorder).toBeNull();
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
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>mic().props.onPanResponderMove(null,{dy:0,dx:-100}));
    await act(async()=>permission.resolve({granted:true}));
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();expect(mockRecorder.record).not.toHaveBeenCalled();
  });
  test('late permission denial after unmount does not show an error in another chat',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>permission.resolve({granted:false}));expect(props.error).not.toHaveBeenCalled();
  });
  test('late picker rejection after unmount does not show an error in another chat',async()=>{
    const picker=deferred<never>();mockPicker.mockReturnValue(picker.promise);await render();
    await choose('files');await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>picker.reject(new Error('cancelled by OS')));expect(props.error).not.toHaveBeenCalled();
  });
  test('first native grant survives permission-dialog termination and starts locked only after foreground return',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    expect(mockPermission).toHaveBeenCalledTimes(1);
    await act(async()=>{appStateChange('inactive');mic().props.onPanResponderTerminate();mic().props.onPanResponderRelease();});
    await act(async()=>permission.resolve({granted:true}));
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    await act(async()=>appStateChange('active'));
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await act(async()=>mic().props.onPanResponderRelease());
    expect(mockRecorder.stop).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();
    const stop=screen!.root.findAll(n=>n.props.label==='Остановить и сохранить запись в черновик')[0];
    await act(async()=>stop.props.onPress());
    expect(props.onFiles).toHaveBeenCalledTimes(1);expect(props.error).not.toHaveBeenCalled();
  });
  test('first grant with lost hold but no AppState event still starts locked',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>mic().props.onPanResponderTerminate());
    await act(async()=>permission.resolve({granted:true}));
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(screen!.root.findAll(n=>n.props.label==='Отменить запись').length).toBeGreaterThan(0);
    expect(props.onSend).not.toHaveBeenCalled();
  });
  test('already granted permission retains hold/release sending and repeat holds do not request permission again',async()=>{
    await render();
    for(let i=0;i<2;i++){
      await act(async()=>mic().props.onPanResponderGrant());
      await act(async()=>mic().props.onPanResponderRelease());
    }
    expect(mockPermission).not.toHaveBeenCalled();expect(mockRecorder.record).toHaveBeenCalledTimes(2);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(2);expect(props.onSend).toHaveBeenCalledTimes(2);
  });
  test('explicit cancellation wins over permission-dialog background and late grant',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>{mic().props.onPanResponderMove(null,{dy:0,dx:-100});appStateChange('background');});
    await act(async()=>permission.resolve({granted:true}));
    await act(async()=>appStateChange('active'));
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();expect(mockRecorder.record).not.toHaveBeenCalled();
  });
  test('unmount before grant never configures recording or allows stale responder to restart',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();const grant=mic().props.onPanResponderGrant;await act(async()=>grant());
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>permission.resolve({granted:true}));
    await act(async()=>grant());
    expect(mockGetPermission).toHaveBeenCalledTimes(1);expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockAudioMode).not.toHaveBeenCalledWith(expect.objectContaining({allowsRecording:true}));
  });
  test('unmount during web preparation stops tracks without ever starting MediaRecorder',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    const trackStop=jest.fn();Object.assign(mockRecorder,{stream:{getTracks:()=>[{stop:trackStop}]},mediaRecorder:{state:'inactive'}});
    const preparation=deferred<void>();mockRecorder.prepareToRecordAsync.mockReturnValue(preparation.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>preparation.resolve());
    expect(trackStop).toHaveBeenCalledTimes(1);expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(props.onSend).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();
  });
  test('unmount while permission flow waits for active cannot resume recording later',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});
    const permission=deferred<{granted:boolean}>();mockPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>appStateChange('inactive'));
    await act(async()=>permission.resolve({granted:true}));
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>appStateChange('active'));
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();expect(mockRecorder.record).not.toHaveBeenCalled();
  });
  test('locked recording cancels explicitly and a later hold starts normally',async()=>{
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>mic().props.onPanResponderMove(null,{dy:-80,dx:0}));
    await act(async()=>mic().props.onPanResponderRelease());
    const cancel=screen!.root.findAll(n=>n.props.label==='Отменить запись')[0];
    await act(async()=>cancel.props.onPress());
    expect(props.onFiles).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();
    await act(async()=>mic().props.onPanResponderGrant());await act(async()=>mic().props.onPanResponderRelease());
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);expect(props.onSend).toHaveBeenCalledTimes(1);
  });
  test('web permission query that itself prompts survives responder loss',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    const permission=deferred<{granted:boolean}>();mockGetPermission.mockReturnValue(permission.promise);
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>mic().props.onPanResponderTerminate());
    await act(async()=>permission.resolve({granted:true}));
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);expect(mockPermission).not.toHaveBeenCalled();
    await act(async()=>mic().props.onPanResponderRelease());expect(mockRecorder.stop).not.toHaveBeenCalled();
  });
  test('actual background during recording stages audio once and does not restart on return',async()=>{
    await render();await act(async()=>mic().props.onPanResponderGrant());
    await act(async()=>appStateChange('background'));await act(async()=>appStateChange('active'));
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);expect(props.onFiles).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);expect(props.onSend).not.toHaveBeenCalled();
  });
  test('permission denial is retryable without leaving recorder locked or starting',async()=>{
    mockGetPermission.mockResolvedValue({granted:false});mockPermission.mockResolvedValueOnce({granted:false}).mockResolvedValueOnce({granted:true});
    await render();await act(async()=>mic().props.onPanResponderGrant());
    expect(props.error).toHaveBeenCalledTimes(1);expect(mockRecorder.record).not.toHaveBeenCalled();
    await act(async()=>mic().props.onPanResponderGrant());expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });
  test('composer matches 6.5-line geometry with a half-line flush against its bottom',async()=>{
    await render();const field=()=>screen!.root.findByType(TextInput);
    const entry=()=>screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0];
    expect(entry().props.style).toMatchObject({minHeight:46,paddingTop:12,paddingLeft:45,paddingRight:47});
    expect(field().props.style).toMatchObject({fontSize:18,lineHeight:22,padding:0,borderWidth:0,includeFontPadding:false,backgroundColor:'transparent'});
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:400}}}));
    expect(field().props.style.height).toBe(145);expect(field().props.scrollEnabled).toBe(true);
    expect(entry().props.style.paddingBottom.__getValue()).toBe(0);
    const bottom=screen!.root.findAll(n=>n.props.testID==='help-composer-fade-bottom')[0];
    expect(bottom.props.style).toMatchObject({bottom:0,height:12});expect(bottom.props.colors).toEqual(['#22222200','#22222280']);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-fade-top')).toHaveLength(0);
  });
  test('top and bottom fades follow hidden text and reset on shrink, including closure input',async()=>{
    props.mode='close';await render();const field=()=>screen!.root.findByType(TextInput);
    const exists=(id:string)=>screen!.root.findAll(n=>n.props.testID===id).length>0;
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:400}}}));
    await act(async()=>field().props.onScroll({nativeEvent:{contentOffset:{y:100}}}));
    expect(exists('help-composer-fade-top')).toBe(true);expect(exists('help-composer-fade-bottom')).toBe(true);
    const top=screen!.root.findAll(n=>n.props.testID==='help-composer-fade-top')[0];
    expect(top.props.colors).toEqual(['#22222280','#22222200']);
    await act(async()=>field().props.onScroll({nativeEvent:{contentOffset:{y:255}}}));
    expect(exists('help-composer-fade-top')).toBe(true);expect(exists('help-composer-fade-bottom')).toBe(false);
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:44}}}));
    expect(exists('help-composer-fade-top')).toBe(false);expect(exists('help-composer-fade-bottom')).toBe(false);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0].props.style.paddingBottom.__getValue()).toBe(12);
  });
  test('paperclip/send/star sizes and transparent unfocused input match reference',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});props.mode='close';await render();
    expect(screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0].props.style).toMatchObject({width:36,height:38,left:4,bottom:4});
    expect(screen!.root.findAll(n=>n.props.label==='Закрыть обращение')[0].props.style).toMatchObject({width:38,height:38,right:4,bottom:4,borderRadius:19});
    expect(screen!.root.findAll(n=>n.props.label==='1 из 5 звёзд')[0].props.style).toMatchObject({width:30,height:30});
    expect(screen!.root.findByType(TextInput).props.style).toMatchObject({outlineStyle:'none',outlineWidth:0,boxShadow:'none'});
    expect(screen!.root.findByType(TextInput).props.underlineColorAndroid).toBe('transparent');
  });
  test.each(['android','web'])('empty value resets a long %s composer without a content-size notification',async(platform)=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:platform});props.value='Длинный текст';await render();
    const field=()=>screen!.root.findByType(TextInput);
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:400}}}));
    await act(async()=>field().props.onScroll({nativeEvent:{contentOffset:{y:100}}}));
    expect(field().props.style.height).toBe(145);
    props={...props,value:''};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    expect(field().props.style.height).toBe(platform === 'web' ? 22 : 145);expect(field().props.scrollEnabled).toBe(false);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-fade-top')).toHaveLength(0);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-fade-bottom')).toHaveLength(0);
    const entry=screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0];
    expect(entry.props.style.height.__getValue()).toBe(46);expect(entry.props.style.paddingBottom.__getValue()).toBe(12);
  });
  test('web deletion measures intrinsic textarea height instead of its previous fixed height',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    let intrinsic=400;const measuredStyles:string[]=[];
    const node={style:{height:'145px'},scrollTop:100,focus:jest.fn(),get scrollHeight(){measuredStyles.push(this.style.height);return this.style.height==='0px'?intrinsic:Math.max(145,intrinsic);}};
    await render();const field=()=>screen!.root.findByType(TextInput);
    Object.defineProperties(field().instance,Object.getOwnPropertyDescriptors(node));
    props={...props,value:'Много строк'};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    expect(field().props.style.height).toBe(145);
    intrinsic=44;props={...props,value:'Две строки'};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    expect(measuredStyles).toContain('0px');expect(node.style.height).toBe('145px');
    expect(field().props.style.height).toBe(44);expect(field().props.scrollEnabled).toBe(false);expect(field().instance.scrollTop).toBe(0);
    intrinsic=22;props={...props,value:'Кратко'};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    expect(field().props.style.height).toBe(22);expect(props.onResize).toHaveBeenCalled();
  });
  test('recording card uses measured chat/composer/card heights rather than a fixed distance',async()=>{
    props.recordingAreaHeight=600;await render();await act(async()=>mic().props.onPanResponderGrant());
    const card=()=>screen!.root.findAll(n=>n.props.testID==='help-recording-card')[0];
    const surface=()=>screen!.root.findAll(n=>n.props.testID==='help-composer-surface')[0];
    await act(async()=>{surface().props.onLayout({nativeEvent:{layout:{height:48}}});card().props.onLayout({nativeEvent:{layout:{height:200}}});});
    expect(card().props.style.bottom).toBe(248);
    props={...props,recordingAreaHeight:400};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    await act(async()=>surface().props.onLayout({nativeEvent:{layout:{height:70}}}));
    expect(card().props.style.bottom).toBe(170);expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });
  test('quote resolves real thumbnail when supplied and remains text-only otherwise',async()=>{
    const thumbnail={id:'photo',name:'Фото.jpg',kind:'IMAGE',mimeType:'image/jpeg'};
    const resolve=jest.fn();const onPress=jest.fn();props.quote={name:'Анна',text:'Фото',onPress,thumbnail};props.resolve=resolve;
    await render();const image=screen!.root.findByType('HelpImage' as any);
    expect(image.props.attachment).toBe(thumbnail);expect(image.props.resolve).toBe(resolve);expect(image.props.style).toMatchObject({width:40,height:40,borderRadius:5});
    await act(async()=>screen!.root.findAll(n=>n.props.accessibilityLabel==='К сообщению Анна')[0].props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);expect(props.onChange).not.toHaveBeenCalled();
    props={...props,resolve:undefined};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    expect(screen!.root.findAllByType('HelpImage' as any)).toHaveLength(0);
  });
  test('photo selection preserves picker order, metadata, existing draft, and shows removable thumbnails',async()=>{
    props.value='Подпись';props.files=[{uri:'file://guide.pdf',name:'guide.pdf',mimeType:'application/pdf'}];
    const photos=[{uri:'file://second.png',fileName:'second.png',mimeType:'image/png',fileSize:123,width:800,height:600},{uri:'file://first.jpg',fileName:'first.jpg',mimeType:'image/jpeg',fileSize:456,width:600,height:900}];
    mockPhotoPicker.mockResolvedValue({canceled:false,assets:photos});await render();await choose('photos');
    expect(mockPhotoPicker).toHaveBeenCalledWith(expect.objectContaining({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:9,orderedSelection:true,allowsEditing:false,quality:1}));
    const next=props.onFiles.mock.calls[0][0];
    expect(next.map((file:any)=>file.name)).toEqual(['guide.pdf','second.png','first.jpg']);
    expect(next[1]).toMatchObject({mimeType:'image/png',size:123,width:800,height:600});
    expect(props.onSend).not.toHaveBeenCalled();expect(props.onChange).not.toHaveBeenCalled();
    props={...props,files:next};await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    const images=screen!.root.findAllByType(Image);
    expect(images.map(image=>image.props.source.uri)).toEqual(['file://second.png','file://first.jpg']);
    expect(images[0].props.style).toMatchObject({width:80,height:80});
    const remove=screen!.root.findAll(n=>n.props.accessibilityLabel==='Убрать second.png'&&typeof n.props.onPress==='function')[0];
    expect(remove.props.style).toMatchObject({width:44,height:44,position:'absolute',top:0,right:0});await act(async()=>remove.props.onPress());
    expect(props.onFiles).toHaveBeenLastCalledWith([next[0],next[2]]);expect(props.value).toBe('Подпись');
  });
  test.each(['photos','files'] as const)('%s rejects an eleventh attachment atomically',async kind=>{
    const existing={uri:'file://draft.pdf',name:'draft.pdf'};props.files=[existing];props.value='Сохранить подпись';
    const assets=Array.from({length:10},(_,index)=>({uri:`file://${index}.jpg`,name:`${index}.jpg`,fileName:`${index}.jpg`,mimeType:'image/jpeg',width:100,height:100}));
    (kind==='photos'?mockPhotoPicker:mockPicker).mockResolvedValue({canceled:false,assets});
    await render();await choose(kind);
    expect(props.error).toHaveBeenCalledWith('В одном сообщении можно прикрепить до 10 файлов.');
    expect(props.onFiles).not.toHaveBeenCalled();expect(props.onChange).not.toHaveBeenCalled();expect(props.files).toEqual([existing]);
  });
  test.each(['photos','files'] as const)('%s rejects a file larger than20MiB without clearing earlier picks',async kind=>{
    props.files=[{uri:'file://draft.jpg',name:'draft.jpg',mimeType:'image/jpeg'}];
    const size=20*1024*1024+1;
    const asset={uri:'file://large.jpg',name:'large.jpg',fileName:'large.jpg',mimeType:'image/jpeg',size,fileSize:size,width:1000,height:1000};
    (kind==='photos'?mockPhotoPicker:mockPicker).mockResolvedValue({canceled:false,assets:[asset]});
    await render();await choose(kind);
    expect(props.error).toHaveBeenCalledWith('Размер каждого файла должен быть не больше 20 МБ.');expect(props.onFiles).not.toHaveBeenCalled();
    expect(screen!.root.findByType(Image).props.source.uri).toBe('file://draft.jpg');
  });
  test('exact20MiB photos and ten attachments are accepted, with editing attachments counted',async()=>{
    props.existingFiles=Array.from({length:7},(_,id)=>({id:String(id),name:`old-${id}.pdf`,kind:'FILE'}));
    props.files=[{uri:'file://draft.pdf',name:'draft.pdf'}];
    mockPhotoPicker.mockResolvedValue({canceled:false,assets:[{uri:'file://a.png',fileName:'a.png',fileSize:20*1024*1024,width:100,height:100},{uri:'file://b.jpg',fileName:'b.jpg',fileSize:1,width:100,height:100}]});
    await render();await choose('photos');
    expect(mockPhotoPicker).toHaveBeenCalledWith(expect.objectContaining({selectionLimit:2}));expect(props.onFiles.mock.calls[0][0]).toHaveLength(3);expect(props.error).not.toHaveBeenCalled();
  });
  test.each(['photos','files'] as const)('%s cancellation preserves selected photos and typed text',async kind=>{
    const original=[{uri:'file://draft.jpg',name:'draft.jpg',mimeType:'image/jpeg'}];props.files=original;props.value='Черновик';
    (kind==='photos'?mockPhotoPicker:mockPicker).mockResolvedValue({canceled:true,assets:null});
    await render();await choose(kind);
    expect(props.onFiles).not.toHaveBeenCalled();expect(props.onChange).not.toHaveBeenCalled();expect(props.error).not.toHaveBeenCalled();
    expect(screen!.root.findByType(Image).props.source.uri).toBe(original[0].uri);
  });
  test('photo picker retains draft changes made while its result is pending',async()=>{
    const pending=deferred<any>();mockPhotoPicker.mockReturnValue(pending.promise);
    await render();await choose('photos');
    const draft={uri:'file://retained.pdf',name:'retained.pdf'};props={...props,files:[draft],value:'Новая подпись'};
    await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    await act(async()=>pending.resolve({canceled:false,assets:[{uri:'file://new.heic',fileName:null,mimeType:'image/heic',width:600,height:800}]}));
    expect(props.onFiles.mock.calls[0][0][0]).toBe(draft);expect(props.onFiles.mock.calls[0][0][1]).toMatchObject({mimeType:'image/heic',width:600,height:800,name:expect.stringMatching(/\.heic$/)});expect(props.onChange).not.toHaveBeenCalled();
  });
  test('full draft does not open a picker or erase existing files',async()=>{
    props.files=Array.from({length:10},(_,index)=>({uri:`file://${index}.jpg`,name:`${index}.jpg`,mimeType:'image/jpeg'}));await render();await choose('photos');
    expect(mockPhotoPicker).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();expect(props.error).toHaveBeenCalledWith('В одном сообщении можно прикрепить до 10 файлов.');
  });
  test('photo permission rejection provides an actionable error and preserves draft',async()=>{
    props.value='Черновик';mockPhotoPicker.mockRejectedValue({code:'ERR_MISSING_PERMISSION'});await render();await choose('photos');
    expect(props.error).toHaveBeenCalledWith('Разрешите доступ к выбранным фотографиям в настройках устройства.');expect(props.onFiles).not.toHaveBeenCalled();expect(props.onChange).not.toHaveBeenCalled();
  });
  test('late photo result after unmount cannot attach files in another chat',async()=>{
    const pending=deferred<any>();mockPhotoPicker.mockReturnValue(pending.promise);await render();await choose('photos');
    await act(async()=>screen!.unmount());screen=undefined;
    await act(async()=>pending.resolve({canceled:false,assets:[{uri:'file://old.jpg',fileName:'old.jpg',width:100,height:100}]}));
    expect(props.onFiles).not.toHaveBeenCalled();expect(props.error).not.toHaveBeenCalled();
  });
  test('web picker keeps its File object and native image dimensions',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    const file={name:'browser.webp',type:'image/webp',size:500};
    mockPhotoPicker.mockResolvedValue({canceled:false,assets:[{uri:'blob:photo',file,width:640,height:480}]});await render();await choose('photos');
    expect(props.onFiles).toHaveBeenCalledWith([expect.objectContaining({uri:'blob:photo',name:'browser.webp',mimeType:'image/webp',size:500,file,width:640,height:480})]);
  });
  test('native paperclip opens the inline tray without launching the system photo picker',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});props.value='Подпись';
    const draft={uri:'file://draft.pdf',name:'draft.pdf',mimeType:'application/pdf'};props.files=[draft];
    props.existingFiles=[{id:'existing',name:'old.jpg',kind:'IMAGE'}];await render();
    const tray=()=>screen!.root.findByType('HelpPhotoPicker' as any);
    expect(tray().props.open).toBe(false);
    await act(async()=>screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0].props.onPress());
    expect(tray().props.open).toBe(true);expect(mockPhotoPicker).not.toHaveBeenCalled();expect(mockPicker).not.toHaveBeenCalled();
    expect(tray().props).toMatchObject({caption:'Подпись',files:[draft],existingCount:1});
    await act(async()=>tray().props.onCaption('Обновлённая подпись'));expect(props.onChange).toHaveBeenCalledWith('Обновлённая подпись');
    const selected=[{uri:'file://ready.jpg',name:'ready.jpg',mimeType:'image/jpeg'}];
    await act(async()=>tray().props.onSend(selected));expect(props.onSend).toHaveBeenCalledWith(undefined,selected);
    await act(async()=>tray().props.onPreparing(true));
    // The inline gallery owns the composer while open; check its restored
    // send button after closing the gallery, while preparation is still pending.
    expect(screen!.root.findAll(n=>n.props.label==='Отправить сообщение')).toHaveLength(0);
    await act(async()=>tray().props.onClose());
    expect(screen!.root.findAll(n=>n.props.label==='Отправить сообщение')[0].props.disabled).toBe(true);
  });
  test('native documents action uses document picker and closes the inline tray',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'android'});mockPicker.mockResolvedValue({canceled:true,assets:null});await render();
    await act(async()=>screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0].props.onPress());
    await act(async()=>screen!.root.findByType('HelpPhotoPicker' as any).props.onDocuments());
    expect(mockPicker).toHaveBeenCalledTimes(1);expect(mockPhotoPicker).not.toHaveBeenCalled();expect(screen!.root.findByType('HelpPhotoPicker' as any).props.open).toBe(false);
  });
});
