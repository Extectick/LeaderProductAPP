import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import type {WebView as WebViewInstance} from 'react-native-webview';
import {useHelpTheme} from '../help/helpTheme';
import {normalizeWebUrl,webPageActionUrl,webPageDomain} from './webPagePolicy';
import {openWebPageExternally} from './webPageActions';
import type {WebPageContentProps} from './webPageTypes';
export type {WebPageContentProps,WebPageControls} from './webPageTypes';

type Navigation = {url:string;title?:string;canGoBack?:boolean;loading?:boolean};
const origins=['*'];

/** A real remote page with its own scroll and cookie store. Unlike inert Help
 * HTML, site JavaScript is enabled, but no native/API message bridge is exposed. */
export function WebPageContent({url,title,topInset=0,active=true,onTitle,onLocation,onScroll,onControls,onOpenLink}:WebPageContentProps){
 const normalized=normalizeWebUrl(url),c=useHelpTheme();
 const ref=useRef<WebViewInstance<{}>>(null),mounted=useRef(true),generation=useRef(0),input=useRef(normalized);
 if(input.current!==normalized){input.current=normalized;++generation.current;}
 const [navigationSource,setNavigationSource]=useState({owner:normalized,uri:normalized}),[progress,setProgress]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const [,refreshCallbacks]=useState(0);
 const [instance,setInstance]=useState(0),processGone=useRef(false);
 const [canGoBack,setCanGoBack]=useState(false),[pendingAction,setPendingAction]=useState<string|null>(null),[externalFailure,setExternalFailure]=useState(false);
 const latest=useRef({normalized,active,onTitle,onLocation,onScroll,onControls,onOpenLink});latest.current={normalized,active,onTitle,onLocation,onScroll,onControls,onOpenLink};
 const currentUrl=useRef(normalized),currentTitle=useRef<string|null>(null);
 const ownGesture=useMemo(()=>Gesture.Native().disallowInterruption(true),[]);
 const sourceUrl=navigationSource.owner===normalized?navigationSource.uri:normalized;
 const source=useMemo(()=>sourceUrl?{uri:sourceUrl}:undefined,[sourceUrl]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current;ref.current?.stopLoading();};},[]);
 useEffect(()=>{
  if(processGone.current){processGone.current=false;setInstance(n=>n+1);}
  currentUrl.current=normalized;currentTitle.current=null;setNavigationSource({owner:normalized,uri:normalized});setProgress(0);setLoading(true);setError(false);setCanGoBack(false);setPendingAction(null);setExternalFailure(false);
 },[normalized]);
 const captured=generation.current,scope=normalized;
 const current=(includeInactive=false)=>mounted.current&&(includeInactive||latest.current.active)&&latest.current.normalized===scope&&generation.current===captured;
 const reload=useCallback(()=>{
  if(!mounted.current||!latest.current.active||!latest.current.normalized)return;
  ++generation.current;refreshCallbacks(n=>n+1);setError(false);setExternalFailure(false);setLoading(true);setProgress(0);
  if(processGone.current){processGone.current=false;setCanGoBack(false);setNavigationSource({owner:latest.current.normalized,uri:currentUrl.current||latest.current.normalized});setInstance(n=>n+1);}
  else ref.current?.reload();
 },[]);
 const goBack=useCallback(()=>{if(mounted.current&&latest.current.active)ref.current?.goBack();},[]);
 useEffect(()=>{
  if(!active||!normalized){onControls?.(null);return;}
  onControls?.({canGoBack,goBack,reload,locationIsExact:true});
  return()=>onControls?.(null);
 },[active,normalized,canGoBack,goBack,reload,onControls]);
 useEffect(()=>{if(active&&normalized){onLocation?.(currentUrl.current||normalized);if(currentTitle.current)onTitle?.(currentTitle.current);}},[active,normalized,onLocation,onTitle]);
 const navigate=(event:Navigation)=>{
  if(!current(true))return;
  const address=normalizeWebUrl(event.url);if(!address)return;
  currentUrl.current=address;setCanGoBack(!!event.canGoBack);if(event.loading===false){setLoading(false);setProgress(1);}if(latest.current.active)latest.current.onLocation?.(address);
  const label=event.title?.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200);
  if(label){currentTitle.current=label;if(latest.current.active)latest.current.onTitle?.(label);}
 };
 const allow=(request:{url:string;isTopFrame?:boolean})=>{
  if(!current())return false;
  if(normalizeWebUrl(request.url))return true;
  if(request.isTopFrame===false&&(request.url==='about:blank'||request.url.startsWith('about:blank#')))return true;
  const action=webPageActionUrl(request.url);
  if(action&&request.isTopFrame!==false)setPendingAction(action);
  return false;
 };
 const openWindow=(event:{nativeEvent:{targetUrl:string}})=>{
  if(!current())return;
  const target=normalizeWebUrl(event.nativeEvent.targetUrl);
  if(target){++generation.current;currentUrl.current=target;latest.current.onLocation?.(target);setPendingAction(null);setError(false);setLoading(true);setProgress(0);setNavigationSource({owner:normalized,uri:target});return;}
  const action=webPageActionUrl(event.nativeEvent.targetUrl);if(action)setPendingAction(action);
 };
 const external=async()=>{const address=currentUrl.current||normalized;if(!address||!current())return;const ok=await openWebPageExternally(address);if(current())setExternalFailure(!ok);};
 if(!normalized)return <View testID="web-page-invalid" style={[styles.message,{paddingTop:topInset+24}]}><Text style={{color:c.text}}>Некорректная ссылка на сайт.</Text></View>;
 const WebView=(require('react-native-webview') as typeof import('react-native-webview')).WebView;
 return <View testID="web-page-content" style={{flex:1,backgroundColor:c.background}}>
  <View style={{flex:1,paddingTop:topInset}}>
   <GestureDetector gesture={ownGesture}><WebView<{}> key={instance} ref={ref} testID="web-page-webview" accessibilityLabel={title||webPageDomain(normalized)} source={source}
    originWhitelist={origins} onShouldStartLoadWithRequest={allow} onNavigationStateChange={navigate} onOpenWindow={openWindow}
    javaScriptEnabled domStorageEnabled incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} cacheEnabled={false}
    javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
    mediaPlaybackRequiresUserAction allowsInlineMediaPlayback={false} allowsFullscreenVideo={false} allowsBackForwardNavigationGestures
    nestedScrollEnabled={false} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
    automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
    onScroll={event=>{if(current()){const y=event.nativeEvent.contentOffset.y;if(Number.isFinite(y))latest.current.onScroll?.(Math.max(0,y));}}}
    onLoadStart={()=>{if(current(true)){setLoading(true);setError(false);setProgress(0);}}}
    onLoadProgress={event=>{if(current(true)&&Number.isFinite(event.nativeEvent.progress))setProgress(Math.max(0,Math.min(1,event.nativeEvent.progress)));}}
    onLoad={()=>{if(current(true)){setLoading(false);setError(false);setProgress(1);}}}
    onError={()=>{if(current(true)){setLoading(false);setError(true);}}}
    onHttpError={event=>{if(current(true)&&event.nativeEvent.statusCode>=400&&normalizeWebUrl(event.nativeEvent.url)===currentUrl.current){setLoading(false);setError(true);}}}
    onContentProcessDidTerminate={()=>{if(current(true)){processGone.current=true;setLoading(false);setError(true);}}}
    onRenderProcessGone={()=>{if(current(true)){processGone.current=true;setLoading(false);setError(true);}}}
    style={{flex:1,backgroundColor:c.background}} containerStyle={{flex:1}}/>
   </GestureDetector>
  </View>
  {loading&&!error?<View testID="web-page-progress" pointerEvents="none" style={{position:'absolute',left:0,right:0,top:topInset,height:3,backgroundColor:c.elevated}}><View style={{height:3,width:`${Math.max(3,progress*100)}%`,backgroundColor:c.accent}}/></View>:null}
  {loading&&progress===0&&!error?<View pointerEvents="none" style={[styles.initial,{top:topInset,backgroundColor:c.background}]}><ActivityIndicator color={c.accent} accessibilityLabel="Загружаю сайт"/></View>:null}
  {error?<View testID="web-page-error" style={[styles.failure,{top:topInset,backgroundColor:c.background}]}>
   <Text accessibilityLiveRegion="polite" style={{color:c.text,textAlign:'center'}}>Не удалось загрузить сайт.</Text>
   <Pressable accessibilityRole="button" testID="web-page-retry" onPress={reload} style={styles.button}><Text style={{color:c.accentText}}>Повторить</Text></Pressable>
   <Pressable accessibilityRole="link" testID="web-page-external" onPress={()=>void external()} style={styles.button}><Text style={{color:c.accentText}}>Открыть в браузере</Text></Pressable>
   {externalFailure?<Text style={{color:c.muted}}>Не удалось открыть браузер.</Text>:null}
  </View>:null}
  {pendingAction?<View testID="web-page-action-prompt" style={{padding:12,gap:8,backgroundColor:c.panel}}>
   <Text style={{color:c.text}}>Сайт предлагает открыть ссылку в приложении.</Text>
   <Text selectable numberOfLines={2} style={{fontSize:12,color:c.muted}}>{pendingAction}</Text>
   <Pressable accessibilityRole="button" testID="web-page-confirm-action" onPress={()=>{if(!current())return;const action=pendingAction;setPendingAction(null);latest.current.onOpenLink?.(action);}} style={styles.button}><Text style={{color:c.accentText}}>Открыть ссылку</Text></Pressable>
   <Pressable accessibilityRole="button" onPress={()=>setPendingAction(null)} style={styles.button}><Text style={{color:c.muted}}>Отмена</Text></Pressable>
  </View>:null}
 </View>;
}
const styles=StyleSheet.create({message:{flex:1,padding:24},button:{minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:16},initial:{position:'absolute',left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'},failure:{position:'absolute',left:0,right:0,bottom:0,padding:24,gap:10,alignItems:'center',justifyContent:'center'}});
