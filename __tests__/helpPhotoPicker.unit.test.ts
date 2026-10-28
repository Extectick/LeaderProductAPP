import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Animated, Dimensions, Keyboard, PanResponder, TextInput} from 'react-native';

const mockPermission=jest.fn(),mockPage=jest.fn(),mockPrepare=jest.fn(),mockDiscard=jest.fn(),mockPreviewUri=jest.fn();
const mockPullTiming=jest.fn(),mockPullSpring=jest.fn();
jest.mock('react-native-gesture-handler',()=>{
  const build=(kind:string)=>{
    const result:any={kind,config:{},handlers:{}};
    for(const key of ['withTestId','manualActivation','maxPointers','enabled','requireExternalGestureToFail','disallowInterruption'])result[key]=(...args:unknown[])=>{result.config[key]=args.length===1?args[0]:args;return result;};
    for(const key of ['onTouchesDown','onTouchesMove','onTouchesUp','onStart','onUpdate','onEnd','onFinalize'])result[key]=(handler:unknown)=>{result.handlers[key]=handler;return result;};
    return result;
  };
  return{Gesture:{Pan:()=>build('pan'),Native:()=>build('native')},GestureDetector:'GestureDetector',GestureHandlerRootView:'GestureHandlerRootView'};
});
jest.mock('react-native-reanimated',()=>{
  const React=require('react'),RN=require('react-native');
  return{__esModule:true,default:{View:RN.View,FlatList:RN.FlatList},cancelAnimation:jest.fn(),runOnJS:(fn:unknown)=>fn,
    useSharedValue:(initial:unknown)=>React.useRef({value:initial}).current,
    useAnimatedStyle:(fn:()=>any)=>({get transform(){return fn().transform;}}),
    useAnimatedScrollHandler:(handlers:any)=>Object.assign((event:any)=>handlers.onScroll(event.nativeEvent||event),{handlers}),
    withTiming:(...args:unknown[])=>mockPullTiming(...args),withSpring:(...args:unknown[])=>mockPullSpring(...args),
    Easing:{out:(fn:unknown)=>fn,cubic:(value:number)=>value},
  };
});
jest.mock('../src/features/help/helpPhotoLibrary',()=>({
  getHelpPhotoPermission:(...args:unknown[])=>mockPermission(...args),loadHelpPhotoPage:(...args:unknown[])=>mockPage(...args),
  prepareHelpPhoto:(...args:unknown[])=>mockPrepare(...args),discardHelpPreparedPhoto:(...args:unknown[])=>mockDiscard(...args),
  getHelpPhotoPreviewUri:(...args:unknown[])=>mockPreviewUri(...args),presentHelpPhotoPermissions:jest.fn(),
}));
jest.mock('expo-image',()=>({Image:'ExpoImage'}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({panel:'#111',text:'#fff',muted:'#999',accent:'#38f',danger:'#f00',elevated:'#222'}),useHelpReducedMotion:()=>true}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevActions:()=>()=>{},helpDevRef:()=>{},helpDevState:()=>{}}));
jest.mock('../src/features/help/components/HelpPhotoCamera',()=>({HelpPhotoCamera:'HelpPhotoCamera'}));
jest.mock('../src/features/help/components/HelpPhotoPreview',()=>({HelpPhotoPreview:'HelpPhotoPreview'}));
jest.mock('../src/features/help/components/HelpNativeInput',()=>({hasNativeHelpInput:false,HelpNativeInput:'HelpNativeInput'}));
import {HelpPhotoPicker} from '../src/features/help/components/HelpPhotoPicker';
import type {HelpLibraryPhoto} from '../src/features/help/helpPhotoLibrary';
import type {HelpLocalFile} from '../src/features/help/components/HelpComposer';

const photos:HelpLibraryPhoto[]=Array.from({length:3},(_,i)=>({id:`asset:${i}`,uri:`content://photo/${i}`,name:`${i}.jpg`,width:600,height:800}));
const file=(index:number):HelpLocalFile=>({assetId:photos[index].id,uri:`file://documents/help-drafts/photo-${index}.jpg`,name:photos[index].name,mimeType:'image/jpeg',width:600,height:800,size:1024});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
let screen:TestRenderer.ReactTestRenderer|undefined,props:React.ComponentProps<typeof HelpPhotoPicker>;
const node={measureInWindow:(callback:(x:number,y:number,w:number,h:number)=>void)=>callback(12,20,100,100)};
async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpPhotoPicker,props),{createNodeMock:()=>node});});}
async function update(patch:Partial<typeof props>){props={...props,...patch};await act(async()=>screen!.update(React.createElement(HelpPhotoPicker,props)));}
async function press(label:string){
  // RN's Jest View owns its measure method; createNodeMock covers host refs.
  for(const view of screen!.root.findAll(item=>item.props.collapsable===false&&item.instance))view.instance.measureInWindow=node.measureInWindow;
  await act(async()=>screen!.root.findAll(item=>item.props.accessibilityLabel===label&&typeof item.props.onPress==='function')[0].props.onPress());
}
const preview=()=>screen!.root.findByType('HelpPhotoPreview' as any);
const camera=()=>screen!.root.findByType('HelpPhotoCamera' as any);
const onFiles=()=>props.onFiles as jest.Mock;

beforeEach(()=>{
  jest.clearAllMocks();
  mockPullTiming.mockImplementation((value,_options,callback)=>{callback?.(true);return value;});
  mockPullSpring.mockImplementation((value,_options,callback)=>{callback?.(true);return value;});
  jest.spyOn(Animated as any,'attachNativeEvent').mockReturnValue({detach:jest.fn()});
  jest.spyOn(PanResponder,'create').mockImplementation(config=>({panHandlers:config} as any));
  jest.spyOn(Animated,'timing').mockImplementation((value,config)=>({start:callback=>{(value as Animated.Value).setValue(config.toValue as number);callback?.({finished:true});},stop:jest.fn(),reset:jest.fn()}));
  mockPermission.mockResolvedValue({granted:true,limited:false,canAskAgain:true});mockPage.mockResolvedValue({photos,hasMore:false});
  mockPrepare.mockImplementation(async(photo:HelpLibraryPhoto)=>file(photos.findIndex(item=>item.id===photo.id)));
  mockDiscard.mockResolvedValue(undefined);mockPreviewUri.mockImplementation(async(photo:HelpLibraryPhoto)=>photo.uri);
  props={open:true,onClose:jest.fn(),files:[],onFiles:jest.fn(),caption:'',onCaption:jest.fn(),onSend:jest.fn().mockResolvedValue(true),onPreparing:jest.fn(),onError:jest.fn(),onDocuments:jest.fn(),busy:false,existingCount:0};
});
afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.restoreAllMocks();});

test('gallery regression: opens at sixty percent with caption after the grid and back preserving selection',async()=>{
  props.files=[file(0)];props.caption='Мой текст';await render();
  const panel=screen!.root.findAllByProps({testID:'help-photo-panel'})[0];
  expect(panel.props.style.height.__getValue()).toBeCloseTo(Math.min(Dimensions.get('window').height*.6,Dimensions.get('window').height-108));
  const children=panel.findAll(node=>['help-photo-grid-viewport','help-photo-caption'].includes(node.props.testID));
  expect(children[0].props.testID).toBe('help-photo-grid-viewport');expect(children[children.length-1].props.testID).toBe('help-photo-caption');
  expect(screen!.root.findByType(TextInput).props.value).toBe('Мой текст');
  await press('Назад к сообщению');expect(props.onClose).toHaveBeenCalledTimes(1);expect(props.onFiles).not.toHaveBeenCalled();
  await update({open:false});expect(props.onFiles).not.toHaveBeenCalled();
});

test('gallery regression: typing keeps gallery open and resizing never dismisses the caption keyboard',async()=>{
  const listeners:Record<string,(event:any)=>void>={};
  jest.spyOn(Keyboard,'addListener').mockImplementation((name,listener:any)=>{listeners[name]=listener;return{remove:jest.fn()};});
  const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});await render();expect(dismiss).toHaveBeenCalledTimes(1);
  await act(async()=>listeners.keyboardDidShow({endCoordinates:{height:280}}));
  expect(props.onClose).not.toHaveBeenCalled();expect(dismiss).toHaveBeenCalledTimes(1);
  await act(async()=>screen!.root.findByType(TextInput).props.onChangeText('Подпись'));expect(props.onCaption).toHaveBeenCalledWith('Подпись');
});

test('gallery regression: bottom send uses selected photos in their chosen order',async()=>{
  props.files=[file(1),file(0)];props.caption='Фото';await render();await press('Отправить фотографии: 2');
  expect(props.onSend).toHaveBeenCalledWith([file(1),file(0)]);expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('closed picker does not access library; opening checks permission and requests only when allowed to ask',async()=>{
  props.open=false;await render();expect(mockPermission).not.toHaveBeenCalled();expect(mockPage).not.toHaveBeenCalled();
  mockPermission.mockResolvedValueOnce({granted:false,limited:false,canAskAgain:true}).mockResolvedValueOnce({granted:true,limited:true,canAskAgain:true});
  await update({open:true});expect(mockPermission.mock.calls).toEqual([[false],[true]]);expect(mockPage).toHaveBeenCalledWith(0);
  expect(screen!.root.findAll(item=>item.children.includes('Открыты выбранные фото · Добавить ещё')).length).toBeGreaterThan(0);
});
test('asynchronous preparations retain the chosen order, even when the second photo finishes first',async()=>{
  const first=deferred<HelpLocalFile>(),second=deferred<HelpLocalFile>();mockPrepare.mockImplementation((photo:HelpLibraryPhoto)=>photo.id===photos[0].id?first.promise:second.promise);
  await render();await press('Выбрать фотографию 1');await press('Выбрать фотографию 2');
  expect(props.onPreparing).toHaveBeenLastCalledWith(true);
  await act(async()=>second.resolve(file(1)));expect(onFiles()).toHaveBeenLastCalledWith([file(1)]);
  await act(async()=>first.resolve(file(0)));expect(onFiles()).toHaveBeenLastCalledWith([file(0),file(1)]);expect(props.onPreparing).toHaveBeenLastCalledWith(false);
});
test('removing a pending photo prevents late resurrection and discards its unused durable copy',async()=>{
  const pending=deferred<HelpLocalFile>();mockPrepare.mockReturnValue(pending.promise);await render();await press('Выбрать фотографию 1');await press('Выбрать фотографию 1');
  await act(async()=>pending.resolve(file(0)));expect(onFiles()).toHaveBeenLastCalledWith([]);expect(mockDiscard).toHaveBeenCalledWith(file(0));
  expect(screen!.root.findAll(item=>item.props.accessibilityLabel==='Выбрать фотографию 1')[0].props.accessibilityState.checked).toBe(false);
});
test('attachment limit includes already uploaded attachments and non-photo draft files',async()=>{
  const document={uri:'file://guide.pdf',name:'guide.pdf',mimeType:'application/pdf'};props.files=[document];props.existingCount=8;await render();
  await press('Выбрать фотографию 1');await press('Выбрать фотографию 2');
  expect(mockPrepare).toHaveBeenCalledTimes(1);expect(onFiles()).toHaveBeenLastCalledWith([document,file(0)]);expect(camera().props.disabled).toBe(true);
  expect(screen!.root.findAll(item=>item.children.includes('В одном сообщении можно прикрепить до 10 файлов.')).length).toBeGreaterThan(0);
});
test('opening preview is separate from selecting and forwards measured origin and caption updates',async()=>{
  props.caption='Подпись';await render();await press('Открыть фотографию 2');
  expect(mockPrepare).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();expect(preview().props).toMatchObject({index:1,selectedIds:[],caption:'Подпись',origin:{x:12,y:20,width:100,height:100}});
  await act(async()=>preview().props.onCaption('Новая подпись'));expect(props.onCaption).toHaveBeenCalledWith('Новая подпись');
});
test('preview send with an empty selection prepares the current photo and passes explicit files',async()=>{
  await render();await press('Открыть фотографию 2');await act(async()=>preview().props.onSend(photos[1]));
  expect(mockPrepare).toHaveBeenCalledWith(photos[1]);expect(props.onSend).toHaveBeenCalledWith([file(1)]);expect(props.onClose).toHaveBeenCalledTimes(1);
});
test('preview send with a selection sends the ordered selection, not the currently viewed photo',async()=>{
  await render();await press('Выбрать фотографию 2');await press('Выбрать фотографию 1');await press('Открыть фотографию 3');await act(async()=>preview().props.onSend(photos[2]));
  expect(mockPrepare).toHaveBeenCalledTimes(2);expect(props.onSend).toHaveBeenCalledWith([file(1),file(0)]);
});
test('denied library permission does not request again and camera remains available',async()=>{
  mockPermission.mockResolvedValue({granted:false,limited:false,canAskAgain:false});await render();
  expect(mockPermission.mock.calls).toEqual([[false]]);expect(mockPage).not.toHaveBeenCalled();expect(camera().props.disabled).toBe(false);
  await act(async()=>camera().props.onExpand());expect(camera().props.expanded).toBe(true);
});
test('closing the tray preserves an in-flight choice for the same composer',async()=>{
  const pending=deferred<HelpLocalFile>();mockPrepare.mockReturnValue(pending.promise);await render();await press('Выбрать фотографию 1');await update({open:false});
  await act(async()=>pending.resolve(file(0)));expect(onFiles()).toHaveBeenCalledWith([file(0)]);expect(mockDiscard).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();
});
test('unmounting a composer during preparation cleans the late file without invoking either composer',async()=>{
  const pending=deferred<HelpLocalFile>();mockPrepare.mockReturnValue(pending.promise);await render();await press('Выбрать фотографию 1');
  const previous=props.onFiles as jest.Mock;previous.mockClear();await act(async()=>screen!.unmount());screen=undefined;
  props={...props,onFiles:jest.fn()};await render();await act(async()=>pending.resolve(file(0)));
  expect(previous).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();expect(mockDiscard).toHaveBeenCalledWith(file(0));
});
test('send failure retains preview and selected files for retry',async()=>{
  (props.onSend as jest.Mock).mockResolvedValue(false);await render();await press('Открыть фотографию 1');await act(async()=>preview().props.onSend(photos[0]));
  expect(props.onClose).not.toHaveBeenCalled();expect(preview().props.selectedIds).toEqual([photos[0].id]);expect(props.onFiles).toHaveBeenLastCalledWith([file(0)]);
});
test('a rejected current-photo preparation cannot resurrect a selection removed while send was pending',async()=>{
  const pending=deferred<HelpLocalFile>();mockPrepare.mockReturnValue(pending.promise);await render();await press('Открыть фотографию 1');
  let sending!:Promise<void>;await act(async()=>{sending=preview().props.onSend(photos[0]);});
  await press('Выбрать фотографию 1');
  await act(async()=>{pending.reject(new Error('Photo no longer available'));await sending;});
  expect(props.onFiles).toHaveBeenLastCalledWith([]);expect(props.onPreparing).toHaveBeenLastCalledWith(false);
  expect(preview().props.selectedIds).toEqual([]);expect(props.onSend).not.toHaveBeenCalled();
});
test('pending preparation blocks send until all selected photos are ready',async()=>{
  const pending=deferred<HelpLocalFile>();mockPrepare.mockReturnValue(pending.promise);await render();await press('Выбрать фотографию 1');await press('Открыть фотографию 2');
  expect(preview().props.busy).toBe(true);await act(async()=>preview().props.onSend(photos[1]));expect(props.onSend).not.toHaveBeenCalled();
  await act(async()=>pending.resolve(file(0)));await act(async()=>preview().props.onSend(photos[1]));expect(props.onSend).toHaveBeenCalledWith([file(0)]);
});

describe('gallery pull',()=>{
  const gesture=(kind='pan')=>screen!.root.findAllByType('GestureDetector' as any).find(item=>item.props.gesture.kind===kind)!.props.gesture;
  const manager=()=>({activate:jest.fn(),fail:jest.fn()});
  const touch=(x=50,y=50,count=1)=>({numberOfTouches:count,allTouches:[{absoluteX:x,absoluteY:y}]});
  const panel=()=>screen!.root.findAllByProps({testID:'help-photo-panel'})[0];
  const surface=()=>screen!.root.findAllByProps({testID:'help-photo-pull-surface'})[0];
  const grid=()=>screen!.root.findAllByProps({testID:'help-photo-grid'})[0];
  async function startPull(){const state=manager();await act(async()=>{gesture().handlers.onTouchesDown(touch(),state);gesture().handlers.onTouchesMove(touch(50,70),state);gesture().handlers.onStart();});return state;}
  test('native scroll waits for downward pull only; middle-list touch cannot transfer at the edge',async()=>{
    await render();expect(gesture('native').config.requireExternalGestureToFail).toBe(gesture());expect(gesture().config.manualActivation).toBe(true);
    await act(async()=>grid().props.onScroll({contentOffset:{y:120}}));
    const state=manager();act(()=>gesture().handlers.onTouchesDown(touch(),state));expect(state.fail).toHaveBeenCalledTimes(1);
    await act(async()=>grid().props.onScroll({contentOffset:{y:0}}));act(()=>gesture().handlers.onTouchesMove(touch(50,130),state));expect(state.activate).not.toHaveBeenCalled();
  });
  test.each([[50,30],[85,52]])('upward or horizontal movement fails without claiming normal scrolling (%s,%s)',async(x,y)=>{
    await render();const state=manager();act(()=>{gesture().handlers.onTouchesDown(touch(),state);gesture().handlers.onTouchesMove(touch(x,y),state);});
    expect(state.fail).toHaveBeenCalledTimes(1);expect(state.activate).not.toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
  });
  test('tap within slop does not activate and photo selection stays available',async()=>{
    await render();const state=manager();act(()=>{gesture().handlers.onTouchesDown(touch(),state);gesture().handlers.onTouchesMove(touch(51,53),state);gesture().handlers.onTouchesUp({},state);});
    expect(state.activate).not.toHaveBeenCalled();await press('Выбрать фотографию 1');expect(props.onFiles).toHaveBeenLastCalledWith([file(0)]);
  });
  test('short pull moves the whole surface without resizing grid and springs back with camera restored',async()=>{
    await render();const before=panel().props.style.height.__getValue();const state=await startPull();expect(state.activate).toHaveBeenCalledTimes(1);expect(camera().props.tileVisible).toBe(false);
    act(()=>gesture().handlers.onUpdate({translationY:32}));expect(surface().props.style[1].transform).toEqual([{translateY:32}]);expect(panel().props.style.height.__getValue()).toBe(before);
    await act(async()=>gesture().handlers.onEnd({velocityY:100},true));expect(mockPullSpring).toHaveBeenCalledWith(0,expect.objectContaining({overshootClamping:true}),expect.any(Function));
    expect(props.onClose).not.toHaveBeenCalled();expect(surface().props.style[1].transform).toEqual([{translateY:0}]);expect(camera().props.tileVisible).toBe(true);
  });
  test.each([{distance:180,velocity:100},{distance:30,velocity:1100}])('long or fast pull closes only after slide-out, preserves draft, and skips height collapse (%j)',async({distance,velocity})=>{
    props.files=[file(0)];props.caption='Не потерять';let finish!:()=>void;
    mockPullTiming.mockImplementation((value,_options,callback)=>{finish=()=>callback(true);return value;});
    await render();await startPull();act(()=>gesture().handlers.onUpdate({translationY:distance}));await act(async()=>gesture().handlers.onEnd({velocityY:velocity},true));
    expect(props.onClose).not.toHaveBeenCalled();expect(panel().props.style.height.__getValue()).toBeGreaterThan(0);
    await act(async()=>finish());expect(props.onClose).toHaveBeenCalledTimes(1);expect(screen!.root.findAllByProps({testID:'help-photo-panel'})).toHaveLength(0);
    expect(props.onFiles).not.toHaveBeenCalled();expect(props.onCaption).not.toHaveBeenCalled();expect(mockDiscard).not.toHaveBeenCalled();
    const calls=(Animated.timing as jest.Mock).mock.calls.length;await update({open:false});expect((Animated.timing as jest.Mock).mock.calls).toHaveLength(calls);
  });
  test('native cancellation returns the panel and does not close or mutate the draft',async()=>{
    await render();await startPull();act(()=>gesture().handlers.onUpdate({translationY:60}));await act(async()=>gesture().handlers.onFinalize({},false));
    expect(surface().props.style[1].transform).toEqual([{translateY:0}]);expect(props.onClose).not.toHaveBeenCalled();expect(props.onFiles).not.toHaveBeenCalled();expect(camera().props.tileVisible).toBe(true);
  });
  test('momentum and multitouch cannot become a close gesture',async()=>{
    await render();act(()=>grid().props.onScroll.handlers.onMomentumBegin());const momentum=manager();act(()=>gesture().handlers.onTouchesDown(touch(),momentum));expect(momentum.fail).toHaveBeenCalledTimes(1);
    act(()=>grid().props.onScroll.handlers.onMomentumEnd());const multi=manager();act(()=>gesture().handlers.onTouchesDown(touch(50,50,2),multi));expect(multi.fail).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
