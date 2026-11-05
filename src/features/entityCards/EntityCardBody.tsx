import React,{useRef} from 'react';
import {View,type ScrollViewProps} from 'react-native';
import {ProfileOnecConnections} from '../profile/ui/ProfileOnecConnections';
import {EntityCardContent} from './entityRegistry';
import type {EntityCardHostProps} from './EntityCardHost.types';

export function EntityCardBody({state,userId,onOpen,onBack,onTitle,onScroll,onConnect,ScrollComponent}:{state:EntityCardHostProps['state'];userId:number;onOpen:EntityCardHostProps['onOpen'];onBack:()=>void;onTitle:EntityCardHostProps['onTitle'];onScroll:EntityCardHostProps['onScroll'];onConnect:EntityCardHostProps['onConnect'];ScrollComponent:React.ComponentType<React.PropsWithChildren<ScrollViewProps>>}){
 const frame=state.frames.at(-1)!;
 const latest=useRef({frameKey:frame.key,account:state.account,closing:state.closing});latest.current={frameKey:frame.key,account:state.account,closing:state.closing};
 if(frame.kind==='connection'){
  const scope=state.account,key=frame.key;
  return <ScrollComponent key={key} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40}}>
   <View><ProfileOnecConnections userId={userId} initialBase={frame.baseKey} onConnected={async signal=>{if(!signal.aborted&&latest.current.account===scope&&latest.current.frameKey===key&&!latest.current.closing)onBack();}}/></View>
  </ScrollComponent>;
 }
 return <EntityCardContent key={frame.key} target={frame.target} onOpen={onOpen} onTitleChange={title=>onTitle(frame.key,title)} onConnect={onConnect}
  ScrollComponent={ScrollComponent} scrollOffset={frame.scrollOffset} onScrollOffsetChange={offset=>onScroll(frame.key,offset)}/>;
}
