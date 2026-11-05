import React,{useMemo} from 'react';
import {Platform,View} from 'react-native';
import type {HelpHtmlVariant} from '../helpHtml';
import {helpHtmlDocument} from '../helpHtml';
import {useHelpTheme} from '../helpTheme';

/** Only a local inert document enters the renderer. Attachment tokens stay outside. */
export function HelpHtmlSurface({variant,compact=false,label,onScroll,onReady}:{variant:HelpHtmlVariant;compact?:boolean;label:string;onScroll?:(offset:number)=>void;onReady?:()=>void}){
 const c=useHelpTheme(),html=useMemo(()=>helpHtmlDocument(variant,c.text,compact),[variant,c.text,compact]);
 if(Platform.OS==='web')return <View testID="help-html-surface" style={{flex:1,backgroundColor:'transparent'}}>
  <iframe title={label} srcDoc={html} sandbox="" onLoad={onReady} referrerPolicy="no-referrer" style={{width:'100%',height:'100%',border:0,background:'transparent',display:'block',pointerEvents:compact?'none':'auto'}}/>
 </View>;
 // Keep this native-only dependency out of the web module graph.
 const WebView=(require('react-native-webview') as typeof import('react-native-webview')).WebView;
 return <WebView testID="help-html-surface" accessibilityLabel={label} source={{html,baseUrl:'about:blank'}} originWhitelist={['*']}
  javaScriptEnabled={false} javaScriptCanOpenWindowsAutomatically={false} domStorageEnabled={false}
  allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
  sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} mixedContentMode="never"
  setSupportMultipleWindows={false} allowsInlineMediaPlayback={false} allowsFullscreenVideo={false}
  mediaPlaybackRequiresUserAction scrollEnabled={!compact} bounces={false} overScrollMode="never"
  onShouldStartLoadWithRequest={request=>request.url==='about:blank'||request.url.startsWith('about:blank#')}
  onLoad={onReady} onError={onReady} onOpenWindow={()=>{}} onScroll={event=>onScroll?.(event.nativeEvent.contentOffset.y)}
  style={{flex:1,backgroundColor:'transparent'}} containerStyle={{backgroundColor:'transparent'}} pointerEvents={compact?'none':'auto'}/>;
}
