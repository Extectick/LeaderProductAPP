import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:'light'})}));
jest.mock('react-native-webview',()=>({WebView:'WebView'}));
import {HelpHtmlSurface} from '../src/features/help/components/HelpHtmlSurface';
test('native renderer receives inert inline HTML, no network credentials or application bridge',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant:{html:'<p>Пример</p>',css:''},compact:true,label:'Пример'}));});
 try{
  const native=view.root.findAll(node=>node.type==='WebView')[0].props;
  expect(native.source.baseUrl).toBe('about:blank');expect(native.source.headers).toBeUndefined();expect(native.source.uri).toBeUndefined();
  expect(native.javaScriptEnabled).toBe(false);expect(native.domStorageEnabled).toBe(false);expect(native.sharedCookiesEnabled).toBe(false);expect(native.thirdPartyCookiesEnabled).toBe(false);
  expect(native.allowFileAccess).toBe(false);expect(native.allowFileAccessFromFileURLs).toBe(false);expect(native.allowUniversalAccessFromFileURLs).toBe(false);
  const wrapper=view.root.findAll(node=>node.props.testID==='help-html-surface')[0];
  expect(wrapper.props.pointerEvents).toBe('none');
  expect(native.showsVerticalScrollIndicator).toBe(false);expect(native.showsHorizontalScrollIndicator).toBe(false);
  expect(native.nestedScrollEnabled).toBe(false);expect(native.setBuiltInZoomControls).toBe(false);
  expect(native.onMessage).toBeUndefined();expect(native.injectedJavaScript).toBeUndefined();expect(native.scrollEnabled).toBe(false);
  expect(native.onShouldStartLoadWithRequest({url:'about:blank'})).toBe(true);
  expect(native.onShouldStartLoadWithRequest({url:'about:blank#details'})).toBe(true);
  for(const url of ['https://example.com','file:///secret','javascript:alert(1)','leaderproduct://entity/v1/user/121','data:text/html,bad'])expect(native.onShouldStartLoadWithRequest({url})).toBe(false);
 }finally{await act(async()=>view.unmount());}
});
test('parent scroll renders and callback changes do not replace native source or handlers',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const ready=jest.fn(),next=jest.fn(),variant={html:'<p>Пример</p>',css:''};
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant,compact:true,label:'Пример',onReady:ready}));});
 try{
  const original=view.root.findAll(node=>node.type==='WebView')[0].props;
  await act(async()=>view.update(React.createElement(HelpHtmlSurface,{variant:{...variant},compact:true,label:'Пример',onReady:next})));
  const current=view.root.findAll(node=>node.type==='WebView')[0].props;
  expect(current.source).toBe(original.source);expect(current.originWhitelist).toBe(original.originWhitelist);
  expect(current.onLoad).toBe(original.onLoad);expect(current.onScroll).toBe(original.onScroll);
  current.onLoad();expect(next).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
 }finally{await act(async()=>view.unmount());}
});
test('full page keeps its own scroll interaction while hiding native scroll indicators',async()=>{
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant:{html:'<p>Details</p>',css:''},label:'Пример'}));});
 try{
  expect(view.root.findAll(node=>node.props.testID==='help-html-surface')[0].props.pointerEvents).toBe('auto');
  const native=view.root.findAll(node=>node.type==='WebView')[0].props;expect(native.scrollEnabled).toBe(true);expect(native.showsVerticalScrollIndicator).toBe(false);
 }finally{await act(async()=>view.unmount());}
});
