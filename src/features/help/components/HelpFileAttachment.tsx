import {LoadingPlaceholder} from '@/components/ui/LoadingPlaceholder';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {HelpAttachment} from '../helpApi';
import {useHelpTheme} from '../helpTheme';
import {helpFileSize} from '../helpUiUtils';

type Props={file:HelpAttachment;uploading?:boolean;scope?:unknown;onPress:(file:HelpAttachment)=>Promise<unknown>|void;onError:(text:string)=>void};
/** Download state stays in the attachment cell, without resizing the message. */
export function HelpFileAttachment({file,uploading=false,scope,onPress,onError}:Props){
 const c=useHelpTheme(),[state,setState]=useState<'idle'|'busy'|'failed'>('idle');
 const generation=useRef(0),operation=useRef<object|null>(null),mounted=useRef(false);
 useLayoutEffect(()=>{
  const version=++generation.current;mounted.current=true;operation.current=null;setState('idle');
  return()=>{if(generation.current===version){mounted.current=false;operation.current=null;}};
 },[file.id,file.url,scope]);
 const busy=uploading||state==='busy';
 async function download(){
  if(uploading||operation.current||!mounted.current)return;
  const job={},version=generation.current;operation.current=job;setState('busy');
  const valid=()=>mounted.current&&generation.current===version&&operation.current===job;
  try{const result=await onPress(file);if(valid())setState(result===false?'failed':'idle');}
  catch{if(valid()){setState('failed');onError('Не удалось скачать файл. Попробуйте ещё раз.');}}
  finally{if(valid())operation.current=null;}
 }
 return <Pressable testID={`help-file-attachment-${file.id}`} onPress={()=>void download()} accessibilityRole="button"
  accessibilityLabel={busy?`${uploading?'Отправка':'Загрузка'} файла ${file.name}`:state==='failed'?`Повторить загрузку ${file.name}`:`Скачать ${file.name}`}
  accessibilityState={{busy,disabled:busy}} disabled={busy}
  style={{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:6,borderRadius:8,backgroundColor:busy?(c.dark?'#343A42':'#E4E7EB'):'transparent'}}>
  <View style={{width:28,height:28,alignItems:'center',justifyContent:'center'}}>{busy?<LoadingPlaceholder dark={c.dark} variant="icon" accessibilityLabel="Загрузка файла" style={{width:28,height:28}}/>:<Ionicons name={state==='failed'?'refresh-outline':'document-outline'} size={28} color={c.accentText}/>}</View>
  <View style={{flexShrink:1}}><Text numberOfLines={2} style={{color:c.text,fontSize:13,fontWeight:'500'}}>{file.name}</Text>
   <Text numberOfLines={1} accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:10,lineHeight:12}}>{busy?uploading?'Отправка…':'Загрузка…':state==='failed'?'Не загружен · Повторить':helpFileSize(file.size)}</Text>
  </View>
 </Pressable>;
}
