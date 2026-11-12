import React,{useRef} from 'react';
import {Linking,View,type FlatListProps,type ScrollViewProps} from 'react-native';
import {router} from 'expo-router';
import {ProfileOnecConnections} from '../profile/ui/ProfileOnecConnections';
import {EntityCardContent} from './entityRegistry';
import {HelpHtmlSurface} from '../help/components/HelpHtmlSurface';
import {useEntityCards} from './EntityCardContext';
import {openAppLink} from '../../shared/appLinks';
import {helpChatDestination} from '../help/helpChatLink';
import type {EntityCardHostProps} from './EntityCardHost.types';

type Props=Pick<EntityCardHostProps,'state'|'userId'|'onOpen'|'onBack'|'onTitle'|'onScroll'|'onConnect'|'onPageControls'|'onWebLocation'>&{ScrollComponent:React.ComponentType<React.PropsWithChildren<ScrollViewProps>>;ListComponent?:React.ComponentType<FlatListProps<any>>;contentTopInset?:number};
export function EntityCardBody({state,userId,onOpen,onBack,onTitle,onScroll,onConnect,onPageControls,onWebLocation,ScrollComponent,ListComponent,contentTopInset=0}:Props){
 const navigation=useEntityCards(),frame=state.frames.at(-1)!;
 const latest=useRef({frameKey:frame.key,account:state.account,closing:state.closing});latest.current={frameKey:frame.key,account:state.account,closing:state.closing};
 const openLink=(url:string)=>{
  if(latest.current.closing||latest.current.account!==state.account||latest.current.frameKey!==frame.key)return false;
  return openAppLink(url,{openEntity:onOpen,openWeb:navigation.openWeb,openChat:id=>{navigation.close();router.navigate(helpChatDestination(id));},openHelpDestination:destination=>{navigation.close();router.navigate({pathname:'/services/help',params:{ticketId:String(destination.ticketId),htmlId:destination.htmlId,...(destination.messageId?{messageId:String(destination.messageId)}:{})}});},openSystem:value=>{void Linking.openURL(value).catch(()=>{});}});
 };
 let content:React.ReactNode=null;
 if(frame.kind==='connection'){
  const scope=state.account,key=frame.key;
  content=<ScrollComponent key={key} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{padding:20,paddingTop:20+contentTopInset,paddingBottom:40}}>
   <View><ProfileOnecConnections userId={userId} initialBase={frame.baseKey} onConnected={async signal=>{if(!signal.aborted&&latest.current.account===scope&&latest.current.frameKey===key&&!latest.current.closing)onBack();}}/></View>
  </ScrollComponent>;
 }else if(frame.kind==='html'){
  if(frame.payload.isCurrent?.()!==false&&frame.payload.expectedUserId===userId&&frame.payload.artifact.full){
   content=<HelpHtmlSurface key={frame.key} variant={frame.payload.artifact.full} label={frame.payload.artifact.title} topInset={contentTopInset} imageDataUrl={frame.payload.imageDataUrl} onOpenLink={openLink} onScroll={offset=>onScroll(frame.key,offset)}/>;
  }
 }else if(frame.kind==='entity'){
  content=<EntityCardContent key={frame.key} target={frame.target} onOpen={onOpen} onTitleChange={title=>onTitle(frame.key,title)} onConnect={onConnect}
   ScrollComponent={ScrollComponent} ListComponent={ListComponent} scrollOffset={frame.scrollOffset} contentTopInset={contentTopInset} onScrollOffsetChange={offset=>onScroll(frame.key,offset)}/>;
 }
 // Keep each site instance while a nested card is on top, preserving its own
 // browser history, form state and scroll without committing a new source URL.
 const webFrames=state.frames.filter(item=>item.kind==='web');
 const WebPage=webFrames.length?(require('../webPages/WebPageContent') as typeof import('../webPages/WebPageContent')).WebPageContent:null;
 return <View style={{flex:1}}>
  {WebPage?webFrames.map(item=><View key={item.key} style={{flex:1,display:item.key===frame.key?'flex':'none'}} pointerEvents={item.key===frame.key?'auto':'none'}>
   <WebPage url={item.url} title={item.title} active={item.key===frame.key&&!state.closing} topInset={contentTopInset}
    onTitle={title=>{if(latest.current.frameKey===item.key&&!latest.current.closing)onTitle(item.key,title);}}
    onLocation={url=>{if(latest.current.frameKey===item.key&&!latest.current.closing)onWebLocation?.(item.key,url);}}
    onControls={controls=>onPageControls?.(item.key,controls)} onScroll={offset=>onScroll(item.key,offset)} onOpenLink={openLink}/>
  </View>):null}
  {content}
 </View>;
}
