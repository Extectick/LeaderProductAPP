import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Platform,StyleSheet} from 'react-native';

let mockFocused=true;
let mockMissingFocusContext=false;
const mockCaptures:string[]=[];
jest.mock('expo-router/react-navigation',()=>({useIsFocused:()=>{if(mockMissingFocusContext)throw new Error('Missing route focus context');return mockFocused;}}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:()=>'#F7F9FC'}));
jest.mock('expo-blur',()=>({
  BlurTargetView:'BlurTargetView',
  BlurView:({blurTarget,...props}:any)=>{mockCaptures.push(blurTarget?.current?.id??'none');return require('react').createElement('BlurView',{...props,blurTarget});},
}));
jest.mock('@react-native-masked-view/masked-view',()=>({__esModule:true,default:'MaskedView'}));
jest.mock('expo-linear-gradient',()=>({LinearGradient:'LinearGradient'}));
import {AppBlurActivityContext,AppEdgeBlur} from '../components/ui/AppScreenBlur';

let tree:Renderer.ReactTestRenderer;
beforeEach(()=>{mockFocused=true;mockMissingFocusContext=false;mockCaptures.length=0;jest.replaceProperty(Platform,'OS','android');});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());jest.restoreAllMocks();});
async function mount(target:any){
  await act(async()=>{tree=Renderer.create(React.createElement(AppEdgeBlur,{target,backgroundColor:'#F7F9FC'}));});
  await act(async()=>tree.root.findByType('MaskedView' as any).props.onLayout({nativeEvent:{layout:{width:390,height:110}}}));
}
test('retained outgoing scene removes capture immediately on focus loss and restores it on return',async()=>{
  const target={current:{id:'help'}};await mount(target);
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
  mockFocused=false;await act(async()=>tree.update(React.createElement(AppEdgeBlur,{target,backgroundColor:'#F7F9FC'})));
  expect(tree.toJSON()).toBeNull();
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(0);
  mockFocused=true;await act(async()=>tree.update(React.createElement(AppEdgeBlur,{target,backgroundColor:'#F7F9FC'})));
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
});
test('an active portal captures its own target without a navigation focus context',async()=>{
  mockMissingFocusContext=true;mockFocused=false;
  const target={current:{id:'portal'}};
  await act(async()=>{tree=Renderer.create(React.createElement(AppBlurActivityContext.Provider,{value:true},React.createElement(AppEdgeBlur,{target})));});
  await act(async()=>tree.root.findByType('MaskedView' as any).props.onLayout({nativeEvent:{layout:{width:390,height:110}}}));
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
  expect(mockCaptures).toEqual(['portal']);
});
test('portal activity releases capture immediately and restores only its current target',async()=>{
  mockMissingFocusContext=true;
  const target={current:{id:'old-portal'}};
  const content=(active:boolean)=>React.createElement(AppBlurActivityContext.Provider,{value:active},React.createElement(AppEdgeBlur,{target}));
  await act(async()=>{tree=Renderer.create(content(true));});
  await act(async()=>tree.root.findByType('MaskedView' as any).props.onLayout({nativeEvent:{layout:{width:390,height:110}}}));
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
  mockCaptures.length=0;
  await act(async()=>tree.update(content(false)));
  expect(tree.toJSON()).toBeNull();expect(mockCaptures).toEqual([]);
  target.current={id:'new-portal'};
  await act(async()=>tree.update(content(true)));
  expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
  expect(mockCaptures.length).toBeGreaterThan(0);
  expect(mockCaptures.every(id=>id==='new-portal')).toBe(true);
});
test('a portal activity override does not activate an unfocused route sibling',async()=>{
  mockFocused=false;
  await act(async()=>{tree=Renderer.create(React.createElement(React.Fragment,null,
    React.createElement(AppBlurActivityContext.Provider,{value:true},React.createElement(AppEdgeBlur,{target:{current:{id:'portal'} as any},testID:'portal-blur'})),
    React.createElement(AppEdgeBlur,{target:{current:{id:'route'} as any},testID:'route-blur'})));
  });
  expect(tree.root.findAllByProps({testID:'route-blur'}).filter(node=>node.type==='MaskedView')).toHaveLength(0);
  expect(tree.root.findAllByType('MaskedView' as any)).toHaveLength(1);
  expect(tree.root.findByType('MaskedView' as any).props.testID).toBe('portal-blur');
});
test('target replacement never renders a capture of the preceding screen',async()=>{
  const target={current:{id:'help'}};await mount(target);mockCaptures.length=0;
  target.current={id:'catalogue'};
  await act(async()=>tree.update(React.createElement(AppEdgeBlur,{target,backgroundColor:'#F7F9FC'})));
  expect(mockCaptures.length).toBeGreaterThan(0);
  expect(mockCaptures.every(id=>id==='catalogue')).toBe(true);
  mockCaptures.length=0;target.current=null as any;
  await act(async()=>tree.update(React.createElement(AppEdgeBlur,{target,backgroundColor:'#F7F9FC'})));
  expect(mockCaptures).toEqual([]);
  expect(tree.root.findByProps({testID:'app-blur-preparing'}).props.style).toBeDefined();
});

test.each(['top','bottom'] as const)('short %s surface fits its feather inside the measured bounds',async edge=>{
  await act(async()=>{tree=Renderer.create(React.createElement(AppEdgeBlur,{target:{current:{id:'help'} as any},edge,featherSize:104}));});
  await act(async()=>tree.root.findByType('MaskedView' as any).props.onLayout({nativeEvent:{layout:{width:390,height:48}}}));
  const mask=tree.root.findByType('MaskedView' as any).props.maskElement;
  expect(StyleSheet.flatten(mask.props.style).flexDirection).toBe(edge==='top'?'column':'column-reverse');
  const gradient=mask.props.children[0];
  expect(StyleSheet.flatten(gradient.props.style).height).toBe(48);
  expect(gradient.props.colors).toEqual(edge==='top'?['#00000000','#00000018','#00000080','#000000']:['#000000','#00000080','#00000018','#00000000']);
});

test('web uses the same bounded fade toward the upper screen edge',async()=>{
  jest.replaceProperty(Platform,'OS','web');
  await act(async()=>{tree=Renderer.create(React.createElement(AppEdgeBlur,{edge:'bottom',featherSize:104}));});
  const surface=tree.root.findByProps({testID:'app-edge-blur'});
  await act(async()=>surface.props.onLayout({nativeEvent:{layout:{width:390,height:48}}}));
  const mask=StyleSheet.flatten(surface.props.style).maskImage;
  expect(mask).toMatch(/^linear-gradient\(to top, transparent 0,/);
  expect(mask).toMatch(/#000 48px\)$/);
});


test.each(['top','bottom'] as const)('%s edge uses one blur/tint pass and a transparent content edge',async edge=>{
 await act(async()=>{tree=Renderer.create(React.createElement(AppEdgeBlur,{target:{current:{id:'help'} as any},edge}));});
 await act(async()=>tree.root.findByType('MaskedView' as any).props.onLayout({nativeEvent:{layout:{width:390,height:144}}}));
 expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
 expect(tree.root.findAllByType('MaskedView' as any)).toHaveLength(1);
 const mask=tree.root.findByType('MaskedView' as any).props.maskElement,gradient=mask.props.children[0];
 expect(gradient.props.colors[edge==='top'?0:3]).toBe('#00000000');
 expect(gradient.props.colors[edge==='top'?3:0]).toBe('#000000');
});

test('a target that never attaches cannot keep requesting animation frames',async()=>{
 const frames:FrameRequestCallback[]=[];
 jest.spyOn(global,'requestAnimationFrame').mockImplementation(callback=>{frames.push(callback);return frames.length;});
 jest.spyOn(global,'cancelAnimationFrame').mockImplementation(()=>{});
 const target={current:null as any};
 await mount(target);
 let callbacks=0;
 while(frames.length&&callbacks<32){const callback=frames.shift()!;await act(async()=>callback(callbacks++));}
 expect(frames).toHaveLength(0);
 expect(callbacks).toBeLessThan(32);
 expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(0);
 target.current={id:'late-help'};
 await act(async()=>tree.update(React.createElement(AppEdgeBlur,{target})));
 expect(tree.root.findAllByType('BlurView' as any)).toHaveLength(1);
});
