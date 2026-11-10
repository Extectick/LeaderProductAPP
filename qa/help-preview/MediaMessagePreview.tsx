/** Browser-only, synthetic photo/caption QA using the actual message and gallery. */
import React,{useState} from 'react';
import {Pressable,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from '../../context/ThemeContext';
import {HelpMessageBubble} from '../../src/features/help/components/HelpMessageBubble';
import {HelpGallery,type HelpImageOrigin} from '../../src/features/help/components/HelpMedia';
import {useHelpTheme} from '../../src/features/help/helpTheme';
import type {HelpAttachment,HelpMessage} from '../../src/features/help/helpApi';
import {FixtureCacheBoundary} from './FixtureCacheBoundary';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400"><rect width="1080" height="2400" fill="#eff5ff"/><rect x="40" y="40" width="1000" height="2320" rx="30" fill="white"/><text x="90" y="160" font-family="sans-serif" font-size="60" fill="#18334e">Проверка фотографии</text>'+Array.from({length:20},(_,i)=>'<text x="90" y="'+(280+i*94)+'" font-family="sans-serif" font-size="38" fill="#31465b">'+(i+1)+'. Читаемый текст на снимке</text>').join('')+'</svg>';
const file:HelpAttachment={id:'qa-media-portrait',kind:'IMAGE',name:'Синтетический снимок.svg',mimeType:'image/svg+xml',size:svg.length,width:1080,height:2400,url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)};
const resolve=async(attachment:HelpAttachment)=>({uri:attachment.url});
const noop=()=>{};
function Preview(){
 const c=useHelpTheme(),window=useWindowDimensions();
 const [caption,setCaption]=useState(true),[incoming,setIncoming]=useState(false),[gallery,setGallery]=useState<{attachments:HelpAttachment[];index:number;origin?:HelpImageOrigin}|null>(null),[selected,setSelected]=useState(false),[notice,setNotice]=useState('');
 const text='Нужно подготовить таблицу по фотографии.\n\nУчастник и должность\nСотрудник отдела, руководитель проверки.\n\nНазвание задачи\nСверить данные и представить полный список результатов в Excel. В подписи должно быть достаточно места для чтения на телефоне и широком мониторе.\n\nПериод и условия отбора\nПроизвольный период. Проверить результат по исходному документу.';
 const message:HelpMessage={id:63001,ticketId:63000,sequence:1,clientMessageId:null,authorId:incoming?202:101,author:{id:incoming?202:101,name:incoming?'QA · IT':'Вы',avatarUrl:null},authorRole:incoming?'IT':'USER',kind:'TEXT',text:caption?text:'',createdAt:'2026-11-07T09:00:00Z',editedAt:null,replyToId:null,replyTo:null,forwardedFromId:null,rating:null,attachments:[file],reactions:[]};
 return <View style={{flex:1,backgroundColor:c.background}}>
  <View style={{padding:12,gap:8,flexDirection:'row',flexWrap:'wrap',alignItems:'center'}}><Text style={{color:c.muted}}>QA · фото и подпись · синтетические данные</Text><Pressable accessibilityRole="button" onPress={()=>setCaption(v=>!v)}><Text style={{color:c.accentText}}>Переключить подпись</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setIncoming(v=>!v)}><Text style={{color:c.accentText}}>Переключить автора</Text></Pressable><Text style={{color:c.muted}}>{notice}</Text></View>
  <View style={{flex:1,flexDirection:'row'}}>{window.width>=1000?<View testID="media-qa-sidebar" style={{width:300,borderRightWidth:1,borderColor:c.line,padding:20}}><Text style={{color:c.muted}}>Область списка чатов · 300 px</Text></View>:null}<ScrollView style={{flex:1}} contentContainerStyle={{alignItems:'center',paddingVertical:16}}>
   <View testID="media-qa-column" style={{width:'100%',maxWidth:900}}><HelpMessageBubble message={message} userId={101} open canInteract selected={selected} highlighted={false} solution={false} resolve={resolve} onMenu={()=>setSelected(true)} onDismissMenu={()=>setSelected(false)} onReply={noop} onCopy={noop} onEdit={noop} onForward={noop} onReaction={noop} onQuote={noop} onImage={(attachments,index,origin)=>setGallery({attachments,index,origin})} onFile={noop} onCloseTicket={noop} onRequestIt={noop} onError={setNotice}/></View>
  </ScrollView></View>
  {gallery?<HelpGallery {...gallery} initialIndex={gallery.index} resolve={resolve} onClose={()=>setGallery(null)} onError={setNotice}/>:null}
 </View>;
}
export default function MediaMessagePreview(){return <SafeAreaProvider><ThemeProvider><FixtureCacheBoundary><Preview/></FixtureCacheBoundary></ThemeProvider></SafeAreaProvider>;}
