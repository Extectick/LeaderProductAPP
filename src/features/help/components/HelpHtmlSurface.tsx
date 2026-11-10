import {LoadingPlaceholder} from '@/components/ui/LoadingPlaceholder';
import React,{memo,useCallback,useMemo,useRef,useState} from 'react';
import {Platform,ScrollView,StyleSheet,Text,View} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import type {HelpHtmlVariant} from '../helpHtml';
import {helpHtmlCompactHeight,helpHtmlDocument} from '../helpHtml';
import {useHelpTheme} from '../helpTheme';
import {helpHtmlLocalAnchors,helpHtmlWebLinks} from '../helpHtmlLinks';
import {normalizeWebUrl} from '../../webPages/webPagePolicy';

/** Only a local inert document enters the renderer. Attachment tokens stay outside. */
type Props={variant:HelpHtmlVariant;compact?:boolean;label:string;topInset?:number;imageDataUrl?:string;skipLoadingPlaceholder?:boolean;nativeGesture?:ReturnType<typeof Gesture.Native>;onScroll?:(offset:number)=>void;onReady?:()=>void;onOpenLink?:(url:string)=>boolean};
const surfaceStyle={flex:1,backgroundColor:'transparent'} as const;
const origins=['*'];
const allowLocal=(request:{url:string})=>request.url==='about:blank'||request.url.startsWith('about:blank#');
const ignoreWindow=()=>{};
export const HelpHtmlSurface=memo(function HelpHtmlSurface({variant,compact=false,label,topInset=0,imageDataUrl,skipLoadingPlaceholder=false,nativeGesture,onScroll,onReady,onOpenLink}:Props){
 const c=useHelpTheme(),html=useMemo(()=>helpHtmlDocument(Platform.OS==='web'?{...variant,html:helpHtmlLocalAnchors(variant.html)}:variant,c.text,compact,topInset,imageDataUrl,c.dark?'dark':'light'),[variant.html,variant.css,c.text,c.dark,compact,topInset,imageDataUrl]);
 const links=useMemo(()=>compact?[]:helpHtmlWebLinks(variant.html),[compact,variant.html]);
 // Android loads HTML again whenever the source prop is committed. Keep both
 // it and event handlers stable through chat/viewer state and scroll renders.
 const source=useMemo(()=>({html,baseUrl:'about:blank'}),[html]);
 // Optional photos and theme colors update the same inert document. Once its
 // content has painted, do not cover the entire card with another gray surface.
 // A different variant/view mode still owns a fresh loading cycle, including
 // switching away and back before the replacement document finishes loading.
 const documentIdentity=useMemo(()=>({}),[variant.html,variant.css,compact,topInset]);
 const [paintedDocument,setPaintedDocument]=useState<object|null>(null);
 const currentDocument=useRef(documentIdentity);currentDocument.current=documentIdentity;
 const currentHtml=useRef(html);currentHtml.current=html;
 const placeholder=!skipLoadingPlaceholder&&paintedDocument!==documentIdentity?<LoadingPlaceholder dark={c.dark} variant={compact&&(helpHtmlCompactHeight(variant)??160)<160?'row':'card'} accessibilityLabel={`Загрузка: ${label}`} style={StyleSheet.absoluteFill}/>:null;
 const latest=useRef({onScroll,onReady,onOpenLink});latest.current={onScroll,onReady,onOpenLink};
 const ready=useCallback(()=>{if(currentHtml.current!==html||currentDocument.current!==documentIdentity)return;setPaintedDocument(documentIdentity);latest.current.onReady?.();},[html,documentIdentity]);
 const scrolled=useCallback((event:{nativeEvent:{contentOffset:{y:number}}})=>latest.current.onScroll?.(event.nativeEvent.contentOffset.y),[]);
 const navigate=useCallback((request:{url:string;navigationType?:string;hasGesture?:boolean})=>{
  if(currentHtml.current!==html)return false;
  if(allowLocal(request))return true;
  const url=normalizeWebUrl(request.url);
  // Android reports every native navigationType as 'other'. In this inert,
  // script/form/meta-free document only an explicitly present anchor can leave.
  const declared=url&&links.some(link=>link.url===url);
  if(!compact&&url&&declared&&(request.navigationType==='click'||request.hasGesture===true||Platform.OS==='android'))latest.current.onOpenLink?.(url);
  return false;
 },[compact,html,links]);
 if(Platform.OS==='web')return <View testID="help-html-surface" pointerEvents={compact?'none':'auto'} style={surfaceStyle}>
  <iframe title={label} srcDoc={html} sandbox="" onLoad={ready} referrerPolicy="no-referrer" scrolling={compact?'no':'auto'} style={{width:'100%',height:'100%',flex:1,minHeight:0,border:0,background:'transparent',colorScheme:c.dark?'dark':'light',display:'block',pointerEvents:compact?'none':'auto'}}/>
 {placeholder}
 {!compact&&onOpenLink&&links.length?<ScrollView testID="help-html-web-links" keyboardShouldPersistTaps="handled" style={{maxHeight:144,flexGrow:0,backgroundColor:c.background}} contentContainerStyle={{padding:12,gap:8}}>{links.map(link=><Text key={link.url} accessibilityRole="link" accessibilityHint="Открыть сайт в приложении" onPress={()=>onOpenLink(link.url)} style={{fontSize:15,color:c.accentText,textDecorationLine:'underline'}}>{link.label}</Text>)}</ScrollView>:null}
 </View>;
 // Keep this native-only dependency out of the web module graph.
 const WebView=(require('react-native-webview') as typeof import('react-native-webview')).WebView;
 // WebView's own wrapper does not forward pointerEvents to its outer View.
 // An explicit native wrapper makes the entire compact subtree touch-through.
 const page=<WebView testID="help-html-webview" accessibilityLabel={label} source={source} originWhitelist={origins}
  javaScriptEnabled={false} javaScriptCanOpenWindowsAutomatically={false} domStorageEnabled={false}
  allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
  sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} mixedContentMode="never"
  setSupportMultipleWindows={false} allowsInlineMediaPlayback={false} allowsFullscreenVideo={false}
  mediaPlaybackRequiresUserAction scrollEnabled={!compact} nestedScrollEnabled={false} bounces={false} overScrollMode="never"
  showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
  setBuiltInZoomControls={!compact} setDisplayZoomControls={false} textInteractionEnabled={!compact}
  automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
  onShouldStartLoadWithRequest={navigate}
  onLoad={ready} onError={ready} onOpenWindow={ignoreWindow} onScroll={scrolled}
  style={surfaceStyle} containerStyle={surfaceStyle}/>;
 return <View testID="help-html-surface" collapsable={false} pointerEvents={compact?'none':'auto'} removeClippedSubviews={false} style={surfaceStyle}>
  {nativeGesture&&!compact?<GestureDetector gesture={nativeGesture}>{page}</GestureDetector>:page}{placeholder}
 </View>;
},(previous,next)=>previous.variant.html===next.variant.html&&previous.variant.css===next.variant.css&&previous.compact===next.compact&&previous.topInset===next.topInset&&previous.imageDataUrl===next.imageDataUrl&&previous.skipLoadingPlaceholder===next.skipLoadingPlaceholder&&previous.nativeGesture===next.nativeGesture&&previous.label===next.label&&previous.onReady===next.onReady&&previous.onScroll===next.onScroll&&previous.onOpenLink===next.onOpenLink);
