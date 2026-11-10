import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({background:'#fff',text:'#111',panel:'#eee',muted:'#666',accent:'#05f',accentText:'#05f'})}));
jest.mock('../src/features/webPages/webPageActions',()=>({openWebPageExternally:jest.fn(async()=>true)}));
import {WebPageContent} from '../src/features/webPages/WebPageContent.web';
import {openWebPageExternally} from '../src/features/webPages/webPageActions';
const frame=(view:TestRenderer.ReactTestRenderer)=>view.root.findByType('iframe' as any);
beforeEach(()=>jest.clearAllMocks());
test('browser view does not pretend to know foreign history or success from iframe onLoad',async()=>{
 const controls=jest.fn(),location=jest.fn();let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(WebPageContent,{url:'https://tass.ru/',onControls:controls,onLocation:location}));});
 try{
  const props=frame(view).props;expect(props.src).toBe('https://tass.ru/');expect(props.onLoad).toBeUndefined();expect(props.sandbox).toBe('allow-scripts allow-forms');
  expect(location).toHaveBeenCalledWith('https://tass.ru/');const controller=controls.mock.calls.map(c=>c[0]).filter(Boolean).at(-1);expect(controller.canGoBack).toBe(false);expect(controller.locationIsExact).toBe(false);
  expect(view.root.findByProps({testID:'web-page-external'})).toBeTruthy();
  await act(async()=>view.root.findByProps({testID:'web-page-external'}).props.onPress());expect(openWebPageExternally).toHaveBeenCalledWith('https://tass.ru/');
 }finally{await act(async()=>view.unmount());}
});
test('browser frame failure keeps an explicit honest fallback and old iframe errors are fenced',async()=>{
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(React.createElement(WebPageContent,{url:'https://tass.ru/'}));});
 const old=frame(view).props;
 await act(async()=>view.update(React.createElement(WebPageContent,{url:'https://other.example/'})));
 await act(async()=>old.onError());
 expect(view.root.findAllByType(Text).some(n=>String(n.props.children).includes('Не удалось встроить'))).toBe(false);
 await act(async()=>frame(view).props.onError());expect(view.root.findAllByType(Text).some(n=>String(n.props.children).includes('Не удалось встроить'))).toBe(true);
 await act(async()=>view.unmount());
});

test('a late iframe error cannot spoil a reload of the same URL',async()=>{
 const controls=jest.fn();let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(WebPageContent,{url:'https://tass.ru/',onControls:controls}));});
 const old=frame(view).props;
 await act(async()=>controls.mock.calls.map(c=>c[0]).filter(Boolean).at(-1).reload());
 await act(async()=>old.onError());
 expect(view.root.findAllByType(Text).some(n=>String(n.props.children).includes('Не удалось встроить'))).toBe(false);
 await act(async()=>view.unmount());
});
