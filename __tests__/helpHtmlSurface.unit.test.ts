import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
let mockTheme='light';
jest.mock('../context/ThemeContext',()=>({useTheme:()=>({theme:mockTheme})}));
jest.mock('react-native-gesture-handler',()=>({GestureDetector:'GestureDetector'}));
jest.mock('react-native-webview',()=>({WebView:'WebView'}));
import {Platform,Text} from 'react-native';
import {HelpHtmlSurface} from '../src/features/help/components/HelpHtmlSurface';
test.each(['light','dark'])('web transparent HTML uses the app %s scheme on both sides of the sandbox',async theme=>{
 const platform=Platform.OS;Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});mockTheme=theme;
 let view!:TestRenderer.ReactTestRenderer;
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant:{html:'<div class="card">Профиль</div>',css:'.card{height:132px;border-radius:18px;background:#eef2f7}'},compact:true,label:'Профиль'}));});
  const frame=view.root.findByType('iframe' as any).props;
  expect(frame.style.colorScheme).toBe(theme);expect(frame.srcDoc).toContain(`color-scheme:only ${theme}!important`);
  expect(frame.style.background).toBe('transparent');expect(frame.style.border).toBe(0);
  expect(frame.sandbox).toBe('');expect(frame.srcDoc).toContain("script-src 'none'");
 }finally{if(view)await act(async()=>view.unmount());mockTheme='light';Object.defineProperty(Platform,'OS',{configurable:true,value:platform});}
});
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
  await act(async()=>current.onLoad());expect(next).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
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

test('approved raster bytes are local data only and remain stable across parent renders',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const variant={html:'<img src="help-entity-image" alt="Фото">',css:''};
 const imageDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant,compact:true,label:'Карточка',imageDataUrl}));});
 try{
  const original=view.root.findAll(node=>node.type==='WebView')[0].props;expect(original.source.html).toContain(imageDataUrl);expect(original.source.html).toContain('img-src data:');expect(original.javaScriptEnabled).toBe(false);
  await act(async()=>view.update(React.createElement(HelpHtmlSurface,{variant:{...variant},compact:true,label:'Карточка',imageDataUrl})));
  expect(view.root.findAll(node=>node.type==='WebView')[0].props.source).toBe(original.source);
  expect(view.root.findAll(node=>node.props.testID==='help-html-surface')[0].props.pointerEvents).toBe('none');
 }finally{await act(async()=>view.unmount());}
});

test('placeholder waits for the current document and ignores a late load from the previous document',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const ready=jest.fn();
 const tree=(html:string)=>React.createElement(HelpHtmlSurface,{variant:{html,css:''},label:'Карточка',onReady:ready});
 await act(async()=>{view=TestRenderer.create(tree('<p>Первая</p>'));});
 const placeholder=()=>view.root.findAll(node=>node.props.accessibilityRole==='progressbar');
 const native=()=>view.root.findAll(node=>node.type==='WebView')[0].props;
 try{
  expect(placeholder().length).toBeGreaterThan(0);
  const first=native().onLoad;
  await act(async()=>first());expect(placeholder()).toHaveLength(0);
  await act(async()=>view.update(tree('<p>Вторая</p>')));
  expect(placeholder().length).toBeGreaterThan(0);
  await act(async()=>first());expect(placeholder().length).toBeGreaterThan(0);expect(ready).toHaveBeenCalledTimes(1);
  await act(async()=>native().onLoad());expect(placeholder()).toHaveLength(0);expect(ready).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>view.unmount());}
});


test('only the full native page joins the viewer gesture relationship without enabling a script bridge',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const nativeGesture={} as any,variant={html:'<p>Details</p>',css:''};
 const tree=(compact:boolean)=>React.createElement(HelpHtmlSurface,{variant,compact,label:'Пример',nativeGesture});
 await act(async()=>{view=TestRenderer.create(tree(false));});
 try{
  const detector=view.root.findAll(node=>node.type==='GestureDetector')[0];expect(detector.props.gesture).toBe(nativeGesture);
  const webview=view.root.findAll(node=>node.type==='WebView')[0];expect(detector.children).toContain(webview);
  expect(webview.props.javaScriptEnabled).toBe(false);expect(webview.props.onMessage).toBeUndefined();expect(webview.props.injectedJavaScript).toBeUndefined();
  await act(async()=>view.update(tree(true)));expect(view.root.findAll(node=>node.type==='GestureDetector')).toHaveLength(0);
 }finally{await act(async()=>view.unmount());}
});

test('full inert HTML routes declared tapped web links without loading remote content in its WebView',async()=>{
 const open=jest.fn(()=>true);let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant:{html:'<p><a href="https://tass.ru/">Новости</a></p>',css:''},label:'Ссылки',onOpenLink:open}));});
 try{
  const native=view.root.findAll(node=>node.type==='WebView')[0].props;
  expect(native.onShouldStartLoadWithRequest({url:'https://tass.ru/',navigationType:'click'})).toBe(false);expect(open).toHaveBeenCalledWith('https://tass.ru/');
  open.mockClear();expect(native.onShouldStartLoadWithRequest({url:'https://other.test/',navigationType:'click'})).toBe(false);expect(open).not.toHaveBeenCalled();
  expect(native.javaScriptEnabled).toBe(false);expect(native.onMessage).toBeUndefined();expect(native.source.uri).toBeUndefined();
 }finally{await act(async()=>view.unmount());}
});


test('web full HTML keeps its sandbox and exposes safe links as app-owned controls',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Platform,'OS')!;Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});
 const open=jest.fn(()=>true);let view!:TestRenderer.ReactTestRenderer;
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant:{html:'<a href="https://tass.ru/?a=1&amp;b=2">Новости</a>',css:''},label:'Ссылки',onOpenLink:open}));});
  const iframe=view.root.findAll(node=>node.type==='iframe')[0].props;expect(iframe.sandbox).toBe('');expect(iframe.srcDoc).not.toMatch(/\shref="https:/);expect(iframe.srcDoc).toContain("script-src 'none'");
  const link=view.root.findAllByType(Text).find(node=>node.props.accessibilityRole==='link')!;await act(async()=>link.props.onPress());expect(open).toHaveBeenCalledWith('https://tass.ru/?a=1&b=2');
 }finally{if(view)await act(async()=>view.unmount());Object.defineProperty(Platform,'OS',descriptor);}
});

test('a warm compact surface avoids a gray replay while retaining document readiness',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const ready=jest.fn();
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlSurface,{variant:{html:'<p>Cached</p>',css:''},compact:true,label:'Карточка',skipLoadingPlaceholder:true,onReady:ready}));});
 try{
  expect(view.root.findAll(node=>node.props.accessibilityRole==='progressbar')).toHaveLength(0);
  expect(ready).not.toHaveBeenCalled();
  const webview=view.root.findAll(node=>node.type==='WebView')[0];
  expect(webview.props.javaScriptEnabled).toBe(false);
  await act(async()=>webview.props.onLoad());expect(ready).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>view.unmount());}
});

test.each(['web','android'])('%s keeps painted content visible when its optional image or theme arrives',async platform=>{
 const descriptor=Object.getOwnPropertyDescriptor(Platform,'OS')!;
 Object.defineProperty(Platform,'OS',{configurable:true,value:platform});mockTheme='light';
 let view!:TestRenderer.ReactTestRenderer;
 const variant={html:'<section><img src="help-entity-image" alt="Фото"><p>Карточка</p></section>',css:'section{height:132px}'},ready=jest.fn();
 const imageDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 const tree=(image?:string,label='Карточка')=>React.createElement(HelpHtmlSurface,{variant,compact:true,label,imageDataUrl:image,onReady:ready});
 const surface=()=>view.root.findAll(node=>node.type===(platform==='web'?'iframe':'WebView'))[0];
 const placeholder=()=>view.root.findAll(node=>node.props.accessibilityRole==='progressbar');
 try{
  await act(async()=>{view=TestRenderer.create(tree());});
  expect(placeholder().length).toBeGreaterThan(0);
  const original=surface();await act(async()=>original.props.onLoad());expect(placeholder()).toHaveLength(0);
  await act(async()=>view.update(tree(imageDataUrl)));
  expect(surface()).toBe(original);expect(placeholder()).toHaveLength(0);
  const photoHtml=platform==='web'?surface().props.srcDoc:surface().props.source.html;
  expect(photoHtml).toContain(imageDataUrl);expect(photoHtml).toContain("script-src 'none'");
  await act(async()=>surface().props.onLoad());expect(ready).toHaveBeenCalledTimes(2);
  mockTheme='dark';await act(async()=>view.update(tree(imageDataUrl,'Карточка в тёмной теме')));
  expect(surface()).toBe(original);expect(placeholder()).toHaveLength(0);
  const darkHtml=platform==='web'?surface().props.srcDoc:surface().props.source.html;
  expect(darkHtml).toContain('color-scheme:only dark!important');
 }finally{if(view)await act(async()=>view.unmount());mockTheme='light';Object.defineProperty(Platform,'OS',descriptor);}
});

test('an image arriving before first paint keeps the placeholder until the latest document loads',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const ready=jest.fn(),variant={html:'<img src="help-entity-image" alt="Фото">',css:''};
 const imageDataUrl='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
 const tree=(image?:string)=>React.createElement(HelpHtmlSurface,{variant,compact:true,label:'Карточка',imageDataUrl:image,onReady:ready});
 const native=()=>view.root.findAll(node=>node.type==='WebView')[0].props;
 const placeholder=()=>view.root.findAll(node=>node.props.accessibilityRole==='progressbar');
 try{
  await act(async()=>{view=TestRenderer.create(tree());});const staleLoad=native().onLoad;
  await act(async()=>view.update(tree(imageDataUrl)));expect(placeholder().length).toBeGreaterThan(0);
  await act(async()=>staleLoad());expect(placeholder().length).toBeGreaterThan(0);expect(ready).not.toHaveBeenCalled();
  await act(async()=>native().onLoad());expect(placeholder()).toHaveLength(0);expect(ready).toHaveBeenCalledTimes(1);
 }finally{if(view)await act(async()=>view.unmount());}
});

test('switching back to a previous variant does not accept its old load callback',async()=>{
 let view!:TestRenderer.ReactTestRenderer;const ready=jest.fn();
 const tree=(html:string)=>React.createElement(HelpHtmlSurface,{variant:{html,css:''},compact:true,label:'Карточка',onReady:ready});
 const native=()=>view.root.findAll(node=>node.type==='WebView')[0].props;
 const placeholder=()=>view.root.findAll(node=>node.props.accessibilityRole==='progressbar');
 try{
  await act(async()=>{view=TestRenderer.create(tree('<p>A</p>'));});const oldLoad=native().onLoad;
  await act(async()=>oldLoad());expect(placeholder()).toHaveLength(0);
  await act(async()=>view.update(tree('<p>B</p>')));
  await act(async()=>view.update(tree('<p>A</p>')));expect(placeholder().length).toBeGreaterThan(0);
  await act(async()=>oldLoad());expect(placeholder().length).toBeGreaterThan(0);expect(ready).toHaveBeenCalledTimes(1);
  await act(async()=>native().onLoad());expect(placeholder()).toHaveLength(0);expect(ready).toHaveBeenCalledTimes(2);
 }finally{if(view)await act(async()=>view.unmount());}
});
