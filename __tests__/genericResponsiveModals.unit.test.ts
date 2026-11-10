import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Modal,Platform,Text} from 'react-native';

jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:0,left:0,right:0,bottom:0})}));
jest.mock('react-native-gesture-handler',()=>({GestureDetector:'GestureDetector',Gesture:{Pan:()=>{const gesture:any={};gesture.onUpdate=gesture.onEnd=()=>gesture;return gesture;}}}));
jest.mock('react-native-reanimated',()=>({
  __esModule:true,default:{View:require('react-native').View},FadeInDown:{delay:()=>undefined},runOnJS:(callback:unknown)=>callback,
  useSharedValue:(value:unknown)=>require('react').useRef({value}).current,useAnimatedStyle:(callback:()=>unknown)=>callback(),withTiming:(value:unknown)=>value,withSpring:(value:unknown)=>value,
}));

import ActionSheet from '../components/ActionSheet/ActionSheet';
import CenteredModal from '../components/CenteredModal';
import {AppDesktopDialog} from '../components/ui/AppDesktopDialog';

describe('generic responsive dialogs',()=>{
  const originalPlatform=Platform.OS;
  let tree:TestRenderer.ReactTestRenderer|undefined;
  let window:jest.SpyInstance;
  beforeEach(()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
    window=jest.spyOn(require('react-native'),'useWindowDimensions').mockReturnValue({width:1440,height:800,scale:1,fontScale:1});
  });
  afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;window.mockRestore();Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform});});
  const button=(label:string)=>tree!.root.findAll(node=>typeof node.props.onPress==='function'&&node.props.accessibilityLabel===label)[0];
  async function render(element:React.ReactElement){await act(async()=>{tree=TestRenderer.create(element);});}

  test('desktop action executes before closing, once, and a later visible session can act again',async()=>{
    const calls:string[]=[],action=jest.fn(()=>calls.push('action')),close=jest.fn(()=>calls.push('close'));
    const props={visible:true,onClose:close,buttons:[{title:'Редактировать',onPress:action}]};
    await render(React.createElement(ActionSheet,props));
    const choice=button('Редактировать');
    await act(async()=>{choice.props.onPress();choice.props.onPress();tree!.root.findByType(Modal).props.onRequestClose();});
    expect(calls).toEqual(['action','close']);
    await act(async()=>tree!.update(React.createElement(ActionSheet,{...props,visible:false})));
    await act(async()=>tree!.update(React.createElement(ActionSheet,props)));
    await act(async()=>button('Редактировать').props.onPress());
    expect(action).toHaveBeenCalledTimes(2);expect(close).toHaveBeenCalledTimes(2);
  });
  test('desktop cancel, backdrop and Escape share one close and never run an action',async()=>{
    const action=jest.fn(),close=jest.fn();
    await render(React.createElement(ActionSheet,{visible:true,onClose:close,buttons:[{title:'Удалить',destructive:true,onPress:action}]}));
    await act(async()=>{
      button('Отмена').props.onPress();
      tree!.root.findByProps({testID:'action-sheet-dialog-dismiss'}).props.onPointerDown();
      tree!.root.findByType(Modal).props.onRequestClose();
    });
    expect(close).toHaveBeenCalledTimes(1);expect(action).not.toHaveBeenCalled();
  });
  test('long desktop action lists scroll while cancel remains outside the scroll body',async()=>{
    await render(React.createElement(ActionSheet,{visible:true,onClose:jest.fn(),buttons:Array.from({length:40},(_,index)=>({title:`Действие ${index+1}`,onPress:jest.fn()}))}));
    const content=tree!.root.findByProps({testID:'action-sheet-dialog-content'});
    expect(content.findAll(node=>typeof node.props.onPress==='function'&&String(node.props.accessibilityLabel).startsWith('Действие '))).toHaveLength(40);
    expect(content.findAll(node=>node.props.accessibilityLabel==='Отмена')).toHaveLength(0);
    expect(button('Отмена')).toBeDefined();
  });
  test.each(['web','android'] as const)('%s compact cancel preserves the sheet and closes only once',async platform=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:platform});window.mockReturnValue({width:390,height:800,scale:1,fontScale:1});
    const close=jest.fn();await render(React.createElement(ActionSheet,{visible:true,onClose:close,buttons:[]}));
    expect(tree!.root.findAllByType(AppDesktopDialog)).toHaveLength(0);
    await act(async()=>tree!.root.findAll(node=>typeof node.props.onPress==='function').at(-1)!.props.onPress());
    expect(close).toHaveBeenCalledTimes(1);
  });
  test('CenteredModal preserves children and close semantics in the shared desktop window, with mobile fallback',async()=>{
    const close=jest.fn(),content=React.createElement(Text,null,'Содержимое');
    await render(React.createElement(CenteredModal,{visible:true,onClose:close},content));
    expect(tree!.root.findByType(AppDesktopDialog).props.children).toBe(content);
    await act(async()=>{tree!.root.findByType(Modal).props.onRequestClose();button('Закрыть диалог').props.onPress();});
    expect(close).toHaveBeenCalledTimes(1);
    window.mockReturnValue({width:390,height:800,scale:1,fontScale:1});
    await act(async()=>tree!.update(React.createElement(CenteredModal,{visible:true,onClose:close},content)));
    expect(tree!.root.findAllByType(AppDesktopDialog)).toHaveLength(0);
    expect(tree!.root.findByType(Modal).props.animationType).toBe('fade');
  });
});
