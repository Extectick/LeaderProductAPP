import {LoadingPlaceholder} from '@/components/ui/LoadingPlaceholder';
import React,{useCallback,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import {Keyboard,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AuthContext} from '@/context/AuthContext';
import {API_BASE_URL} from '@/utils/config';
import {loadHelpAttachmentText,type HelpAttachment} from '../helpApi';
import {HELP_HTML_MAX_BYTES,HELP_HTML_COMPACT_HEIGHT_MIN,HELP_HTML_COMPACT_HEIGHT_MAX,helpHtmlAttachmentId,helpHtmlPageLink,parseHelpHtmlArtifact,type HelpHtmlArtifact} from '../helpHtml';
import {useHelpTheme} from '../helpTheme';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpHtmlContext} from './HelpHtmlContext';
import {HelpHtmlSurface} from './HelpHtmlSurface';
import {HelpHtmlViewer,type HelpHtmlOrigin} from './HelpHtmlViewer';
import {helpHtmlEntityTarget,loadHelpHtmlEntityPreview} from '../helpHtmlEntity';
import {useEntityCards} from '@/src/features/entityCards/EntityCardContext';
import {HelpMediaLoadingContext} from '../helpMediaLoading';
import {helpHtmlWebLinks} from '../helpHtmlLinks';
import {HelpHtmlCacheContext} from '../helpHtmlCache';
type Loaded={artifact?:HelpHtmlArtifact;imageDataUrl?:string;error?:boolean;cached?:boolean};

/** Links are scoped to real attachments of this message, never model URLs. */
export function HelpHtmlMessage({attachments,resolve,children,ticketId,messageId,requestedId,onRequestConsumed}:{attachments:HelpAttachment[];resolve?:ResolveHelpMedia;children:React.ReactNode;ticketId?:number;messageId?:number;requestedId?:string;onRequestConsumed?:()=>void}){
 const entities=useEntityCards(),htmlOwner=useId();
 const viewerNavigation=useRef(entities);viewerNavigation.current=entities;
 const fullscreenScopes=useRef(new Map<number,Set<string>>());
 const mediaPriority=useContext(HelpMediaLoadingContext);
 const cache=useContext(HelpHtmlCacheContext);
 const c=useHelpTheme(),auth=useContext(AuthContext),userId=auth?.isAuthenticated?auth.profile?.id:undefined;
 const account=userId?`${API_BASE_URL}:${userId}`:'';
 const files=attachments.filter(file=>helpHtmlAttachmentId(file)!==null),identity=JSON.stringify(files.map(file=>[file.id,file.name,file.url,file.size,file.mimeType,file.kind,file.localUri,file.width,file.height,file.durationMs,file.thumbnailDataUri]));
 const cached=useMemo(()=>{
  const values:Record<string,Loaded>={};
  if(account&&resolve)for(const file of files){const value=cache?.read({account,resolver:resolve,ticketId,messageId},file);if(value)values[helpHtmlAttachmentId(file)!]={...value,cached:true};}
  return values;
 },[cache,account,resolve,identity,ticketId,messageId]);
 const [previewReady,setPreviewReady]=useState(()=>(mediaPriority==='visible'||mediaPriority==='near')&&Object.keys(cached).length>0);
 const [loaded,setLoaded]=useState<Record<string,Loaded>>(cached),[viewer,setViewer]=useState<{artifact:HelpHtmlArtifact;origin?:HelpHtmlOrigin;imageDataUrl?:string;account:string}|null>(null);
 const pending=useRef(new Map<string,Promise<HelpHtmlArtifact|null>>()),data=useRef<Record<string,Loaded>>(cached),controller=useRef(new AbortController()),generation=useRef(0),previews=useRef(new Map<string,View>());
 const scope=useRef({account,resolve,identity,ticketId,messageId}),loadedScope=useRef({account,resolve,identity,ticketId,messageId});scope.current={account,resolve,identity,ticketId,messageId};
 const sameScope=loadedScope.current.account===account&&loadedScope.current.resolve===resolve&&loadedScope.current.identity===identity&&loadedScope.current.ticketId===ticketId&&loadedScope.current.messageId===messageId;
 const visibleLoaded=sameScope?loaded:{};
 useEffect(()=>{
  const version=++generation.current,abort=new AbortController();loadedScope.current={account,resolve,identity,ticketId,messageId};controller.current=abort;pending.current.clear();data.current=cached;setLoaded(cached);setPreviewReady((mediaPriority==='visible'||mediaPriority==='near')&&Object.keys(cached).length>0);setViewer(null);
  return()=>{
   abort.abort();if(generation.current===version)++generation.current;
   for(const source of fullscreenScopes.current.get(version)??[])viewerNavigation.current.releaseHtml?.(source);
   fullscreenScopes.current.delete(version);
  };
 },[account,resolve,identity,ticketId,messageId,cached]);
 const load=useCallback((id:string):Promise<HelpHtmlArtifact|null>=>{
  const current=scope.current;if(!userId||!current.account||!current.resolve||loadedScope.current.account!==current.account||loadedScope.current.resolve!==current.resolve||loadedScope.current.identity!==current.identity||loadedScope.current.ticketId!==current.ticketId||loadedScope.current.messageId!==current.messageId)return Promise.resolve(null);
  const waiting=pending.current.get(id);if(waiting)return waiting;
  const cached=data.current[id]?.artifact;if(cached)return Promise.resolve(cached);
  const file=files.find(item=>helpHtmlAttachmentId(item)===id);if(!file)return Promise.resolve(null);
  const version=generation.current,signal=controller.current.signal;
  const valid=()=>!signal.aborted&&version===generation.current&&scope.current.account===current.account&&scope.current.resolve===current.resolve&&scope.current.identity===current.identity&&scope.current.ticketId===current.ticketId&&scope.current.messageId===current.messageId;
  const task=(async()=>{
   try{
    const text=await loadHelpAttachmentText(file,userId,signal,HELP_HTML_MAX_BYTES),artifact=parseHelpHtmlArtifact(text,id);
    if(!valid())return null;
    // Paint the inert card while its optional photo loads. The attachment's
    // metadata already reserves the final viewport before either request.
    data.current={...data.current,[id]:{artifact}};setLoaded(data.current);
    let imageDataUrl:string|undefined;
    let previewSucceeded=true;
    if(artifact.entity){try{imageDataUrl=(await loadHelpHtmlEntityPreview(artifact.entity.url,userId,signal)).imageDataUrl;}catch{signal.throwIfAborted();previewSucceeded=false;}}
    if(!valid())return null;data.current={...data.current,[id]:{artifact,imageDataUrl}};setLoaded(data.current);
    if(previewSucceeded&&current.resolve)cache?.remember({account:current.account,resolver:current.resolve,ticketId:current.ticketId,messageId:current.messageId},file,{artifact,imageDataUrl},signal);
    return artifact;
   }catch{if(valid()){data.current={...data.current,[id]:{error:true}};setLoaded(data.current);}return null;}
   finally{if(valid())pending.current.delete(id);}
  })();pending.current.set(id,task);return task;
 // Every closure is replaced on account or descriptor changes; late reads are fenced above.
 },[account,resolve,identity,userId,ticketId,messageId,cache]);
 useEffect(()=>{
  if(!account||!resolve||mediaPriority==='deferred'||mediaPriority==='retained'){setPreviewReady(false);return;}
  // Keep an already painted card in the bounded near-viewport buffer.
  // Visibility jitter must not unmount its WebView and replay its placeholder.
  // A never-visible near row still does not download or mount anything.
  if(mediaPriority!=='visible')return;
  if(files.every(file=>data.current[helpHtmlAttachmentId(file)!]?.artifact)){setPreviewReady(true);return;}
  let cancelled=false,frame=0;
  // Let the already-mounted message paint before download/parse/WebView work.
  // Never-seen near/retained rows reserve space without starting a preview.
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
   if(cancelled)return;
   setPreviewReady(true);
   for(const file of files)void load(helpHtmlAttachmentId(file)!);
  });});
  return()=>{cancelled=true;cancelAnimationFrame(frame);};
 },[mediaPriority,account,resolve,load,identity,ticketId,messageId]);
 const open=useCallback(async(id:string,fromPreview=false)=>{
  const version=generation.current,current=scope.current,artifact=await load(id);
  const valid=()=>!!userId&&!controller.current.signal.aborted&&version===generation.current&&scope.current.account===current.account&&scope.current.identity===current.identity&&scope.current.resolve===current.resolve&&scope.current.ticketId===current.ticketId&&scope.current.messageId===current.messageId&&data.current[id]?.artifact===artifact;
  if(!artifact?.full||!valid())return;
  Keyboard.dismiss();
  const navigation=viewerNavigation.current;
  if(navigation.openHtml&&navigation.status!=='unavailable'){
   const scopeId=`${htmlOwner}:${current.account}:${ticketId??0}:${messageId??0}:${version}:${id}`;
   if(navigation.openHtml({artifact,imageDataUrl:data.current[id]?.imageDataUrl,expectedUserId:userId!,link:helpHtmlPageLink(ticketId??0,messageId??0,id),scopeId,isCurrent:valid})){
    const owners=fullscreenScopes.current.get(version)??new Set<string>();owners.add(scopeId);fullscreenScopes.current.set(version,owners);setViewer(null);
   }
   return;
  }
  // Standalone legacy/QA consumers without the app provider retain their viewer.
  // A ready provider's rejection never bypasses its account/source checks.
  const node=fromPreview?previews.current.get(id):undefined;
  if(node){node.measureInWindow((x,y,width,height)=>{if(valid())setViewer({artifact,imageDataUrl:data.current[id]?.imageDataUrl,account:current.account,origin:width>0&&height>0?{x,y,width,height}:undefined});});}
  else if(valid())setViewer({artifact,imageDataUrl:data.current[id]?.imageDataUrl,account:current.account});
 },[load,userId,htmlOwner,ticketId,messageId]);
 const openEntity=useCallback((artifact:HelpHtmlArtifact)=>{
  const target=helpHtmlEntityTarget(artifact.entity?.url);
  if(!target||!userId||scope.current.account!==account||loadedScope.current.account!==account||loadedScope.current.identity!==scope.current.identity||loadedScope.current.resolve!==scope.current.resolve||loadedScope.current.ticketId!==ticketId||loadedScope.current.messageId!==messageId||data.current[artifact.id]?.artifact!==artifact)return;
  Keyboard.dismiss();entities.openEntity(target,artifact.title);
 },[entities,account,userId,ticketId,messageId]);
 const openWebsite=useCallback((artifact:HelpHtmlArtifact,url:string)=>{
  if(!userId||scope.current.account!==account||loadedScope.current.account!==account||loadedScope.current.identity!==scope.current.identity||loadedScope.current.resolve!==scope.current.resolve||loadedScope.current.ticketId!==ticketId||loadedScope.current.messageId!==messageId||data.current[artifact.id]?.artifact!==artifact)return;
  Keyboard.dismiss();entities.openWeb?.(url,artifact.title);
 },[entities,account,userId,ticketId,messageId]);
 const consumedRequest=useRef<string|null>(null),consume=useRef(onRequestConsumed);consume.current=onRequestConsumed;
 useEffect(()=>{
  if(!requestedId){consumedRequest.current=null;return;}
  if(!sameScope||!files.some(file=>helpHtmlAttachmentId(file)===requestedId))return;
  const key=`${account}:${identity}:${requestedId}`;if(consumedRequest.current===key)return;
  const version=generation.current;
  // A route intent is an explicit action, independent of preview priority.
  consumedRequest.current=key;void load(requestedId).then(artifact=>{
   if(!artifact?.full||generation.current!==version||consumedRequest.current!==key)return;
   return open(requestedId).then(()=>{if(generation.current===version&&consumedRequest.current===key)consume.current?.();});
  });
 },[requestedId,account,identity,sameScope,loaded,open,load]);
 const navigation=useMemo(()=>({
  canOpen:(id:string)=>!!files.find(file=>helpHtmlAttachmentId(file)===id)&&(!visibleLoaded[id]?.artifact||!!visibleLoaded[id].artifact?.full),
  open:(id:string)=>{void open(id);},
  previews:<View testID="help-html-attachments" style={{gap:12,minWidth:0}}>{files.map(file=>{
   const id=helpHtmlAttachmentId(file)!,item=visibleLoaded[id],artifact=item?.artifact;
   // Like image dimensions, layout comes with the message, not from a later
   // download/render. Old or invalid metadata uses the same square at every
   // stage; discovering CSS must never move the surrounding conversation.
   const height=Number.isFinite(file.height)&&file.height!>=HELP_HTML_COMPACT_HEIGHT_MIN&&file.height!<=HELP_HTML_COMPACT_HEIGHT_MAX?file.height!:undefined;
   const websiteLinks=artifact?.compact&&!artifact.entity?helpHtmlWebLinks(artifact.compact.html):[];
   if(artifact&&!artifact.compact)return <Pressable key={id} testID={`help-html-open-${id}`} onPress={()=>void open(id)} accessibilityRole="link" style={{width:'100%',...(height===undefined?{aspectRatio:1}:{height}),justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:15}}>{artifact.title}</Text></Pressable>;
   return <View key={id} ref={node=>{if(node)previews.current.set(id,node);else previews.current.delete(id);}} collapsable={false} testID={`help-html-compact-${id}`} style={{width:'100%',...(height===undefined?{aspectRatio:1}:{height}),overflow:'hidden'}}>
    {artifact?.compact&&(mediaPriority==='visible'||mediaPriority==='near')&&previewReady?<HelpHtmlSurface compact variant={artifact.compact} imageDataUrl={item.imageDataUrl} skipLoadingPlaceholder={item.cached} label={artifact.description||artifact.title}/>:item?.error?<Pressable onPress={()=>void load(id)} accessibilityRole="button" accessibilityLabel="Повторить загрузку примера" style={{flex:1,justifyContent:'center'}}><Text style={{color:c.muted}}>Не удалось загрузить пример. Повторить</Text></Pressable>:<LoadingPlaceholder dark={c.dark} variant={height!==undefined&&height<160?'row':'card'} accessibilityLabel="Загрузка карточки"/>}
    {artifact?.entity?<Pressable testID={`help-html-entity-${id}`} accessibilityRole="button" accessibilityLabel={`Открыть ${artifact.title}`} onPress={()=>openEntity(artifact)} style={{position:'absolute',left:0,right:0,top:0,bottom:0}}/>:null}
    {artifact&&websiteLinks.length===1?<Pressable testID={`help-html-website-${id}`} accessibilityRole="link" accessibilityLabel={websiteLinks[0].label} onPress={()=>openWebsite(artifact,websiteLinks[0].url)} style={{position:'absolute',left:0,right:0,top:0,bottom:0}}/>:null}
    {artifact?.full?<Pressable testID={`help-html-expand-${id}`} accessibilityRole="button" accessibilityLabel="Открыть на весь экран" onPress={()=>void open(id,true)} style={{position:'absolute',right:0,top:0,width:44,height:44,alignItems:'center',justifyContent:'center'}}><View style={{width:32,height:32,borderRadius:16,backgroundColor:c.background,alignItems:'center',justifyContent:'center'}}><Ionicons name="expand-outline" size={21} color={c.text}/></View></Pressable>:null}
   </View>;
  })}</View>,
 }),[identity,loaded,sameScope,c,open,load,openEntity,openWebsite,mediaPriority,previewReady]);
 return <HelpHtmlContext.Provider value={navigation}>{children}{viewer&&account&&sameScope&&viewer.account===account?<HelpHtmlViewer artifact={viewer.artifact} imageDataUrl={viewer.imageDataUrl} onOpenEntity={viewer.artifact.entity?()=>openEntity(viewer.artifact):undefined} origin={viewer.origin} expectedUserId={userId} link={helpHtmlPageLink(ticketId??0,messageId??0,viewer.artifact.id)} onClose={()=>setViewer(null)}/>:null}</HelpHtmlContext.Provider>;
}
