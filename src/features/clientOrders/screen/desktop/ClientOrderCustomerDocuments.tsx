import React from 'react';
import {ScrollView,View,Text,Pressable} from 'react-native';
import {Box} from '@mui/material';
import {Ionicons} from '@expo/vector-icons';
import type {ClientOrder} from '@/utils/clientOrdersService';
import {AppListPanel,AppListPanelHeader} from '@/components/ui/AppListPanel';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {appWebControlProps} from '@/components/ui/appWebInteraction';
import {getClientOrderDisplayNumber,formatMoney,getOrderDisplayStatusLabelWithQueue} from '../../lib/clientOrdersShared';
import {formatDateOnly} from '../../lib/clientOrdersUi';
import {getClientOrderInvoicePresentation} from '../../lib/clientOrderInvoices';
import type {useCustomerDocuments} from './useCustomerDocuments';

type Props={documents:ReturnType<typeof useCustomerDocuments>;customerName?:string;active:boolean;disabled:boolean;
  selectedGuid?:string|null;onOpen:(guid:string)=>void;onContextMenu?:(order:ClientOrder,x:number,y:number)=>void;footer?:React.ReactNode};

export function ClientOrderCustomerDocuments({documents:d,customerName,active,disabled,selectedGuid,onOpen,onContextMenu,footer}:Props){
  const colors=useAppSurfaceTheme(),scrollRef=React.useRef<ScrollView>(null),scrollId=`customer-documents-${React.useId().replace(/:/g,'')}`;
  return <AppListPanel active={active} scrollRef={scrollRef} scrollId={scrollId} initialHeaderHeight={customerName?164:120} headerKey={customerName?'selected':'empty'}
    ids={{root:'client-orders-documents-panel',header:'client-orders-documents-header',scrollbar:'client-orders-documents-scrollbar'}}
    loadState={{scope:d.scope,itemCount:d.rows.length,loading:d.loading||d.loadingMore,hasMore:d.hasMore,disabled:disabled||!customerName,error:d.error,query:d.query,
      prefetchScreens:1.5,loadingLabel:'Загружаем документы…',emptyTitle:customerName?'Документы не найдены':'Выберите клиента',
      emptyDescription:customerName?'У клиента нет документов по выбранным условиям. Можно создать новый заказ.':'Выберите контрагента слева, чтобы увидеть его документы.',
      onLoadMore:d.loadMore,onRetry:d.refresh,onClear:()=>d.setQuery('')}}
    header={<>
      <AppListPanelHeader title={customerName||'Документы клиента'} value={d.query} onChangeText={d.setQuery} searchLabel="Найти документ" disabled={disabled||!customerName}
        trailing={<Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel="Обновить документы" disabled={disabled||!customerName||d.loading}
          onPress={()=>void d.refresh()} style={{width:48,height:48,borderRadius:24,backgroundColor:colors.panel,alignItems:'center',justifyContent:'center',opacity:customerName?1:.4}}>
          <Ionicons name="refresh-outline" size={22} color={colors.muted}/>
        </Pressable>}/>
      {customerName?<View style={{flexDirection:'row',gap:6,paddingHorizontal:16,paddingBottom:10}}>
        {[['','Все'],['DRAFT','Черновики'],['QUEUED','В очереди']].map(([status,label])=><Pressable key={status} {...appWebControlProps()} accessibilityRole="button" accessibilityState={{selected:d.status===status,disabled}}
          disabled={disabled} onPress={()=>d.setStatus(status)} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:18,backgroundColor:d.status===status?colors.soft:'transparent'}}>
          <Text style={{fontSize:13,color:d.status===status?colors.accentText:colors.muted}}>{label}</Text>
        </Pressable>)}
      </View>:null}
    </>} footer={footer}
    renderList={({paddingTop,paddingBottom,emptyState,footerState,onScroll,onLayout,onContentSizeChange})=><ScrollView ref={scrollRef} nativeID={scrollId} testID="client-orders-documents-list"
      style={{flex:1}} contentContainerStyle={{paddingTop,paddingBottom,paddingHorizontal:16}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} scrollEventThrottle={16}>
      {d.rows.length?d.rows.map(order=>{
        const invoice=getClientOrderInvoicePresentation(order);
        const title=order.number1c?`Заказ ${order.number1c}`:`Черновик ${getClientOrderDisplayNumber(order)}`;
        const date=formatDateOnly(order.date1c||order.createdAt);
        const address=order.deliveryAddress?.fullAddress||order.deliveryAddress?.address||order.deliveryAddress?.name;
        return <Box key={order.guid} component="button" type="button" disabled={disabled} aria-label={`${title}, ${getOrderDisplayStatusLabelWithQueue(order)}`} aria-pressed={selectedGuid===order.guid}
          onClick={()=>onOpen(order.guid)} onContextMenu={event=>{if(!disabled&&onContextMenu){event.preventDefault();onContextMenu(order,event.clientX,event.clientY);}}}
          sx={{display:'block',width:'100%',textAlign:'left',border:0,p:2,mb:.75,borderRadius:'18px',color:colors.text,bgcolor:selectedGuid===order.guid?colors.soft:'transparent',cursor:'pointer',
            '&:hover':{bgcolor:colors.soft},'&:focus-visible':{outline:`2px solid ${colors.accentText}`,outlineOffset:-2},'&:disabled':{opacity:.45,cursor:'default'}}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
            <Ionicons name="document-text-outline" size={24} color={colors.muted}/>
            <View style={{flex:1,minWidth:0,gap:4}}>
              <Text style={{fontSize:15,fontWeight:'600',color:colors.text}}>{title}</Text>
              <Text style={{fontSize:12,color:colors.muted}}>{date} · {getOrderDisplayStatusLabelWithQueue(order)}</Text>
              {address?<Text style={{fontSize:13,lineHeight:19,color:colors.muted}}>{address}</Text>:null}
              {invoice.visible?<Text style={{fontSize:12,color:colors.muted}}>{invoice.label}</Text>:null}
            </View>
            <Text style={{fontSize:15,fontWeight:'600',color:colors.text}}>{formatMoney(order.totalAmount||0,order.currency)}</Text>
          </View>
        </Box>;
      }):emptyState}{footerState}
    </ScrollView>}/>
}
