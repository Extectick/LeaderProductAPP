import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Dimensions,Modal,Platform,TextInput} from 'react-native';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:24,bottom:34,left:0,right:0})}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>require('../components/ui/appSurfaceTokens').appSurfaceTokens(false)}));
import {HelpExpandedEditor} from '../src/features/help/components/HelpExpandedEditor';
import {AppDesktopDialog} from '../components/ui/AppDesktopDialog';

test.each(['web','android'])('%s expanded editor preserves text and selection without sending',async platform=>{
  const previousPlatform=Platform.OS,window=Dimensions.get('window');let tree!:Renderer.ReactTestRenderer;
  Object.defineProperty(Platform,'OS',{configurable:true,value:platform});Dimensions.set({window:{width:1280,height:800,scale:1,fontScale:1}});
  const onChange=jest.fn(),onDone=jest.fn();
  try{
    await act(async()=>{tree=Renderer.create(React.createElement(HelpExpandedEditor,{value:'Draft',selection:{start:2,end:4},onChange,onDone}));});
    if(platform==='web')expect(tree.root.findByType(AppDesktopDialog).props).toMatchObject({maxWidth:760,height:640,scrollable:false});
    else expect(tree.root.findAllByType(AppDesktopDialog)).toHaveLength(0);
    await act(async()=>{tree.root.findByType(TextInput).props.onChangeText('Edited draft');tree.root.findByType(TextInput).props.onSelectionChange({nativeEvent:{selection:{start:3,end:8}}});});
    expect(onChange).toHaveBeenCalledWith('Edited draft');expect(onDone).not.toHaveBeenCalled();
    await act(async()=>tree.root.findByType(Modal).props.onRequestClose());
    expect(onDone).toHaveBeenCalledWith({start:3,end:8});
  }finally{if(tree)await act(async()=>tree.unmount());Object.defineProperty(Platform,'OS',{configurable:true,value:previousPlatform});Dimensions.set({window});}
});
