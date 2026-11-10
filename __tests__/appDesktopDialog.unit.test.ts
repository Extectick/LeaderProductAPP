import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Modal} from 'react-native';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
import {AppDesktopDialog} from '../components/ui/AppDesktopDialog';

test('busy dismiss does not consume the close guard and reopening gets a fresh close',async()=>{
  const onClose=jest.fn();let tree!:Renderer.ReactTestRenderer;
  const render=(visible=true,dismissDisabled=false)=>React.createElement(AppDesktopDialog,{onClose,title:'Диалог',visible,dismissDisabled,children:null});
  await act(async()=>{tree=Renderer.create(render(true,true));});
  try{
    await act(async()=>{tree.root.findByType(Modal).props.onRequestClose();tree.root.findByProps({testID:'app-desktop-dialog-dismiss'}).props.onPointerDown();});
    expect(onClose).not.toHaveBeenCalled();
    await act(async()=>tree.update(render()));
    await act(async()=>{tree.root.findByType(Modal).props.onRequestClose();tree.root.findByProps({testID:'app-desktop-dialog-close'}).props.onPress();});
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async()=>tree.update(render(false)));await act(async()=>tree.update(render()));
    await act(async()=>tree.root.findByType(Modal).props.onRequestClose());expect(onClose).toHaveBeenCalledTimes(2);
  }finally{await act(async()=>tree.unmount());}
});

test.each(['enabled','disabled','detached'] as const)('editor return focus waits for Modal cleanup and checks the %s composer',async state=>{
  const focus=jest.fn(),target={focus,isConnected:state!=='detached',disabled:state==='disabled'};
  const returnFocusRef={current:target},initialFocusRef={current:{focus:jest.fn()}},frames:FrameRequestCallback[]=[];
  const raf=jest.spyOn(global,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
  let tree!:Renderer.ReactTestRenderer;
  try{
    await act(async()=>{tree=Renderer.create(React.createElement(AppDesktopDialog,{onClose:jest.fn(),initialFocusRef,returnFocusRef,children:null}));});
    await act(async()=>tree.root.findByType(Modal).props.onShow());expect(initialFocusRef.current.focus).toHaveBeenCalledTimes(1);
    await act(async()=>tree.unmount());expect(focus).not.toHaveBeenCalled();
    await act(async()=>{for(const frame of frames)frame(1);});expect(focus).toHaveBeenCalledTimes(state==='enabled'?1:0);
  }finally{raf.mockRestore();}
});
