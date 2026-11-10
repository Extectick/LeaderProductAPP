/** Actual HTML message remounts, with the shared cache outside the recycled row. */
import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from '../../context/ThemeContext';
import WebInteractionStyles from '../../components/ui/WebInteractionStyles';
import {HelpHtmlMessage} from '../../src/features/help/components/HelpHtmlMessage';
import {HelpHtmlAttachments} from '../../src/features/help/components/HelpHtmlContext';
import {HelpMarkdown} from '../../src/features/help/components/HelpMarkdown';
import {createHelpHtmlCache,HelpHtmlCacheContext} from '../../src/features/help/helpHtmlCache';
import {helpDevActions,helpDevProbe} from '../../src/features/help/helpDiagnostics';
import {htmlPreviewAttachment,htmlPreviewId,htmlPreviewProbe} from './htmlPreviewApiFixture';

const resolve=async()=>({uri:'/qa/html-61'});
const attachments=[htmlPreviewAttachment];
type Sample={at:number;height:number|null;iframes:number;loading:number};
function Preview(){
 const [cache]=React.useState(createHelpHtmlCache),[generation,setGeneration]=React.useState(0),[visible,setVisible]=React.useState(true);
 const samples=React.useRef<Sample[]>([]),latest=React.useRef({generation,visible});latest.current={generation,visible};
 const remount=React.useCallback(()=>{setGeneration(value=>value+1);setVisible(true);},[]);
 React.useEffect(()=>helpDevActions('qa.html',{'fixture.html.remount':remount,'fixture.html.hide':()=>setVisible(false),'fixture.html.show':()=>setVisible(true)}),[remount]);
 React.useEffect(()=>{
  const row=document.querySelector('[data-testid="qa-html-message-row"]');if(!row)return;
  const sample=()=>{
   const card=row.querySelector(`[data-testid="help-html-compact-${htmlPreviewId}"]`),next={at:Math.round(performance.now()),height:card?Math.round(card.getBoundingClientRect().height):null,iframes:row.querySelectorAll('iframe').length,loading:row.querySelectorAll('[role="progressbar"]').length};
   const last=samples.current.at(-1);if(!last||last.height!==next.height||last.iframes!==next.iframes||last.loading!==next.loading){samples.current.push(next);if(samples.current.length>120)samples.current.shift();}
  };
  const mutation=new MutationObserver(sample),resize=new ResizeObserver(sample);
  mutation.observe(row,{subtree:true,childList:true,attributes:true});resize.observe(row);sample();
  return()=>{mutation.disconnect();resize.disconnect();};
 },[]);
 React.useEffect(()=>helpDevProbe('qa.html',async()=>({...htmlPreviewProbe(),...latest.current,samples:[...samples.current]})),[]);
 const control=(label:string,onPress:()=>void)=><Pressable key={label} accessibilityRole="button" onPress={onPress} style={{padding:12,borderRadius:12,backgroundColor:'#edf3fb'}}><Text>{label}</Text></Pressable>;
 return <View style={{flex:1,backgroundColor:'#f7f8fc',padding:16,gap:16}}>
  <Text>QA · настоящий HelpHtmlMessage · высота HTML 128 px</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{control('Перемонтировать строку',remount)}{control(visible?'Скрыть строку':'Показать строку',()=>setVisible(value=>!value))}</View>
  <View testID="qa-html-message-row" style={{width:'100%',maxWidth:760,alignSelf:'center'}}>
   <HelpHtmlCacheContext.Provider value={cache}>{visible?<HelpHtmlMessage key={generation} attachments={attachments} resolve={resolve} ticketId={61} messageId={61001}>
    <HelpMarkdown text="Ваш профиль — нажмите на карточку, чтобы открыть."/><HelpHtmlAttachments/>
   </HelpHtmlMessage>:null}</HelpHtmlCacheContext.Provider>
  </View>
 </View>;
}
export default function HtmlMessagePreview(){return <SafeAreaProvider><ThemeProvider><WebInteractionStyles/><Preview/></ThemeProvider></SafeAreaProvider>;}
