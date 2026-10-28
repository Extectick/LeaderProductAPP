import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,PanResponder,StyleSheet} from 'react-native';
let mockReduced=true;
let mockPan:any;
const mockActions:Record<string,Record<string,(value?:unknown)=>unknown>>={};
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('expo-image',()=>({Image:'ExpoImage'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:20,bottom:10,left:0,right:0})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced,useHelpTheme:()=>({accent:'#398DFF'})}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevState:jest.fn(),helpDevActions:(owner:string,actions:any)=>{mockActions[owner]=actions;return()=>delete mockActions[owner];}}));
import {HelpPhotoPreview,type HelpPhotoPreviewProps} from '../src/features/help/components/HelpPhotoPreview';

describe('photo preview draft interactions',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined,props:HelpPhotoPreviewProps;
  const photos=Array.from({length:7},(_,index)=>({id:`photo-${index}`,uri:`file:///photo-${index}.jpg`,name:`Фото ${index}`,width:1200,height:800}));
  beforeEach(()=>{mockReduced=true;props={photos,index:2,selectedIds:['photo-2'],caption:'Подпись',onCaption:jest.fn(),onToggle:jest.fn(),onSend:jest.fn().mockResolvedValue(undefined),onClose:jest.fn(),busy:false,origin:{x:110,y:600,width:120,height:120}};jest.spyOn(PanResponder,'create').mockImplementation((config:any)=>{mockPan=config;return{panHandlers:{}} as any;});});
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.restoreAllMocks();});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpPhotoPreview,props));});}
  const control=(label:string)=>screen!.root.findAllByProps({accessibilityLabel:label}).find(node=>node.props.onPress)!;
  const identified=(id:string)=>screen!.root.findAllByProps({testID:id}).find(node=>node.props.onPress||id==='help-photo-preview-caption')!;
  const transitionStyle=()=>StyleSheet.flatten(screen!.root.findAllByProps({testID:'help-photo-preview-transition'})[0].props.style);
  const transformValue=(key:string)=>transitionStyle().transform.find((entry:any)=>key in entry)[key].__getValue();
  test('drag close regression: native touch surface claims touch and ignores initial horizontal jitter',async()=>{
    await render();
    const touch={nativeEvent:{touches:[{pageX:140,pageY:200}]}};
    const surface=screen!.root.findAllByProps({testID:'help-photo-preview-gesture'})[0];
    expect(surface.props).toMatchObject({collapsable:false,pointerEvents:'box-only'});
    expect(mockPan.onStartShouldSetPanResponder(touch)).toBe(true);
    await act(async()=>screen!.root.findAllByProps({testID:'help-photo-preview-stage'})[0].props.onLayout({nativeEvent:{layout:{width:300,height:600,y:70}}}));
    await act(async()=>{mockPan.onPanResponderGrant(touch);mockPan.onPanResponderMove(touch,{dx:4,dy:1});mockPan.onPanResponderMove(touch,{dx:2,dy:100});});
    expect(transformValue('translateY')).toBe(100);expect(transformValue('scale')).toBeLessThan(.9);
    expect(props.onClose).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();
    await act(async()=>mockPan.onPanResponderRelease(touch,{dx:2,dy:125,vx:0,vy:0}));expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  test('drag close regression: a short pull springs back without changing photo or selection',async()=>{
    await render();const touch={nativeEvent:{touches:[{pageX:100,pageY:200}]}};
    await act(async()=>{mockPan.onPanResponderGrant(touch);mockPan.onPanResponderMove(touch,{dx:10,dy:35});mockPan.onPanResponderRelease(touch,{dx:10,dy:35,vx:0,vy:0});});
    expect(transformValue('translateY')).toBe(0);expect(transformValue('translateX')).toBe(0);expect(transformValue('scale')).toBe(1);
    expect(props.onClose).not.toHaveBeenCalled();expect(props.onToggle).not.toHaveBeenCalled();
    expect(screen!.root.findByProps({testID:'help-photo-preview-image'}).props.source.uri).toBe(photos[2].uri);
  });
  test.each([true,false])('drag close regression: closes after animation completes, with thumbnail origin=%s',async(hasOrigin)=>{
    mockReduced=false;if(!hasOrigin)props.origin=undefined;
    let finishClose:undefined|(()=>void);
    jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>({start:(done?:any)=>{value.setValue(config.toValue);done?.({finished:true});},stop:jest.fn(),reset:jest.fn()} as any));
    jest.spyOn(Animated,'parallel').mockImplementation((animations:any)=>({start:(done?:any)=>{finishClose=()=>{animations.forEach((animation:any)=>animation.start());done?.({finished:true});};},stop:jest.fn(),reset:jest.fn()} as any));
    await render();const touch={nativeEvent:{touches:[{pageX:100,pageY:200}]}};
    await act(async()=>{mockPan.onPanResponderGrant(touch);mockPan.onPanResponderMove(touch,{dx:10,dy:150});mockPan.onPanResponderRelease(touch,{dx:10,dy:150,vx:0,vy:.4});});
    expect(transformValue('translateY')).toBe(150);expect(transformValue('scale')).toBeLessThan(1);
    expect(props.onClose).not.toHaveBeenCalled();expect(finishClose).toBeDefined();
    await act(async()=>finishClose!());expect(props.onClose).toHaveBeenCalledTimes(1);
    if(hasOrigin)expect(transformValue('scale')).toBeLessThan(.5);else expect(transitionStyle().opacity.__getValue()).toBe(0);
    expect(props.onToggle).not.toHaveBeenCalled();expect(props.onSend).not.toHaveBeenCalled();
  });
  test('drag close regression: a long pull never darkens the background again while returning to its tile',async()=>{
    mockReduced=false;
    jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>({start:()=>value.setValue((value.__getValue()+config.toValue)/2),stop:jest.fn(),reset:jest.fn()} as any));
    jest.spyOn(Animated,'parallel').mockImplementation((animations:any)=>({start:()=>animations.forEach((animation:any)=>animation.start()),stop:jest.fn(),reset:jest.fn()} as any));
    await render();await act(async()=>screen!.root.findAllByProps({testID:'help-photo-preview-stage'})[0].props.onLayout({nativeEvent:{layout:{width:300,height:600,y:70}}}));
    const touch={nativeEvent:{touches:[{pageX:100,pageY:200}]}};
    const opacity=()=>StyleSheet.flatten(screen!.root.findAllByProps({testID:'help-photo-preview-backdrop'})[0].props.style).opacity.__getValue();
    await act(async()=>{mockPan.onPanResponderGrant(touch);mockPan.onPanResponderMove(touch,{dx:2,dy:400});});expect(opacity()).toBe(0);
    await act(async()=>mockPan.onPanResponderRelease(touch,{dx:2,dy:400,vx:0,vy:0}));
    expect(opacity()).toBe(0);expect(props.onClose).not.toHaveBeenCalled();expect(mockPan.onStartShouldSetPanResponder(touch)).toBe(false);
  });
  test.each([{selectedIds:[]},{selectedIds:['photo-2']},{selectedIds:['photo-0','photo-2']}])('send badge regression: shows actual count for $selectedIds and uses app arrow',async({selectedIds})=>{
    props.selectedIds=selectedIds;await render();const count=selectedIds.length||1;
    const send=identified('help-photo-preview-send');expect(send.props.accessibilityLabel).toBe(`Отправить ${count} фото`);
    const badge=send.findAllByProps({testID:'help-photo-preview-send-count'})[0];expect(badge.findAll(node=>node.children.includes(String(count))).length).toBeGreaterThan(0);
    expect(send.findAllByType('Ionicons' as any).map(icon=>icon.props.name)).toEqual(['arrow-up']);
  });
  test('only current and neighboring photos mount; selection order and shared caption are controlled',async()=>{
    await render();expect(screen!.root.findAllByType('ExpoImage' as any)).toHaveLength(3);
    const select=identified('help-photo-preview-select');expect(select.props.accessibilityLabel).toContain('номер 1');
    await act(async()=>select.props.onPress());expect(props.onToggle).toHaveBeenCalledWith(photos[2]);
    await act(async()=>identified('help-photo-preview-caption').props.onChangeText('Общая подпись'));expect(props.onCaption).toHaveBeenCalledWith('Общая подпись');
    await act(async()=>control('Следующее фото').props.onPress());expect(screen!.root.findByProps({testID:'help-photo-preview-image'}).props.source.uri).toBe(photos[3].uri);
    expect(identified('help-photo-preview-caption').props.value).toBe('Подпись');expect(props.onSend).not.toHaveBeenCalled();
  });
  test('selection limit blocks adding but allows removing the selected photo',async()=>{
    props.limitReached=true;await render();expect(identified('help-photo-preview-select').props.disabled).toBe(false);
    await act(async()=>control('Следующее фото').props.onPress());expect(identified('help-photo-preview-select').props.disabled).toBe(true);
    await act(async()=>mockActions['photo-preview']['photo.preview.toggle']());expect(props.onToggle).not.toHaveBeenCalled();
    await act(async()=>control('Предыдущее фото').props.onPress());await act(async()=>identified('help-photo-preview-select').props.onPress());expect(props.onToggle).toHaveBeenCalledWith(photos[2]);
  });
  test('one send stays locked until completion and reports failure without losing the draft',async()=>{
    let reject!:(error:Error)=>void;props.onSend=jest.fn(()=>new Promise<void>((_,fail)=>{reject=fail;}));await render();
    await act(async()=>{identified('help-photo-preview-send').props.onPress();identified('help-photo-preview-send').props.onPress();});
    expect(props.onSend).toHaveBeenCalledTimes(1);expect(identified('help-photo-preview-send').props.disabled).toBe(true);
    await act(async()=>reject(new Error('private URL must not be displayed')));
    expect(screen!.root.findAllByProps({accessibilityRole:'alert'})[0].props.children).toBe('Не удалось отправить фото. Попробуйте ещё раз.');
    expect(identified('help-photo-preview-caption').props.value).toBe('Подпись');expect(props.onClose).not.toHaveBeenCalled();
  });
  test('external preparation failure blocks sending but the failed photo can be deselected',async()=>{
    props.error='Не удалось подготовить фото';props.sendDisabled=true;await render();
    expect(identified('help-photo-preview-send').props.disabled).toBe(true);expect(identified('help-photo-preview-select').props.disabled).toBe(false);
    await act(async()=>identified('help-photo-preview-select').props.onPress());expect(props.onToggle).toHaveBeenCalledWith(photos[2]);
    await act(async()=>mockActions['photo-preview']['photo.preview.send']());expect(props.onSend).not.toHaveBeenCalled();
  });
  test('horizontal swipe changes only the current photo; downward swipe closes without sending',async()=>{
    await render();const touch={nativeEvent:{touches:[{pageX:0,pageY:0}]}};
    await act(async()=>{mockPan.onPanResponderGrant(touch);mockPan.onPanResponderMove(touch,{dx:-250,dy:3});mockPan.onPanResponderRelease(touch,{dx:-250,dy:3,vx:-1,vy:0});});
    expect(screen!.root.findByProps({testID:'help-photo-preview-image'}).props.source.uri).toBe(photos[3].uri);
    await act(async()=>{mockPan.onPanResponderGrant(touch);mockPan.onPanResponderMove(touch,{dx:2,dy:150});mockPan.onPanResponderRelease(touch,{dx:2,dy:150,vx:0,vy:1});});
    expect(props.onClose).toHaveBeenCalledTimes(1);expect(props.onSend).not.toHaveBeenCalled();
  });
  test('pinch zoom takes precedence over paging and dismiss gestures',async()=>{
    await render();const two=(distance:number)=>({nativeEvent:{touches:[{pageX:0,pageY:0},{pageX:distance,pageY:0}]}}),one={nativeEvent:{touches:[{pageX:0,pageY:0}]}};
    await act(async()=>{mockPan.onPanResponderGrant(two(20));mockPan.onPanResponderMove(two(50),{dx:0,dy:0});mockPan.onPanResponderRelease(two(50),{dx:0,dy:0,vx:0,vy:0});});
    expect(require('../src/features/help/helpDiagnostics').helpDevState).toHaveBeenLastCalledWith(expect.objectContaining({photoPreviewZoomed:true}));
    await act(async()=>{mockPan.onPanResponderGrant(one);mockPan.onPanResponderMove(one,{dx:-250,dy:160});mockPan.onPanResponderRelease(one,{dx:-250,dy:160,vx:-1,vy:1});});
    expect(screen!.root.findByProps({testID:'help-photo-preview-image'}).props.source.uri).toBe(photos[2].uri);expect(props.onClose).not.toHaveBeenCalled();
  });
  test('return to thumbnail uses a uniform scale and animation honors reduced motion',async()=>{
    mockReduced=false;const timings:any[]=[];
    jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>{timings.push(config);return{start:(done?:any)=>done?.({finished:true}),stop:jest.fn(),reset:jest.fn()} as any;});
    jest.spyOn(Animated,'parallel').mockImplementation((animations:any)=>({start:(done?:any)=>{animations.forEach((animation:any)=>animation.start());done?.({finished:true});},stop:jest.fn(),reset:jest.fn()} as any));
    await render();const transition=screen!.root.findAllByProps({testID:'help-photo-preview-transition'})[0];
    const transforms=StyleSheet.flatten(transition.props.style).transform;
    expect(transforms.some((item:any)=>'scale'in item)).toBe(true);expect(transforms.some((item:any)=>'scaleX'in item||'scaleY'in item)).toBe(false);
    await act(async()=>control('Закрыть просмотр фото').props.onPress());expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(timings.filter(config=>config.duration===210).every(config=>config.useNativeDriver)).toBe(true);
  });
  test('next and previous preserve transform arrays for current and neighboring photos without a zoom button',async()=>{
    await render();
    const checkCells=()=>{
      const cells=screen!.root.findAllByProps({testID:'help-photo-preview-cell'});
      expect(cells.length).toBeGreaterThanOrEqual(3);
      for(const cell of cells){
        const transforms=StyleSheet.flatten(cell.props.style).transform;
        expect(Array.isArray(transforms)).toBe(true);
        expect(transforms.map((item:any)=>Object.keys(item)[0])).toEqual(['translateX','translateY','scale']);
        for(const item of transforms)expect(Object.values(item)[0]).not.toBeNull();
        for(const item of transforms)expect(Object.values(item)[0]).not.toBeUndefined();
      }
      expect(screen!.root.findAll(node=>node.props.accessibilityLabel==='Увеличить фото'||node.props.accessibilityLabel==='Сбросить масштаб фото')).toHaveLength(0);
    };
    checkCells();
    await act(async()=>control('Следующее фото').props.onPress());checkCells();
    expect(screen!.root.findByProps({testID:'help-photo-preview-image'}).props.source.uri).toBe(photos[3].uri);
    await act(async()=>control('Предыдущее фото').props.onPress());checkCells();
    expect(screen!.root.findByProps({testID:'help-photo-preview-image'}).props.source.uri).toBe(photos[2].uri);
  });
  test('loading finishes only for the loaded image and failures stay inside the viewer',async()=>{
    await render();expect(screen!.root.findAllByProps({testID:'help-photo-preview-loading'}).length).toBeGreaterThan(0);
    await act(async()=>screen!.root.findByProps({testID:'help-photo-preview-image'}).props.onLoad());expect(screen!.root.findAllByProps({testID:'help-photo-preview-loading'})).toHaveLength(0);
    await act(async()=>control('Следующее фото').props.onPress());await act(async()=>screen!.root.findByProps({testID:'help-photo-preview-image'}).props.onError());
    expect(screen!.root.findAllByProps({accessibilityRole:'alert'})[0].props.children).toContain('Не удалось загрузить фото');
  });
  test('empty photo list remains closable and cannot send',async()=>{
    props.photos=[];props.index=500;await render();expect(identified('help-photo-preview-send').props.disabled).toBe(true);
    await act(async()=>control('Закрыть просмотр фото').props.onPress());expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  test('diagnostic actions use current handlers and contain no image or caption values',async()=>{
    await render();const updated=jest.fn();props={...props,onToggle:updated};await act(async()=>screen!.update(React.createElement(HelpPhotoPreview,props)));
    await act(async()=>mockActions['photo-preview']['photo.preview.toggle']());expect(updated).toHaveBeenCalledWith(photos[2]);
    const state=require('../src/features/help/helpDiagnostics').helpDevState;
    expect(JSON.stringify(state.mock.calls)).not.toContain('file:');expect(JSON.stringify(state.mock.calls)).not.toContain('Подпись');
  });
});
