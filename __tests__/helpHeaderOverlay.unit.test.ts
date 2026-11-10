import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Platform,StyleSheet} from 'react-native';
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpBlurSurface:'HelpBlurSurface'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({background:'#F7F9FC'})}));
import {HelpHeaderOverlay} from '../src/features/help/components/HelpHeaderOverlay';

test('web retains the same full shared blur feather as the chat and native header',async()=>{
 jest.replaceProperty(Platform,'OS','web');let view!:Renderer.ReactTestRenderer;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(HelpHeaderOverlay,{id:'header',backdropId:'backdrop',target:{current:null},children:'Title'}));});
  const backdrop=view.root.findByProps({testID:'backdrop'});
  expect(backdrop.props.pointerEvents).toBe('none');
  expect(StyleSheet.flatten(backdrop.props.style).bottom).toBe(-36);
  expect(view.root.findAllByProps({testID:'header-scrollbar-cover'})).toHaveLength(0);
  expect(view.root.findByType('HelpBlurSurface' as any).props.edge).toBe('bottom');
 }finally{await act(async()=>view?.unmount());jest.restoreAllMocks();}
});

test('native header has only the original shared blur, without a scrollbar cover',async()=>{
 jest.replaceProperty(Platform,'OS','android');let view!:Renderer.ReactTestRenderer;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(HelpHeaderOverlay,{id:'header',backdropId:'backdrop',target:{current:null},children:'Title'}));});
  expect(view.root.findAllByProps({testID:'header-scrollbar-cover'})).toHaveLength(0);
  expect(view.root.findAllByType('HelpBlurSurface' as any)).toHaveLength(1);
  expect(StyleSheet.flatten(view.root.findByProps({testID:'backdrop'}).props.style).bottom).toBe(-36);
 }finally{await act(async()=>view?.unmount());jest.restoreAllMocks();}
});
