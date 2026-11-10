import {appWebControlProps} from '@/components/ui/appWebInteraction';
import React,{memo,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {HELP_ASSISTANT_STEPS,type HelpAssistantRun,type HelpAssistantActivity} from '../helpAssistant';
import {helpActivityLabel} from '../helpActivityPresentation';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {HelpStreamingAnalysis} from './HelpStreamingText';

const ProgressRow=memo(function ProgressRow({item}:{item:HelpAssistantActivity}){
 const c=useHelpTheme(),reduced=useHelpReducedMotion();
 const done=item.status==='completed',failed=item.status==='failed';
 return <View testID={`help-ai-activity-${item.id}`} style={{gap:4,paddingVertical:5}}>
  <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
   {done||failed||reduced?<Ionicons name={done?'checkmark':failed?'alert-circle-outline':'time-outline'} size={16} color={failed?c.danger:done?c.green:c.accentText}/>:<ActivityIndicator size={14} color={c.accentText}/>}
   <Text style={{flex:1,color:done?c.muted:c.text,fontSize:13,lineHeight:19}}>{helpActivityLabel(item)}</Text>
  </View>
  {item.kind==='analysis'?<HelpStreamingAnalysis identity={item.id} text={item.text||''} active={item.status==='running'} completed={done}/>:null}
 </View>;
});

/** Show public progress only while this run is producing its answer. */
export function HelpAssistantProgress({run}:{run:HelpAssistantRun}){
 const list=useRef<ScrollView>(null),following=useRef(true);
 const c=useHelpTheme(),reduced=useHelpReducedMotion(),[expanded,setExpanded]=useState(false);
 useEffect(()=>{setExpanded(false);following.current=true;},[run.runId]);
 if(run.status!=='thinking'&&run.status!=='streaming')return null;
 const activities:HelpAssistantActivity[]=run.activityVersion===1?run.activities||[]:HELP_ASSISTANT_STEPS.slice(0,run.step+1).map((label,index)=>({id:`${run.runId}:${index}`,kind:'tool',label,status:index<run.completedSteps?'completed':'running'}));
 if(!activities.length)return null;
 const current=activities.findLast(item=>item.status==='running')??activities.at(-1)!;
 const end=(event:any)=>{const e=event.nativeEvent;following.current=e.contentSize.height-e.layoutMeasurement.height-e.contentOffset.y<24;};
 return <View testID="help-ai-work-log" style={{marginBottom:8}}>
  <Pressable {...appWebControlProps('row')} testID="help-ai-work-toggle" accessibilityRole="button" accessibilityLabel={expanded?'Скрыть действия ИИ':'Показать действия ИИ'} aria-expanded={expanded} accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:8}}>
   {current.status==='running'&&!reduced?<ActivityIndicator size={14} color={c.muted}/>:<Ionicons name={current.status==='failed'?'alert-circle-outline':current.status==='completed'?'checkmark':'ellipsis-horizontal'} size={16} color={c.muted}/>}
   <Text numberOfLines={2} accessibilityLiveRegion="polite" style={{flex:1,minWidth:0,color:c.muted,fontSize:14,lineHeight:21}}>{helpActivityLabel(current)}</Text>
   <Ionicons name={expanded?'chevron-up':'chevron-down'} size={14} color={c.muted}/>
  </Pressable>
  {expanded?<ScrollView nestedScrollEnabled style={{maxHeight:260,marginLeft:24,paddingLeft:12,borderLeftWidth:1,borderLeftColor:c.line}} onScrollBeginDrag={()=>{following.current=false;}} onScrollEndDrag={end} onMomentumScrollEnd={end} onContentSizeChange={()=>{if(following.current)list.current?.scrollToEnd({animated:false});}} ref={list}>
  {activities.map(item=><ProgressRow key={item.id} item={item}/>)}
 </ScrollView>:null}</View>;
}
