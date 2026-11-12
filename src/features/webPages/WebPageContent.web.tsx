import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useHelpTheme} from '../help/helpTheme';
import {normalizeWebUrl,webPageDomain} from './webPagePolicy';
import {openWebPageExternally} from './webPageActions';
import type {WebPageContentProps} from './webPageTypes';
export type {WebPageContentProps,WebPageControls} from './webPageTypes';

/** Browsers deliberately do not expose another origin's document/history. The
 * fallback is visible even if a browser reports iframe onLoad for a blocked page. */
export function WebPageContent({url,title,topInset=0,active=true,onTitle,onLocation,onControls}:WebPageContentProps){
 const c=useHelpTheme(),normalized=normalizeWebUrl(url),mounted=useRef(true),latest=useRef({active,normalized});latest.current={active,normalized};
 const [revision,setRevision]=useState(0),[failed,setFailed]=useState(false),[externalFailure,setExternalFailure]=useState(false);
 const reload=useCallback(()=>{if(!mounted.current||!latest.current.active)return;setFailed(false);setExternalFailure(false);setRevision(n=>n+1);},[]);
 const noop=useCallback(()=>{},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setFailed(false);setExternalFailure(false);},[normalized]);
 useEffect(()=>{
  if(!active||!normalized){onControls?.(null);return;}
  onControls?.({canGoBack:false,goBack:noop,reload,locationIsExact:false});
  onTitle?.(title||webPageDomain(normalized));onLocation?.(normalized);
  return()=>onControls?.(null);
 },[active,normalized,title,onControls,onTitle,onLocation,reload,noop]);
 const identity=useMemo(()=>`${normalized}:${revision}`,[normalized,revision]),currentIdentity=useRef(identity);currentIdentity.current=identity;
 const open=async()=>{
  if(!normalized||!mounted.current||!latest.current.active)return;
  const scope=normalized,ok=await openWebPageExternally(normalized);
  if(mounted.current&&latest.current.active&&latest.current.normalized===scope)setExternalFailure(!ok);
 };
 if(!normalized)return <View testID="web-page-invalid" style={{flex:1,padding:24,paddingTop:topInset+24}}><Text style={{color:c.text}}>Некорректная ссылка на сайт.</Text></View>;
 return <View testID="web-page-content" style={{flex:1,paddingTop:topInset,backgroundColor:c.background}}>
  <View testID="web-page-browser-fallback" style={{paddingHorizontal:12,paddingVertical:8,gap:4,backgroundColor:c.panel}}>
   <Text style={{fontSize:12,color:c.muted}}>{failed?'Не удалось встроить сайт.':'Некоторые сайты запрещают встроенный просмотр.'} В браузере доступен исходный адрес.</Text>
   <Pressable testID="web-page-external" accessibilityRole="link" onPress={()=>void open()} style={{minHeight:40,justifyContent:'center',alignSelf:'flex-start'}}><Text style={{color:c.accentText}}>Открыть в браузере</Text></Pressable>
   {externalFailure?<Text accessibilityLiveRegion="polite" style={{color:c.muted}}>Не удалось открыть браузер.</Text>:null}
  </View>
  <View style={{flex:1,minHeight:0}}>
   <iframe key={identity} title={title||webPageDomain(normalized)} src={normalized}
    sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" loading="eager"
    onError={()=>{if(mounted.current&&latest.current.active&&latest.current.normalized===normalized&&currentIdentity.current===identity)setFailed(true);}}
    style={{width:'100%',height:'100%',border:0,display:'block',background:c.background}}/>
  </View>
 </View>;
}
