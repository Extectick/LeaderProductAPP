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
    expect(props.dockId).toBe('dock');expect(props.viewportId).toBe('');expect(props.manageIme).toBe(true);
  });
  test.each([undefined,1,2,3])('sends the OTA motion policy only to atomic native ABI (%s)',async(version)=>{
    mockNativeModule={imeInsetsVersion:5,tailMotionVersion:version};
    let Component!:React.ComponentType<any>;
    jest.isolateModules(()=>{const module=require('../src/features/help/components/HelpNativeChatLayout');Component=module.HelpNativeChatLayout;expect(module.hasNativeAtomicTailMotion).toBe(version===3);});
    await act(async()=>{tree=TestRenderer.create(React.createElement(Component,{scrollId:'scroll',dockId:'dock',animateTail:version===3}));});
    const props=tree!.root.findByType('NativeChatLayout' as any).props;
    if(version===3)expect(props.tailMotionConfig).toEqual({version:1,enabled:true,durationMs:220,curve:'spring',maxViewport:1,entryDistanceDp:24});
    else expect(props).not.toHaveProperty('tailMotionConfig');
    if(version)expect(props.reducedMotion).toBe(version!==3);
    else expect(props).not.toHaveProperty('reducedMotion');
  });
});
