import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
jest.mock('react-native-webview',()=>{const R=require('react');return {WebView:R.forwardRef((_props:any,ref:any)=>R.createElement('WebView',{..._props,ref}))}});
jest.mock('react-native-gesture-handler',()=>({Gesture:{Native:()=>({disallowInterruption:()=>({})})},GestureDetector:({children}:any)=>children}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({background:'#fff',text:'#111',panel:'#eee',elevated:'#ddd',muted:'#666',accent:'#05f',accentText:'#05f'})}));
jest.mock('../src/features/webPages/webPageActions',()=>({openWebPageExternally:jest.fn(async()=>true)}));
import {WebPageContent} from '../src/features/webPages/WebPageContent';
import type {WebPageControls} from '../src/features/webPages/webPageTypes';
const page=(view:TestRenderer.ReactTestRenderer)=>view.root.findAll(node=>node.type==='WebView')[0];
const native={reload:jest.fn(),goBack:jest.fn(),stopLoading:jest.fn()};
beforeEach(()=>jest.clearAllMocks());
const mount=async(props:any)=>{let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(React.createElement(WebPageContent,{url:'https://tass.ru/',...props}),{createNodeMock:element=>element.type==='WebView'?native:null});});return view;};

test('uses a real isolated page without an authenticated native/API bridge',async()=>{
 const view=await mount({});try{
  const props=page(view).props;expect(props.source).toEqual({uri:'https://tass.ru/'});
  expect(props.javaScriptEnabled).toBe(true);expect(props.incognito).toBe(true);expect(props.sharedCookiesEnabled).toBe(false);
  expect(props.onMessage).toBeUndefined();expect(props.injectedJavaScript).toBeUndefined();expect(props.source.headers).toBeUndefined();expect(props.allowFileAccess).toBe(false);
 }finally{await act(async()=>view.unmount());}
});
test('tracks redirect/current URL and native Back/reload without resetting WebView source on scroll',async()=>{
 const location=jest.fn(),scroll=jest.fn(),controls=jest.fn();const view=await mount({onLocation:location,onScroll:scroll,onControls:controls});
 try{
  const source=page(view).props.source;
  await act(async()=>page(view).props.onNavigationStateChange({url:'https://tass.ru/article',title:'Статья',canGoBack:true}));
  expect(location).toHaveBeenLastCalledWith('https://tass.ru/article');
  const controller=controls.mock.calls.map(c=>c[0]).filter(Boolean).at(-1) as WebPageControls;expect(controller.canGoBack).toBe(true);
  await act(async()=>{controller.goBack();controller.reload();});expect(native.goBack).toHaveBeenCalledTimes(1);expect(native.reload).toHaveBeenCalledTimes(1);
  await act(async()=>page(view).props.onScroll({nativeEvent:{contentOffset:{y:430}}}));expect(scroll).toHaveBeenCalledWith(430);expect(page(view).props.source).toBe(source);
 }finally{await act(async()=>view.unmount());}
});
test('a site cannot silently invoke internal routes or application actions',async()=>{
 const open=jest.fn(()=>true);const view=await mount({onOpenLink:open});try{
  let allowed!:boolean;await act(async()=>{allowed=page(view).props.onShouldStartLoadWithRequest({url:'leaderproduct://entity/v1/user/1',navigationType:'other',isTopFrame:true});});
  expect(allowed).toBe(false);expect(open).not.toHaveBeenCalled();
  await act(async()=>view.root.findByProps({testID:'web-page-confirm-action'}).props.onPress());expect(open).toHaveBeenCalledWith('leaderproduct://entity/v1/user/1');
  expect(page(view).props.onShouldStartLoadWithRequest({url:'javascript:alert(1)',isTopFrame:true})).toBe(false);
 }finally{await act(async()=>view.unmount());}
});
test('new web windows stay in the renderer and non-web windows require an explicit native action',async()=>{
 const open=jest.fn(()=>true);const view=await mount({onOpenLink:open});try{
  await act(async()=>page(view).props.onOpenWindow({nativeEvent:{targetUrl:'https://tass.ru/article'}}));expect(page(view).props.source.uri).toBe('https://tass.ru/article');
  await act(async()=>page(view).props.onOpenWindow({nativeEvent:{targetUrl:'mailto:help@example.test'}}));expect(open).not.toHaveBeenCalled();expect(view.root.findByProps({testID:'web-page-confirm-action'})).toBeTruthy();
 }finally{await act(async()=>view.unmount());}
});
test('load failures provide retry and the browser fallback',async()=>{
 const view=await mount({});try{
  await act(async()=>page(view).props.onError());expect(view.root.findByProps({testID:'web-page-error'})).toBeTruthy();
  expect(view.root.findByProps({testID:'web-page-external'})).toBeTruthy();
  await act(async()=>view.root.findByProps({testID:'web-page-retry'}).props.onPress());expect(native.reload).toHaveBeenCalled();expect(view.root.findAllByProps({testID:'web-page-error'})).toHaveLength(0);
 }finally{await act(async()=>view.unmount());}
});
test('old document and inactive callbacks cannot update another frame',async()=>{
 const location=jest.fn(),open=jest.fn(()=>true);const view=await mount({onLocation:location,onOpenLink:open});const old=page(view).props;
 await act(async()=>view.update(React.createElement(WebPageContent,{url:'https://other.example/',onLocation:location,onOpenLink:open})));
 location.mockClear();await act(async()=>old.onNavigationStateChange({url:'https://tass.ru/stale',canGoBack:true}));expect(location).not.toHaveBeenCalled();
 const fresh=page(view).props;await act(async()=>view.update(React.createElement(WebPageContent,{url:'https://other.example/',active:false,onLocation:location,onOpenLink:open})));
 await act(async()=>fresh.onOpenWindow({nativeEvent:{targetUrl:'leaderproduct://entity/v1/user/1'}}));expect(open).not.toHaveBeenCalled();expect(view.root.findAllByProps({testID:'web-page-confirm-action'})).toHaveLength(0);
 await act(async()=>view.unmount());
});

test('a crashed renderer retries with a fresh native instance and ignores old completion',async()=>{
 const view=await mount({});try{
  const previous=page(view).props;
  await act(async()=>previous.onRenderProcessGone());
  expect(view.root.findByProps({testID:'web-page-error'})).toBeTruthy();
  await act(async()=>view.root.findByProps({testID:'web-page-retry'}).props.onPress());
  expect(native.reload).not.toHaveBeenCalled();
  await act(async()=>previous.onLoad());
  expect(view.root.findAllByProps({testID:'web-page-progress'}).length).toBeGreaterThan(0);
  await act(async()=>page(view).props.onLoad());
  expect(view.root.findAllByProps({testID:'web-page-progress'})).toHaveLength(0);
 }finally{await act(async()=>view.unmount());}
});
