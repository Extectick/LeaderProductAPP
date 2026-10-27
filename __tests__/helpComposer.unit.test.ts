import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated, AppState, PanResponder, Platform, TextInput } from 'react-native';

const mockRecorder = { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), getStatus: jest.fn(() => ({durationMillis:1000})), uri: 'file://voice.m4a' };
const mockPermission = jest.fn();
const mockGetPermission = jest.fn();
const mockAudioMode = jest.fn();
const mockPicker = jest.fn();
let mockReducedMotion = true;
jest.mock('expo-audio', () => ({RecordingPresets:{HIGH_QUALITY:{}},getRecordingPermissionsAsync:(...args:any[])=>mockGetPermission(...args),requestRecordingPermissionsAsync:(...args:any[])=>mockPermission(...args),setAudioModeAsync:(...args:any[])=>mockAudioMode(...args),useAudioRecorder:()=>mockRecorder,useAudioRecorderState:()=>({isRecording:false,durationMillis:0})}));
jest.mock('expo-document-picker', () => ({getDocumentAsync:(...args:any[])=>mockPicker(...args)}));
jest.mock('expo-linear-gradient', () => ({LinearGradient:'LinearGradient'}));
jest.mock('@expo/vector-icons', () => ({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme', () => ({useHelpTheme:()=>({surface:'#222222',text:'#ffffff',muted:'#999999',accent:'#3388ff',elevated:'#333333',line:'#444444'}),useHelpReducedMotion:()=>mockReducedMotion}));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({HelpIcon:'HelpIcon'}));
jest.mock('../src/features/help/components/HelpMedia', () => ({HelpImage:'HelpImage'}));
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
    mockAudioMode.mockReset().mockResolvedValue(undefined);mockPicker.mockReset();
    props={value:'',onChange:jest.fn(),files:[],onFiles:jest.fn(),onSend:jest.fn().mockResolvedValue(undefined),busy:false,mode:'message',rating:0,onRating:jest.fn(),onCancelMode:jest.fn(),onCancelQuote:jest.fn(),error:jest.fn(),onResize:jest.fn()};
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});Object.defineProperty(AppState,'currentState',{configurable:true,value:originalAppState});for(const key of ['stream','mediaRecorder','analyserSource','analyser','analyserBuffer','handleDeviceChange'])delete (mockRecorder as any)[key];jest.restoreAllMocks();});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpComposer,props));});}
  function mic(){return screen!.root.findAll(n=>typeof n.props.onPanResponderGrant==='function')[0];}
  function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
  test('height growth is interruptible and scoped to the composer, with reduced-motion fallback',async()=>{
    mockReducedMotion=false;
    const stop=jest.fn(),start=jest.fn();
    const timing=jest.spyOn(Animated,'timing').mockReturnValue({start,stop,reset:jest.fn()});
    await render();
    const field=()=>screen!.root.findAll(n=>n.type===TextInput)[0];
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:66}}}));
    expect(timing).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({toValue:90,duration:260,useNativeDriver:false}));
    expect(stop).toHaveBeenCalled();
    mockReducedMotion=true;
    await act(async()=>screen!.update(React.createElement(HelpComposer,props)));
    const entry=screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0];
    expect(entry.props.style.height.__getValue()).toBe(90);
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
    const attach=screen!.root.findAll(n=>n.props.label==='Прикрепить файлы')[0];
    await act(async()=>attach.props.onPress());await act(async()=>screen!.unmount());screen=undefined;
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
    expect(entry().props.style).toMatchObject({minHeight:46,paddingTop:12,paddingBottom:12,paddingLeft:45,paddingRight:47});
    expect(field().props.style).toMatchObject({fontSize:16,lineHeight:22,padding:0,borderWidth:0,includeFontPadding:false,backgroundColor:'transparent'});
    await act(async()=>field().props.onContentSizeChange({nativeEvent:{contentSize:{height:400}}}));
    expect(field().props.style.height).toBe(145);expect(field().props.scrollEnabled).toBe(true);
    expect(entry().props.style.paddingBottom).toBe(0);
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
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0].props.style.paddingBottom).toBe(12);
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
    expect(field().props.style.height).toBe(22);expect(field().props.scrollEnabled).toBe(false);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-fade-top')).toHaveLength(0);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-fade-bottom')).toHaveLength(0);
    expect(screen!.root.findAll(n=>n.props.testID==='help-composer-entry')[0].props.style).toMatchObject({minHeight:46,paddingBottom:12});
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
});
