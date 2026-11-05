import React,{useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Keyboard,Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AuthContext} from '@/context/AuthContext';
import {API_BASE_URL} from '@/utils/config';
import {loadHelpAttachmentText,type HelpAttachment} from '../helpApi';
import {HELP_HTML_MAX_BYTES,helpHtmlCompactHeight,helpHtmlAttachmentId,helpHtmlPageLink,parseHelpHtmlArtifact,type HelpHtmlArtifact} from '../helpHtml';
import {useHelpTheme} from '../helpTheme';
import type {ResolveHelpMedia} from './HelpMedia';
import {HelpHtmlContext} from './HelpHtmlContext';
import {HelpHtmlSurface} from './HelpHtmlSurface';
import {HelpHtmlViewer,type HelpHtmlOrigin} from './HelpHtmlViewer';
import {helpHtmlEntityTarget,loadHelpHtmlEntityPreview} from '../helpHtmlEntity';
import {useEntityCards} from '@/src/features/entityCards/EntityCardContext';
import {HelpMediaLoadingContext} from '../helpMediaLoading';
type Loaded={artifact?:HelpHtmlArtifact;imageDataUrl?:string;error?:boolean};

/** Links are scoped to real attachments of this message, never model URLs. */
export function HelpHtmlMessage({attachments,resolve,children,ticketId,messageId,requestedId,onRequestConsumed}:{attachments:HelpAttachment[];resolve?:ResolveHelpMedia;children:React.ReactNode;ticketId?:number;messageId?:number;requestedId?:string;onRequestConsumed?:()=>void}){
 const entities=useEntityCards();
 const mediaPriority=useContext(HelpMediaLoadingContext);
 const [previewReady,setPreviewReady]=useState(false);
 const c=useHelpTheme(),auth=useContext(AuthContext),userId=auth?.isAuthenticated?auth.profile?.id:undefined;
 const account=userId?`${API_BASE_URL}:${userId}`:'';
 const files=attachments.filter(file=>helpHtmlAttachmentId(file)!==null),identity=files.map(file=>`${file.id}:${file.name}:${file.url}`).join('|');
 const [loaded,setLoaded]=useState<Record<string,Loaded>>({}),[viewer,setViewer]=useState<{artifact:HelpHtmlArtifact;origin?:HelpHtmlOrigin;imageDataUrl?:string;account:string}|null>(null);
 const pending=useRef(new Map<string,Promise<HelpHtmlArtifact|null>>()),data=useRef<Record<string,Loaded>>({}),controller=useRef(new AbortController()),generation=useRef(0),previews=useRef(new Map<string,View>());
 const scope=useRef({account,resolve,identity}),loadedScope=useRef({account,resolve,identity});scope.current={account,resolve,identity};
 const sameScope=loadedScope.current.account===account&&loadedScope.current.resolve===resolve&&loadedScope.current.identity===identity;
 const visibleLoaded=sameScope?loaded:{};
 useEffect(()=>{
  const version=++generation.current,abort=new AbortController();loadedScope.current={account,resolve,identity};controller.current=abort;pending.current.clear();data.current={};setLoaded({});setViewer(null);
  return()=>{abort.abort();if(generation.current===version)++generation.current;};
 },[account,resolve,identity]);
 const load=useCallback((id:string):Promise<HelpHtmlArtifact|null>=>{
  const current=scope.current;if(!userId||!current.account||!current.resolve||loadedScope.current.account!==current.account||loadedScope.current.resolve!==current.resolve||loadedScope.current.identity!==current.identity)return Promise.resolve(null);
  const cached=data.current[id]?.artifact;if(cached)return Promise.resolve(cached);
  const waiting=pending.current.get(id);if(waiting)return waiting;
  const file=files.find(item=>helpHtmlAttachmentId(item)===id);if(!file)return Promise.resolve(null);
  const version=generation.current,signal=controller.current.signal;
  const valid=()=>!signal.aborted&&version===generation.current&&scope.current.account===current.account&&scope.current.resolve===current.resolve&&scope.current.identity===current.identity;
  const task=(async()=>{
   try{
    const text=await loadHelpAttachmentText(file,userId,signal,HELP_HTML_MAX_BYTES),artifact=parseHelpHtmlArtifact(text,id);
    if(!valid())return null;
    let imageDataUrl:string|undefined;
    if(artifact.entity){try{imageDataUrl=(await loadHelpHtmlEntityPreview(artifact.entity.url,userId,signal)).imageDataUrl;}catch{signal.throwIfAborted();}}
    if(!valid())return null;data.current={...data.current,[id]:{artifact,imageDataUrl}};setLoaded(data.current);return artifact;
   }catch{if(valid()){data.current={...data.current,[id]:{error:true}};setLoaded(data.current);}return null;}
   finally{if(valid())pending.current.delete(id);}
  })();pending.current.set(id,task);return task;
 // Every closure is replaced on account or descriptor changes; late reads are fenced above.
 },[account,resolve,identity,userId]);
 useEffect(()=>{
  setPreviewReady(false);
  if(mediaPriority!=='visible'||!account||!resolve)return;
  let cancelled=false,frame=0;
  // Let the already-mounted message paint before download/parse/WebView work.
  // Recycled near/retained rows reserve the same preview without starting it.
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
   if(cancelled)return;
   setPreviewReady(true);
   for(const file of files)void load(helpHtmlAttachmentId(file)!);
  });});
  return()=>{cancelled=true;cancelAnimationFrame(frame);};
 },[mediaPriority,account,resolve,load,identity]);
 const open=useCallback(async(id:string,fromPreview=false)=>{
  const version=generation.current,artifact=await load(id);if(!artifact?.full||version!==generation.current)return;
  Keyboard.dismiss();
  const node=fromPreview?previews.current.get(id):undefined;
  if(node){node.measureInWindow((x,y,width,height)=>{if(version===generation.current)setViewer({artifact,imageDataUrl:data.current[id]?.imageDataUrl,account:scope.current.account,origin:width>0&&height>0?{x,y,width,height}:undefined});});}
  else setViewer({artifact,imageDataUrl:data.current[id]?.imageDataUrl,account:scope.current.account});
 },[load]);
 const openEntity=useCallback((artifact:HelpHtmlArtifact)=>{
  const target=helpHtmlEntityTarget(artifact.entity?.url);
  if(!target||!userId||scope.current.account!==account||loadedScope.current.account!==account||loadedScope.current.identity!==scope.current.identity||loadedScope.current.resolve!==scope.current.resolve||data.current[artifact.id]?.artifact!==artifact)return;
  Keyboard.dismiss();entities.openEntity(target,artifact.title);
 },[entities,account,userId]);
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
   const height=helpHtmlCompactHeight(artifact?.compact);
   if(artifact&&!artifact.compact)return <Pressable key={id} testID={`help-html-open-${id}`} onPress={()=>void open(id)} accessibilityRole="link" style={{minHeight:44,justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:15}}>{artifact.title}</Text></Pressable>;
   return <View key={id} ref={node=>{if(node)previews.current.set(id,node);else previews.current.delete(id);}} collapsable={false} testID={`help-html-compact-${id}`} style={{width:'100%',...(height===undefined?{aspectRatio:1}:{height}),overflow:'hidden'}}>
    {artifact?.compact&&mediaPriority==='visible'&&previewReady?<HelpHtmlSurface compact variant={artifact.compact} imageDataUrl={item.imageDataUrl} label={artifact.description||artifact.title}/>:item?.error?<Pressable onPress={()=>void load(id)} accessibilityRole="button" accessibilityLabel="Повторить загрузку примера" style={{flex:1,justifyContent:'center'}}><Text style={{color:c.muted}}>Не удалось загрузить пример. Повторить</Text></Pressable>:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}>{!artifact&&mediaPriority==='visible'&&previewReady?<ActivityIndicator color={c.muted}/>:null}</View>}
    {artifact?.entity?<Pressable testID={`help-html-entity-${id}`} accessibilityRole="button" accessibilityLabel={`Открыть ${artifact.title}`} onPress={()=>openEntity(artifact)} style={{position:'absolute',left:0,right:0,top:0,bottom:0}}/>:null}
    {artifact?.full?<Pressable testID={`help-html-expand-${id}`} accessibilityRole="button" accessibilityLabel="Открыть на весь экран" onPress={()=>void open(id,true)} style={{position:'absolute',right:0,top:0,width:44,height:44,alignItems:'center',justifyContent:'center'}}><View style={{width:32,height:32,borderRadius:16,backgroundColor:c.background,alignItems:'center',justifyContent:'center'}}><Ionicons name="expand-outline" size={21} color={c.text}/></View></Pressable>:null}
   </View>;
  })}</View>,
 }),[identity,loaded,sameScope,c,open,load,openEntity,mediaPriority,previewReady]);
 return <HelpHtmlContext.Provider value={navigation}>{children}{viewer&&account&&sameScope&&viewer.account===account?<HelpHtmlViewer artifact={viewer.artifact} imageDataUrl={viewer.imageDataUrl} onOpenEntity={viewer.artifact.entity?()=>openEntity(viewer.artifact):undefined} origin={viewer.origin} expectedUserId={userId} link={helpHtmlPageLink(ticketId??0,messageId??0,viewer.artifact.id)} onClose={()=>setViewer(null)}/>:null}</HelpHtmlContext.Provider>;
}
