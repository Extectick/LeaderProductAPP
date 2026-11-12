import React,{memo,useMemo,useRef} from 'react';
import {Text,View} from 'react-native';
import {useHelpTextReveal} from '../useHelpTextReveal';
import {helpMarkdownBlocks} from '../helpMarkdownModel';
import {useHelpTheme} from '../helpTheme';
import type {HelpAssistantStatus} from '../helpAssistant';
import {HelpMarkdown} from './HelpMarkdown';

export const HelpStreamingAnswer=memo(function HelpStreamingAnswer({identity,text,status,draft}:{identity:string;text:string;status:HelpAssistantStatus;draft:boolean}){
 const active=status==='thinking'||status==='streaming',c=useHelpTheme();
 const presentation=useRef({identity,streamed:active});
 if(presentation.current.identity!==identity)presentation.current={identity,streamed:active};
 else if(active)presentation.current.streamed=true;
 // Saved completed answers need one Markdown parse. Keep the block tree for
 // answers streamed in this instance so completion never remounts their blocks.
 const historical=status==='completed'&&!presentation.current.streamed;
 const visible=useHelpTextReveal({identity,text,active,completed:status==='completed'});
 const blocks=useMemo(()=>historical?null:helpMarkdownBlocks(text),[text,historical]);
 if(!visible)return null;
 return <View testID="help-ai-answer" style={{gap:6}}>
  {active||draft?<Text style={{color:c.muted,fontSize:11}}>{active?'Формируется ответ…':'Незавершённый ответ'}</Text>:null}
  <View testID="help-ai-streaming-text" style={{minWidth:0,gap:3}}>
   {blocks?blocks.map(block=>visible.length>block.start?<HelpMarkdown key={block.start} text={block.text.slice(0,visible.length-block.start)}/>:null):<HelpMarkdown text={visible}/>}
  </View>
 </View>;
});

export const HelpStreamingAnalysis=memo(function HelpStreamingAnalysis({identity,text,active,completed}:{identity:string;text:string;active:boolean;completed:boolean}){
 const c=useHelpTheme(),visible=useHelpTextReveal({identity,text,active,completed});
 return visible.trim()?<Text selectable style={{color:c.text,fontSize:13,lineHeight:20,paddingLeft:22}}>{visible}</Text>:null;
});
