import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Dimensions,Modal,StyleSheet} from 'react-native';
const mockPresent=jest.fn(),mockDismiss=jest.fn();
jest.mock('@gorhom/bottom-sheet',()=>({BottomSheetModal:require('react').forwardRef((props:any,ref:any)=>{require('react').useImperativeHandle(ref,()=>({present:mockPresent,dismiss:mockDismiss}));return require('react').createElement('BottomSheet',props,props.children);}),BottomSheetBackdrop:'BottomSheetBackdrop',BottomSheetScrollView:'BottomSheetScrollView'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:24,bottom:20,left:0,right:0})}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>true,useHelpTheme:()=>({background:'#fff'})}));
jest.mock('../src/features/help/components/HelpViewerLayout',()=>({HELP_VIEWER_HEADER_HEIGHT:80}));
jest.mock('../src/features/entityCards/EntityCardViewer',()=>({EntityCardViewer:(props:any)=>require('react').createElement('EntityViewer',{...props,windowControls:require('react').useContext(require('../src/features/help/helpViewerWindow').HelpViewerWindowContext)},props.children)}));
jest.mock('../src/features/entityCards/EntityCardBody',()=>({EntityCardBody:'EntityBody'}));
import NativeHost from '../src/features/entityCards/EntityCardHost';
import WebHost from '../src/features/entityCards/EntityCardHost.web';
import type {EntityCardHostProps} from '../src/features/entityCards/EntityCardHost.types';
const props:EntityCardHostProps={state:{account:'dev:121',session:1,sequence:1,closing:false,frames:[{key:1,kind:'entity',target:{v:1,source:'app',kind:'user',id:'121'},title:'Профиль',scrollOffset:0}]},userId:121,onBack:jest.fn(),onClose:jest.fn(),onDismiss:jest.fn(),onOpen:jest.fn(),onTitle:jest.fn(),onScroll:jest.fn(),onConnect:jest.fn()};
test.each([['native',NativeHost],['web',WebHost]] as const)('%s shell uses the same viewer with scrolling body inset and no separate header',async(kind,Host)=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(React.createElement(Host,props));});
 try{
  const viewer=view.root.findAll(node=>node.type==='EntityViewer')[0];expect(viewer.props.onBack).toBe(props.onBack);expect(viewer.props.bottomInset).toBe(20);expect(viewer.props.topInset).toBe(24);
  expect(view.root.findAll(node=>node.type==='EntityBody')[0].props.contentTopInset).toBe(104);
  const panel=view.root.findAll(node=>node.props.testID==='entity-card-panel')[0],style=StyleSheet.flatten(panel.props.style);expect(style.borderTopLeftRadius??0).toBe(0);expect(style.maxWidth).toBeUndefined();
  if(kind==='web')expect(style.top).toBe(0);
  if(kind==='native'){
   const sheet=view.root.findAll(node=>node.type==='BottomSheet')[0];expect(sheet.props.handleComponent).toBeNull();expect(sheet.props.enablePanDownToClose).toBe(true);expect(sheet.props.topInset).toBe(0);expect(sheet.props.enableContentPanningGesture).toBe(true);
   await act(async()=>viewer.props.onMenuOpenChange(true));expect(view.root.findAll(node=>node.type==='BottomSheet')[0].props.enableContentPanningGesture).toBe(false);
  }
 }finally{await act(async()=>view.unmount());}
});

test('web card panel resizes and expands in place and Escape dismisses menu before closing all cards',async()=>{
 const originalDimensions=Dimensions.get('window');Dimensions.set({window:{width:1440,height:900,scale:1,fontScale:1}});
 const onClose=jest.fn(),onBack=jest.fn();let view!:TestRenderer.ReactTestRenderer;
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(WebHost,{...props,onClose,onBack}));});
  const viewer=()=>view.root.findAll(node=>node.type==='EntityViewer')[0];
  const panel=()=>StyleSheet.flatten(view.root.findAll(node=>node.props.testID==='entity-card-panel')[0].props.style);
  expect(panel()).toMatchObject({top:16,left:704,width:720,height:868,borderRadius:20});
  expect(viewer().props.topInset).toBe(0);expect(viewer().props.bottomInset).toBe(0);
  expect(view.root.findAll(node=>node.type==='EntityBody')[0].props.contentTopInset).toBe(80);
  await act(async()=>viewer().props.windowControls.onToggleExpanded());
  expect(panel()).toMatchObject({top:0,left:0,width:1440,height:900,borderRadius:0});
  const dismissMenu=jest.fn(()=>true);viewer().props.windowControls.registerMenuDismiss(dismissMenu);
  await act(async()=>view.root.findByType(Modal).props.onRequestClose());
  expect(dismissMenu).toHaveBeenCalledTimes(1);expect(onClose).not.toHaveBeenCalled();expect(onBack).not.toHaveBeenCalled();
  dismissMenu.mockReturnValue(false);
  await act(async()=>view.root.findByType(Modal).props.onRequestClose());expect(onClose).toHaveBeenCalledTimes(1);expect(onBack).not.toHaveBeenCalled();
  await act(async()=>Dimensions.set({window:{width:390,height:844,scale:1,fontScale:1}}));
  expect(panel()).toMatchObject({top:0,left:0,width:390,height:844,borderRadius:0});
  expect(viewer().props.windowControls.canExpand).toBe(false);
  dismissMenu.mockReturnValue(true);viewer().props.windowControls.registerMenuDismiss(dismissMenu);
  await act(async()=>view.root.findByType(Modal).props.onRequestClose());expect(onClose).toHaveBeenCalledTimes(1);
 }finally{if(view)await act(async()=>view.unmount());Dimensions.set({window:originalDimensions});}
});
