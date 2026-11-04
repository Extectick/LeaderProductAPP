import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Platform,StyleSheet} from 'react-native';

let mockFocused=true;
const mockCaptures:string[]=[];
jest.mock('expo-router/react-navigation',()=>({useIsFocused:()=>mockFocused}));
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('../hooks/useThemeColor',()=>({useThemeColor:()=>'#F7F9FC'}));
jest.mock('expo-blur',()=>({
  BlurTargetView:'BlurTargetView',
  BlurView:({blurTarget,...props}:any)=>{mockCaptures.push(blurTarget?.current?.id??'none');return require('react').createElement('BlurView',{...props,blurTarget});},
}));
jest.mock('@react-native-masked-view/masked-view',()=>({__esModule:true,default:'MaskedView'}));
jest.mock('expo-linear-gradient',()=>({LinearGradient:'LinearGradient'}));
import {AppEdgeBlur} from '../components/ui/AppScreenBlur';

let tree:Renderer.ReactTestRenderer;
beforeEach(()=>{mockFocused=true;mockCaptures.length=0;jest.replaceProperty(Platform,'OS','android');});
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


test.each(['top','bottom'] as const)('progressive %s blur increases radius toward chrome with a transparent content edge',async edge=>{
 await act(async()=>{tree=Renderer.create(React.createElement(AppEdgeBlur,{target:{current:{id:'help'} as any},edge,progressive:true,intensity:34,testID:'progressive'}));});
 await act(async()=>tree.root.findAll(node=>node.props.testID==='progressive'&&typeof node.props.onLayout==='function')[0].props.onLayout({nativeEvent:{layout:{width:390,height:144}}}));
 const blurs=tree.root.findAllByType('BlurView' as any);
 expect(blurs.map(blur=>blur.props.intensity)).toEqual([34*.28,34*.6,34]);
 for(const layer of tree.root.findAllByType('MaskedView' as any)){
  const mask=layer.props.maskElement;const gradient=mask.props.children[0];
  expect(mask.props.style.flexDirection).toBe(edge==='top'?'column':'column-reverse');
  expect(gradient.props.colors[edge==='top'?0:3]).toBe('#00000000');
  expect(gradient.props.locations).toEqual([...gradient.props.locations].sort((a,b)=>a-b));
 }
});
