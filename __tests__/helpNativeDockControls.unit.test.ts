import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';

let mockNativeModule:any;
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('expo-modules-core',()=>({requireOptionalNativeModule:()=>mockNativeModule,requireNativeViewManager:()=> 'NativeChatLayout'}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevActions:()=>()=>{},helpDevProbe:()=>()=>{}}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>false}));

describe('native dock controls ABI compatibility',()=>{
  let tree:TestRenderer.ReactTestRenderer|undefined;
  beforeEach(()=>{jest.doMock('react',()=>React);});
  afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;jest.restoreAllMocks();});
  test.each([false,true])('passes controlsId only when native capability exists (%s)',async(capable)=>{
    mockNativeModule={imeInsetsVersion:5,tailMotionVersion:2,...(capable?{dockControlsVersion:1}:{})};
    let Component!:React.ComponentType<any>;
    jest.isolateModules(()=>{const module=require('../src/features/help/components/HelpNativeChatLayout');Component=module.HelpNativeChatLayout;expect(module.hasNativeDockControls).toBe(capable);});
    await act(async()=>{tree=TestRenderer.create(React.createElement(Component,{scrollId:'scroll',dockId:'dock',controlsId:'controls',viewportId:'viewport'}));});
    const props=tree!.root.findByType('NativeChatLayout' as any).props;
    expect(props.controlsId).toBe(capable?'controls':undefined);
    expect(props.dockId).toBe('dock');expect(props.viewportId).toBe('viewport');expect(props.manageIme).toBe(true);
  });
});
