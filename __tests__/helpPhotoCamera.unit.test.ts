import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,AppState,BackHandler,StyleSheet} from 'react-native';
let mockPermission:any={granted:true,canAskAgain:true};
const mockRequestPermission=jest.fn(),mockRefreshPermission=jest.fn(),mockTakePicture=jest.fn();
let mockMounts=0,mockUnmounts=0,mockCameraProps:any;
let mockAppState:(state:string)=>void=()=>{},mockBack:()=>boolean=()=>false;
const mockActions:Record<string,Record<string,(value?:unknown)=>unknown>>={};
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-blur',()=>({BlurView:'BlurView'}));
jest.mock('expo-camera',()=>{
  const React=require('react');return{useCameraPermissions:()=>[mockPermission,mockRequestPermission,mockRefreshPermission],CameraView:React.forwardRef((props:any,ref:any)=>{mockCameraProps=props;React.useImperativeHandle(ref,()=>({takePictureAsync:mockTakePicture}));React.useEffect(()=>{mockMounts++;return()=>mockUnmounts++;},[]);return React.createElement('CameraView',props);})};
});
jest.mock('expo-file-system/legacy',()=>({getInfoAsync:jest.fn().mockResolvedValue({exists:true,size:1234})}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:20,bottom:10,left:0,right:0})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>true,useHelpTheme:()=>({accent:'#398DFF',panel:'#1E2730',text:'#FFF'})}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevState:jest.fn(),helpDevActions:(owner:string,actions:any)=>{mockActions[owner]=actions;return()=>delete mockActions[owner];}}));
import {HelpPhotoCamera,type HelpPhotoCameraProps} from '../src/features/help/components/HelpPhotoCamera';
import {HelpPhotoPortalProvider} from '../src/features/help/components/HelpPhotoPortal';

describe('photo camera lifecycle and explicit capture',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined,props:HelpPhotoCameraProps;
  beforeEach(()=>{
    mockPermission={granted:true,canAskAgain:true};mockRequestPermission.mockReset().mockResolvedValue({granted:true});mockRefreshPermission.mockReset().mockResolvedValue(mockPermission);mockTakePicture.mockReset().mockResolvedValue({uri:'file:///capture.jpg',width:1600,height:1200,format:'jpg'});mockMounts=0;mockUnmounts=0;mockCameraProps=undefined;
    Object.defineProperty(AppState,'currentState',{configurable:true,writable:true,value:'active'});
    jest.spyOn(AppState,'addEventListener').mockImplementation((_,handler:any)=>{mockAppState=handler;return{remove:jest.fn()};});
    jest.spyOn(BackHandler,'addEventListener').mockImplementation((_,handler:any)=>{mockBack=handler;return{remove:jest.fn()};});
    props={expanded:false,onExpand:jest.fn(),onClose:jest.fn(),onCapture:jest.fn(),onError:jest.fn(),tileOrigin:{x:10,y:500,width:120,height:120}};
  });
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.restoreAllMocks();});
  const tree=()=>React.createElement(HelpPhotoPortalProvider,{children:React.createElement(HelpPhotoCamera,props)});
  async function render(){await act(async()=>{screen=TestRenderer.create(tree());});}
  async function update(next:Partial<HelpPhotoCameraProps>){props={...props,...next};await act(async()=>screen!.update(tree()));}
  const control=(label:string)=>screen!.root.findAllByProps({accessibilityLabel:label}).find(node=>node.props.onPress)!;
  async function ready(){await act(async()=>mockCameraProps.onCameraReady());}
  test('camera regression: visible gallery requests preview permission once without opening or capturing',async()=>{
    mockPermission={granted:false,canAskAgain:true};props.tileVisible=false;await render();expect(mockRequestPermission).not.toHaveBeenCalled();expect(mockMounts).toBe(0);
    await update({tileVisible:true});expect(mockRequestPermission).toHaveBeenCalledTimes(1);expect(props.onExpand).not.toHaveBeenCalled();expect(mockTakePicture).not.toHaveBeenCalled();
    mockPermission={granted:true,canAskAgain:true};await update({});expect(mockMounts).toBe(1);expect(mockCameraProps.previewBlurRadius).toBe(10);
    await update({tileVisible:false});await update({tileVisible:true});expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });
  test('camera regression: preview and centered icon follow native grid scroll inside its clip',async()=>{
    const offset=new Animated.Value(0);props.scrollOffset=offset;props.viewport={x:10,y:500,width:360,height:300};await render();
    const style=(id:string)=>StyleSheet.flatten(screen!.root.findAllByProps({testID:id})[0].props.style);
    expect(style('help-photo-camera-clip').overflow).toBe('hidden');
    expect(style('help-photo-camera-clip').top.__getValue()).toBe(500);
    expect(style('help-photo-camera-icon')).toMatchObject({alignItems:'center',justifyContent:'center',top:0,bottom:0});
    expect(mockCameraProps.previewBlurRadius).toBe(10);
    await act(async()=>offset.setValue(45));expect(style('help-photo-camera-scroll').transform[0].translateY.__getValue()).toBe(-45);
    await update({expanded:true});expect(mockCameraProps.previewBlurRadius).toBe(0);expect(style('help-photo-camera-scroll').transform).toEqual([{translateY:0}]);
    await update({expanded:false});expect(mockCameraProps.previewBlurRadius).toBe(10);expect(style('help-photo-camera-scroll').transform[0].translateY.__getValue()).toBe(-45);
    expect(mockMounts).toBe(1);expect(mockUnmounts).toBe(0);expect(mockTakePicture).not.toHaveBeenCalled();
  });
  test('permanent denial reports actionable text without prompting again',async()=>{
    mockPermission={granted:false,canAskAgain:false};await render();await act(async()=>control('Открыть камеру').props.onPress());
    expect(mockRequestPermission).not.toHaveBeenCalled();expect(props.onError).toHaveBeenCalledWith('Разрешите доступ к камере в настройках приложения.');expect(props.onExpand).not.toHaveBeenCalled();
  });
  test('a denied request keeps the tile and never opens a camera',async()=>{
    mockPermission={granted:false,canAskAgain:true};mockRequestPermission.mockResolvedValue({granted:false});await render();await act(async()=>control('Открыть камеру').props.onPress());
    expect(props.onExpand).not.toHaveBeenCalled();expect(props.onError).toHaveBeenCalledWith('Для съёмки фото нужен доступ к камере.');expect(mockMounts).toBe(0);
  });
  test('expansion and collapse preserve one camera instance; offscreen preview releases it',async()=>{
    await render();expect(mockMounts).toBe(1);await update({expanded:true});await update({expanded:false});expect(mockMounts).toBe(1);expect(mockUnmounts).toBe(0);
    await update({tileVisible:false});expect(mockUnmounts).toBe(1);await update({tileVisible:true});expect(mockMounts).toBe(2);
  });
  test('shutter waits for readiness and captures a photo without audio, sending or automatic close',async()=>{
    props.expanded=true;await render();expect(control('Сделать фото').props.disabled).toBe(true);
    await act(async()=>mockActions['photo-camera']['photo.camera.capture']());expect(mockTakePicture).not.toHaveBeenCalled();
    await ready();expect(control('Сделать фото').props.disabled).not.toBe(true);
    await act(async()=>control('Сделать фото').props.onPress());expect(mockTakePicture).toHaveBeenCalledWith(expect.objectContaining({skipProcessing:false,base64:false,exif:false}));
    expect(props.onCapture).toHaveBeenCalledWith(expect.objectContaining({id:expect.stringMatching(/^capture:/),uri:'file:///capture.jpg',width:1600,height:1200,size:1234,name:expect.stringMatching(/\.jpg$/)}));
    expect(props.onClose).not.toHaveBeenCalled();expect(mockCameraProps.mode).toBe('picture');expect(mockCameraProps.mute).toBe(true);
  });
  test('fast repeated shutter taps produce one capture, then the latest callback receives it',async()=>{
    let resolve!:(value:any)=>void;mockTakePicture.mockImplementation(()=>new Promise(done=>{resolve=done;}));props.expanded=true;await render();await ready();
    await act(async()=>{control('Сделать фото').props.onPress();mockActions['photo-camera']['photo.camera.capture']();});expect(mockTakePicture).toHaveBeenCalledTimes(1);
    const onCapture=jest.fn();await update({onCapture});await act(async()=>resolve({uri:'file:///new.jpg',width:100,height:200,format:'jpg'}));expect(onCapture).toHaveBeenCalledTimes(1);
  });
  test('closing while capture is pending discards its stale callback',async()=>{
    let resolve!:(value:any)=>void;mockTakePicture.mockImplementation(()=>new Promise(done=>{resolve=done;}));props.expanded=true;await render();await ready();await act(async()=>control('Сделать фото').props.onPress());
    await act(async()=>control('Закрыть камеру').props.onPress());await update({expanded:false});await act(async()=>resolve({uri:'file:///late.jpg',width:100,height:200,format:'jpg'}));expect(props.onCapture).not.toHaveBeenCalled();
  });
  test('hardware back closes only the expanded camera and releases its listener',async()=>{
    props.expanded=true;await render();await act(async()=>expect(mockBack()).toBe(true));expect(props.onClose).toHaveBeenCalledTimes(1);
    const result=(BackHandler.addEventListener as jest.Mock).mock.results[0].value;await update({expanded:false});expect(result.remove).toHaveBeenCalledTimes(1);
  });
  test('background releases camera and foreground refreshes permission without a prompt',async()=>{
    props.expanded=true;await render();await ready();await act(async()=>mockAppState('background'));expect(mockUnmounts).toBe(1);
    await act(async()=>mockAppState('active'));expect(mockRefreshPermission).toHaveBeenCalledTimes(1);expect(mockRequestPermission).not.toHaveBeenCalled();expect(mockMounts).toBe(2);expect(control('Сделать фото').props.disabled).toBe(true);
  });
  test('flip keeps one instance and waits for the newly facing camera before capture',async()=>{
    props.expanded=true;await render();await ready();await act(async()=>control('Переключить камеру').props.onPress());expect(mockCameraProps.facing).toBe('front');expect(mockMounts).toBe(1);expect(control('Сделать фото').props.disabled).toBe(true);
  });
  test('capture failure unlocks shutter and exposes no private native error',async()=>{
    mockTakePicture.mockRejectedValue(new Error('file:///private/native/path'));props.expanded=true;await render();await ready();await act(async()=>control('Сделать фото').props.onPress());
    expect(props.onError).toHaveBeenCalledWith('Не удалось сделать фото. Попробуйте ещё раз.');expect(control('Сделать фото').props.disabled).not.toBe(true);
  });
  test('disabled tile never opens or requests permission',async()=>{
    props.disabled=true;mockPermission={granted:false,canAskAgain:true};await render();await act(async()=>mockActions['photo-camera']['photo.camera.open']());expect(props.onExpand).not.toHaveBeenCalled();expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
