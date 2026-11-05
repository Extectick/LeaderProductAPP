import React,{memo,useCallback,useMemo,useRef} from 'react';
import {Platform,View} from 'react-native';
import type {HelpHtmlVariant} from '../helpHtml';
import {helpHtmlDocument} from '../helpHtml';
import {useHelpTheme} from '../helpTheme';

/** Only a local inert document enters the renderer. Attachment tokens stay outside. */
type Props={variant:HelpHtmlVariant;compact?:boolean;label:string;topInset?:number;onScroll?:(offset:number)=>void;onReady?:()=>void};
const surfaceStyle={flex:1,backgroundColor:'transparent'} as const;
const origins=['*'];
const allowLocal=(request:{url:string})=>request.url==='about:blank'||request.url.startsWith('about:blank#');
const ignoreWindow=()=>{};
export const HelpHtmlSurface=memo(function HelpHtmlSurface({variant,compact=false,label,topInset=0,onScroll,onReady}:Props){
 const c=useHelpTheme(),html=useMemo(()=>helpHtmlDocument(variant,c.text,compact,topInset),[variant.html,variant.css,c.text,compact,topInset]);
 // Android loads HTML again whenever the source prop is committed. Keep both
 // it and event handlers stable through chat/viewer state and scroll renders.
 const source=useMemo(()=>({html,baseUrl:'about:blank'}),[html]);
 const latest=useRef({onScroll,onReady});latest.current={onScroll,onReady};
 const ready=useCallback(()=>latest.current.onReady?.(),[]);
 const scrolled=useCallback((event:{nativeEvent:{contentOffset:{y:number}}})=>latest.current.onScroll?.(event.nativeEvent.contentOffset.y),[]);
 if(Platform.OS==='web')return <View testID="help-html-surface" pointerEvents={compact?'none':'auto'} style={surfaceStyle}>
  <iframe title={label} srcDoc={html} sandbox="" onLoad={ready} referrerPolicy="no-referrer" scrolling={compact?'no':'auto'} style={{width:'100%',height:'100%',border:0,background:'transparent',display:'block',pointerEvents:compact?'none':'auto'}}/>
 </View>;
 // Keep this native-only dependency out of the web module graph.
 const WebView=(require('react-native-webview') as typeof import('react-native-webview')).WebView;
 // WebView's own wrapper does not forward pointerEvents to its outer View.
 // An explicit native wrapper makes the entire compact subtree touch-through.
 return <View testID="help-html-surface" collapsable={false} pointerEvents={compact?'none':'auto'} removeClippedSubviews={false} style={surfaceStyle}>
 <WebView testID="help-html-webview" accessibilityLabel={label} source={source} originWhitelist={origins}
  javaScriptEnabled={false} javaScriptCanOpenWindowsAutomatically={false} domStorageEnabled={false}
  allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
  sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} mixedContentMode="never"
  setSupportMultipleWindows={false} allowsInlineMediaPlayback={false} allowsFullscreenVideo={false}
  mediaPlaybackRequiresUserAction scrollEnabled={!compact} nestedScrollEnabled={false} bounces={false} overScrollMode="never"
  showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
  setBuiltInZoomControls={!compact} setDisplayZoomControls={false} textInteractionEnabled={!compact}
  automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
  onShouldStartLoadWithRequest={allowLocal}
  onLoad={ready} onError={ready} onOpenWindow={ignoreWindow} onScroll={scrolled}
  style={surfaceStyle} containerStyle={surfaceStyle}/></View>;
},(previous,next)=>previous.variant.html===next.variant.html&&previous.variant.css===next.variant.css&&previous.compact===next.compact&&previous.topInset===next.topInset&&previous.label===next.label&&previous.onReady===next.onReady&&previous.onScroll===next.onScroll);
