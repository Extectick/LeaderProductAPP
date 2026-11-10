import React from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {ClientOrderDeliveryAddressOption} from '@/utils/clientOrdersService';
import {AppListPanel,AppListPanelHeader} from '@/components/ui/AppListPanel';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {appWebControlProps} from '@/components/ui/appWebInteraction';

type Point=ClientOrderDeliveryAddressOption;
export type ClientOrderDeliveryPointsProps={
  active:boolean;customerName?:string;organizationControl:React.ReactNode;scope:string;
  items:Point[];selectedGuid?:string|null;query:string;loading:boolean;hasMore:boolean;disabled:boolean;error?:string;
  onQueryChange:(value:string)=>void;onSelect:(point:Point)=>void;onLoadMore:()=>void;onRetry:()=>void;
  footer?:React.ReactNode;
};

/** Desktop delivery selection uses the same measured list, search and scroll chrome as Help. */
export function ClientOrderDeliveryPoints({active,customerName,organizationControl,scope,items,selectedGuid,query,loading,hasMore,disabled,error,
  onQueryChange,onSelect,onLoadMore,onRetry,footer}:ClientOrderDeliveryPointsProps){
  const colors=useAppSurfaceTheme(),scrollRef=React.useRef<ScrollView>(null);
  const scrollId=`delivery-points-${React.useId().replace(/:/g,'')}`;
  const waiting=!customerName;
  return <AppListPanel active={active} scrollRef={scrollRef} scrollId={scrollId} scrollbarLabel="Прокрутка точек доставки"
    initialHeaderHeight={customerName?152:120} headerKey={waiting?'choose-customer':'delivery-points'}
    ids={{root:'client-orders-points-panel',viewport:'client-orders-points-viewport',header:'client-orders-points-header',scrollbar:'client-orders-points-scrollbar',thumb:'client-orders-points-scrollbar-thumb'}}
    loadState={{scope,itemCount:items.length,loading:!waiting&&loading,hasMore:!waiting&&hasMore,disabled:disabled||waiting,error:waiting?undefined:error,query:waiting?'':query,
      prefetchScreens:1.5,loadingLabel:'Загружаем точки доставки…',emptyTitle:waiting?'Выберите клиента':'Точек доставки пока нет',
      emptyDescription:waiting?'Выберите контрагента в списке слева, чтобы увидеть его адреса.':'Для этого клиента в выбранной организации нет доступных точек доставки.',
      onClear:()=>onQueryChange(''),onLoadMore,onRetry}}
    header={<>
      <AppListPanelHeader title="Точки доставки" value={query} onChangeText={onQueryChange} searchLabel="Найти точку доставки" disabled={disabled||waiting}
        trailing={organizationControl}/>
      {customerName?<Text numberOfLines={1} style={{paddingHorizontal:18,paddingTop:2,paddingBottom:12,color:colors.muted,fontSize:13,lineHeight:20}}>{customerName}</Text>:null}
    </>}
    footer={footer}
    renderList={({paddingTop,paddingBottom,emptyState,footerState,onScroll,onLayout,onContentSizeChange})=><ScrollView ref={scrollRef} nativeID={scrollId} testID="client-orders-points-list"
      style={{flex:1}} contentContainerStyle={{paddingTop,paddingBottom,paddingHorizontal:16}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      onScroll={onScroll} scrollEventThrottle={16} onLayout={onLayout} onContentSizeChange={onContentSizeChange}>
      {items.length?<View accessibilityRole="radiogroup" accessibilityLabel="Точка доставки">{items.map(point=>{
        const address=point.fullAddress||point.address||'';
        const title=point.name||address||'Точка доставки';
        const secondary=address&&address.trim()!==title.trim()?address:null;
        const selected=selectedGuid===point.guid;
        return <Pressable key={point.guid} {...appWebControlProps('row')} testID={`client-orders-point-${point.guid}`} accessibilityRole="radio"
          accessibilityLabel={[title,secondary].filter(Boolean).join(', ')} accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={()=>onSelect(point)}
          style={({pressed})=>({minHeight:68,padding:14,marginBottom:6,borderRadius:18,flexDirection:'row',alignItems:'center',gap:14,
            backgroundColor:selected||pressed?colors.soft:'transparent',opacity:disabled?.45:1})}>
          <View style={{width:40,height:40,borderRadius:20,backgroundColor:colors.panel,alignItems:'center',justifyContent:'center'}}>
            <Ionicons name="location-outline" size={21} color={selected?colors.accentText:colors.muted}/>
          </View>
          <View style={{flex:1,minWidth:0,gap:3}}>
            <Text style={{color:colors.text,fontSize:15,lineHeight:22,fontWeight:'500'}}>{title}</Text>
            {secondary?<Text style={{color:colors.muted,fontSize:13,lineHeight:20}}>{secondary}</Text>:null}
          </View>
          <Ionicons name={selected?'checkmark-circle':'ellipse-outline'} size={22} color={selected?colors.accentText:colors.line}/>
        </Pressable>;
      })}</View>:emptyState}
      {footerState}
    </ScrollView>}/>
}
