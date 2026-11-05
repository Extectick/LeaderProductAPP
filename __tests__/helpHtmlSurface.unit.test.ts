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
  expect(native.onMessage).toBeUndefined();expect(native.injectedJavaScript).toBeUndefined();expect(native.scrollEnabled).toBe(false);
  expect(native.onShouldStartLoadWithRequest({url:'about:blank'})).toBe(true);
  expect(native.onShouldStartLoadWithRequest({url:'about:blank#details'})).toBe(true);
  for(const url of ['https://example.com','file:///secret','javascript:alert(1)','leaderproduct://entity/v1/user/121','data:text/html,bad'])expect(native.onShouldStartLoadWithRequest({url})).toBe(false);
 }finally{await act(async()=>view.unmount());}
});
