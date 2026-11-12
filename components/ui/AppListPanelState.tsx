import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View,type LayoutChangeEvent,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAppSurfaceTheme} from './appSurfaceTokens';
import {appWebControlProps} from './appWebInteraction';

export type AppListLoadState={
  /** Changes when the query/account/filter changes; stale handlers cannot page the new list. */
  scope:string;itemCount:number;loading:boolean;hasMore?:boolean;disabled?:boolean;error?:string|null;query?:string;
  loadingLabel?:string;emptyTitle?:string;emptyDescription?:string;
  /** Remaining unobscured viewport lengths at which the next page starts loading. */
  prefetchScreens?:number;
  onLoadMore?:()=>void|Promise<unknown>;onRetry?:()=>void|Promise<unknown>;onClear?:()=>void;
};
export type AppListBindings={
  emptyState:React.ReactElement|null;footerState:React.ReactElement|null;
  onEndReached:()=>void;
  onScroll:(event:NativeSyntheticEvent<NativeScrollEvent>)=>void;
  onLayout:(event:LayoutChangeEvent)=>void;
  onContentSizeChange:(width:number,height:number)=>void;
};

/** One paging gate for virtualized lists and ordinary scroll views. Fetch/data remain service-owned. */
export function useAppListPanelState(state:AppListLoadState|undefined,active:boolean,insets:{paddingTop:number;paddingBottom:number}):AppListBindings {
  const generation=useRef({scope:state?.scope,value:0});
  if(generation.current.scope!==state?.scope)generation.current={scope:state?.scope,value:generation.current.value+1};
  const epoch=generation.current.value;
  const measurementKey=JSON.stringify([epoch,state?.itemCount,insets.paddingTop,insets.paddingBottom]);
  const latest=useRef({state,active,insets,epoch,measurementKey});latest.current={state,active,insets,epoch,measurementKey};
  const mounted=useRef(true),pending=useRef<{scope:string;epoch:number;token:object}|null>(null),attempted=useRef('');
  const geometry=useRef({scope:state?.scope,height:0,content:0,offset:0,measurementKey:''});
  const [phase,setPhase]=useState<{epoch:number;busy:boolean;error:string|null}>({epoch:-1,busy:false,error:null});
  const scope=state?.scope??'';
  if(geometry.current.scope!==state?.scope)geometry.current={scope:state?.scope,height:geometry.current.height,content:0,offset:0,measurementKey:''};
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pending.current=null;};},[]);
  const run=useCallback((mode:'auto'|'more'|'retry')=>{
    const now=latest.current,s=now.state;
    if(!s||s.scope!==scope||now.epoch!==epoch||!now.active||s.disabled||s.loading||pending.current?.epoch===epoch)return;
    const retry=mode==='retry',callback=retry?s.onRetry:s.onLoadMore;
    if(!callback||!retry&&(!s.hasMore||s.error))return;
    const key=JSON.stringify([epoch,scope,s.itemCount]);
    if(mode==='auto'&&(attempted.current===key||s.itemCount===0))return;
    attempted.current=retry?'':key;
    const token={};pending.current={scope,epoch,token};setPhase({epoch,busy:true,error:null});
    Promise.resolve().then(()=>{
      if(!mounted.current||latest.current.epoch!==epoch||!latest.current.active||latest.current.state?.disabled||pending.current?.token!==token){if(pending.current?.token===token)attempted.current='';return;}
      return callback();
    }).catch(()=>{
      if(mounted.current&&latest.current.epoch===epoch&&pending.current?.token===token)setPhase({epoch,busy:false,error:'Не удалось загрузить список'});
    }).finally(()=>{
      if(pending.current?.token!==token)return;
      pending.current=null;
      if(mounted.current&&latest.current.epoch===epoch)setPhase(previous=>previous.epoch===epoch?{...previous,busy:false}:previous);
    });
  },[scope,epoch]);
  const nearEnd=useCallback(()=>{
    const g=geometry.current,now=latest.current;
    if(latest.current.epoch!==epoch||g.scope!==scope||g.measurementKey!==now.measurementKey||g.height<=0||g.content<=0)return;
    const available=Math.max(1,g.height-now.insets.paddingTop-now.insets.paddingBottom);
    if(g.content-g.height-g.offset<=Math.max(80,available*(now.state?.prefetchScreens??.5)))run('auto');
  },[scope,epoch,run]);
  useEffect(()=>{nearEnd();},[nearEnd,state?.itemCount,state?.loading,state?.hasMore,state?.disabled,active]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    if(latest.current.measurementKey!==measurementKey)return;
    const e=event.nativeEvent;geometry.current={scope,height:e.layoutMeasurement.height,content:e.contentSize.height,offset:e.contentOffset.y,measurementKey};nearEnd();
  },[scope,epoch,measurementKey,nearEnd]);
  const onLayout=useCallback((event:LayoutChangeEvent)=>{if(latest.current.epoch!==epoch)return;geometry.current.height=event.nativeEvent.layout.height;nearEnd();},[scope,epoch,nearEnd]);
  const onContentSizeChange=useCallback((_width:number,height:number)=>{
    // A render with real rows must not inherit the short skeleton's geometry.
    // Accept only a measurement produced for this scope/count/panel inset set.
    if(latest.current.measurementKey!==measurementKey)return;
    geometry.current.content=height;geometry.current.measurementKey=measurementKey;nearEnd();
  },[scope,epoch,measurementKey,nearEnd]);
  const busy=Boolean(state?.loading||phase.epoch===epoch&&phase.busy),error=state?.error||(phase.epoch===epoch?phase.error:null);
  const retry=()=>run('retry'),more=()=>run('more');
  return {
    emptyState:state?<AppListPanelStatus state={state} loading={busy} error={error} onRetry={retry}/>:null,
    footerState:state&&state.itemCount>0?<AppListPanelStatus state={state} loading={busy} error={error} onRetry={retry} onMore={more} compact/>:null,
    onEndReached:()=>run('auto'),onScroll,onLayout,onContentSizeChange,
  };
}

function ListAction({label,onPress,disabled}:{label:string;onPress:()=>void;disabled?:boolean}){
  const colors=useAppSurfaceTheme();
  return <Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({pressed})=>({minHeight:40,paddingHorizontal:16,borderRadius:20,justifyContent:'center',alignItems:'center',backgroundColor:pressed?colors.soft:'transparent',opacity:disabled ? .45 : 1})}>
    <Text style={{fontSize:14,color:colors.accentText,fontWeight:'500'}}>{label}</Text>
  </Pressable>;
}
function AppListPanelStatus({state,loading,error,onRetry,onMore,compact=false}:{state:AppListLoadState;loading:boolean;error?:string|null;onRetry:()=>void;onMore?:()=>void;compact?:boolean}){
  const colors=useAppSurfaceTheme();
  if(loading)return compact?<View testID="app-list-loading-more" accessibilityRole="progressbar" accessibilityLabel="Загружаем ещё" style={{padding:16,alignItems:'center',gap:8}}>
    <ActivityIndicator color={colors.accent} size="small"/><Text style={{color:colors.muted,fontSize:13}}>Загружаем ещё…</Text>
  </View>:<View testID="app-list-loading" accessibilityRole="progressbar" accessibilityLabel={state.loadingLabel??'Загрузка списка'} accessibilityState={{busy:true}} style={{paddingHorizontal:16,paddingVertical:12,gap:24}}>
    {[0,1,2,3].map(index=><View key={index} importantForAccessibility="no-hide-descendants" aria-hidden style={{height:52,gap:10,justifyContent:'center'}}>
      <View style={{height:14,width:index%2?'68%':'84%',borderRadius:7,backgroundColor:colors.panel}}/>
      <View style={{height:11,width:index%2?'88%':'60%',borderRadius:6,backgroundColor:colors.panel}}/>
    </View>)}
    <Text accessibilityLiveRegion="polite" style={{color:colors.muted,fontSize:13,textAlign:'center'}}>{state.loadingLabel??'Загружаем список…'}</Text>
  </View>;
  if(error)return <View testID="app-list-error" style={{paddingHorizontal:24,paddingVertical:compact?12:32,alignItems:'center',gap:10}}>
    <Ionicons name="cloud-offline-outline" size={compact?24:32} color={colors.muted}/>
    <Text accessibilityLiveRegion="polite" style={{color:colors.text,fontSize:14,lineHeight:21,textAlign:'center'}}>{error}</Text>
    {state.onRetry?<ListAction label="Повторить загрузку" onPress={onRetry} disabled={state.disabled}/>:null}
  </View>;
  if(compact)return state.hasMore&&state.onLoadMore?<View testID="app-list-pagination" style={{paddingVertical:8,alignItems:'center'}}><ListAction label="Показать ещё" onPress={onMore!} disabled={state.disabled}/></View>:null;
  const search=Boolean(state.query?.trim());
  return <View testID="app-list-empty" style={{paddingHorizontal:28,paddingVertical:36,alignItems:'center',gap:12}}>
    <View style={{height:56,width:56,borderRadius:28,alignItems:'center',justifyContent:'center',backgroundColor:colors.panel}}><Ionicons name={search?'search-outline':'list-outline'} size={27} color={colors.muted}/></View>
    <Text accessibilityLiveRegion="polite" style={{color:colors.text,fontSize:16,lineHeight:23,fontWeight:'600',textAlign:'center'}}>{search?'Ничего не найдено':state.emptyTitle??'Список пока пуст'}</Text>
    <Text style={{color:colors.muted,fontSize:13,lineHeight:20,textAlign:'center'}}>{search?'Попробуйте другой запрос или очистите поиск.':state.emptyDescription??'Здесь появятся доступные записи.'}</Text>
    {search&&state.onClear?<ListAction label="Очистить поиск" onPress={state.onClear} disabled={state.disabled}/>:null}
  </View>;
}
