import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {usePathname, useRouter} from 'expo-router';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {appWebControlProps,appWebControlContentProps} from '@/components/ui/appWebInteraction';
import {useIsAdmin} from '@/hooks/useIsAdmin';
import {useLastServiceRoute} from '@/src/features/navigation/LastServiceRouteContext';
import {useOptionalUnsavedChanges} from '@/src/features/navigation/UnsavedChangesContext';
import {saveWebCachedLastServiceRoute} from '@/src/features/navigation/lastServiceRouteStorage';
import {useServicesData} from '@/src/features/services/hooks/useServicesData';
import {applyAdminCatalogService} from '@/src/features/services/lib/adminCatalogService';
import {getVisibleServices} from '@/src/features/services/lib/grid';
import {canOpenService} from '@/src/features/services/lib/serviceAvailability';
import {serviceAccent} from '@/src/features/services/lib/serviceAccent';
import {useServerStatus} from '@/src/shared/network/useServerStatus';
import type {ServiceAccessItem} from '@/utils/servicesService';
import {withOpacity} from '@/src/features/services/ui/servicesTokens';
import {WEB_SIDEBAR_COLLAPSE_STORAGE_KEY, emitWebSidebarState, getPersistedWebSidebarCollapsed, getWebSidebarWidthByCollapsed} from './sidebarEvents';

type Tooltip={id:string;label:string;left:number;top:number};
type SidebarItem={key:string;label:string;path:string;icon:string;service?:ServiceAccessItem};
const home:SidebarItem={key:'services',label:'Главная',path:'/services',icon:'apps-outline'};
const profile:SidebarItem={key:'profile',label:'Профиль',path:'/profile',icon:'person-outline'};

/** The catalog owns the services, permissions and category colors in both views. */
export default function WebSidebar({compact=false, visible=true}:{compact?:boolean;visible?:boolean}) {
  const [preferredCollapsed,setPreferredCollapsed]=useState(getPersistedWebSidebarCollapsed);
  const collapsed=compact||preferredCollapsed;
  const width=getWebSidebarWidthByCollapsed(collapsed);
  const windowSize=useWindowDimensions();
  const [tooltip,setTooltip]=useState<Tooltip|null>(null);
  const router=useRouter(),pathname=usePathname();
  const {clearLastServiceRoute}=useLastServiceRoute();
  const unsaved=useOptionalUnsavedChanges();
  const {isAdmin,isCheckingAdmin}=useIsAdmin();
  const {services}=useServicesData();
  const {isReachable}=useServerStatus();
  const {background,text,muted,panel,line,elevated}=useAppSurfaceTheme();
  const items=useMemo(()=>getVisibleServices(applyAdminCatalogService(services,!isCheckingAdmin&&isAdmin))
    .sort((a,b)=>Number(b.key==='help')-Number(a.key==='help'))
    .map(service=>({key:service.key,label:service.name,path:service.route??'',icon:service.icon||'apps-outline',service})),[services,isAdmin,isCheckingAdmin]);

  useEffect(()=>{
    try { window.localStorage.setItem(WEB_SIDEBAR_COLLAPSE_STORAGE_KEY,preferredCollapsed?'1':'0'); } catch {}
  },[preferredCollapsed]);
  useLayoutEffect(()=>{emitWebSidebarState({collapsed,width:visible?width:0,phase:'end'});},[collapsed,width,visible]);
  useEffect(()=>setTooltip(null),[collapsed,visible,pathname,windowSize.width,windowSize.height,services]);

  const open=(item:SidebarItem)=>{
    setTooltip(null);
    if(item.service&&!canOpenService(item.service,isReachable,'web'))return;
    if(pathname===item.path)return;
    const navigate=()=>{if(item.path==='/services')clearLastServiceRoute();else if(item.service)saveWebCachedLastServiceRoute(item.path);router.push(item.path as any);};
    if(unsaved)unsaved.confirmNavigation(navigate);else navigate();
  };
  const isActive=(path:string)=>{
    const route=path.split(/[?#]/,1)[0].replace(/^\/\(main\)(?=\/)/,'').replace(/\/$/,'');
    return route==='/services'?pathname==='/services'||pathname==='/home'||pathname==='/':Boolean(route)&&(pathname===route||pathname.startsWith(`${route}/`));
  };
  const showTooltip=(id:string,label:string,rect:{right:number;top:number;height:number})=>{
    if(!collapsed||!visible)return;
    setTooltip({id,label,left:Math.min(rect.right+8,Math.max(8,windowSize.width-268)),top:Math.max(8,Math.min(windowSize.height-48,rect.top+rect.height/2-18))});
  };
  const hideTooltip=(id?:string)=>setTooltip(current=>!id||current?.id===id?null:current);
  const renderItem=(item:SidebarItem)=><SidebarButton key={item.key} item={item} collapsed={collapsed} active={isActive(item.path)} disabled={Boolean(item.service&&!canOpenService(item.service,isReachable,'web'))} onPress={()=>open(item)} onTooltip={showTooltip} onHideTooltip={hideTooltip}/>;

  return <><View testID="web-sidebar" role="navigation" accessibilityLabel="Основная навигация" style={[styles.sidebar,{width,backgroundColor:background,borderRightColor:line}]}>
    <Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel="Лидер Продукт — главная" onPress={()=>open(home)} style={styles.brand}>
      <Image source={require('@/assets/images/icon.png')} style={{width:48,height:48}} resizeMode="contain" accessible={false}/>
      {!collapsed?<Text {...appWebControlContentProps()} numberOfLines={2} style={{color:text,fontWeight:'600',fontSize:15,flex:1}}>Лидер Продукт</Text>:null}
    </Pressable>
    <ScrollView testID="web-sidebar-services" style={{flex:1,minHeight:0}} contentContainerStyle={{gap:6}} showsVerticalScrollIndicator={false} onScroll={()=>hideTooltip()} scrollEventThrottle={32}>
      {renderItem(home)}
      {items.filter(item=>item.key!=='admin').map(renderItem)}
    </ScrollView>
    <View testID="web-sidebar-account" style={{gap:6,flexShrink:0}}>
      {items.filter(item=>item.key==='admin').map(renderItem)}
      {renderItem(profile)}
      {!compact?<Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel={collapsed?'Развернуть меню':'Свернуть меню'} accessibilityState={{expanded:!collapsed}}
        {...({title:collapsed?'Развернуть меню':undefined} as any)} onPress={()=>setPreferredCollapsed(value=>!value)}
        style={({pressed,hovered}:any)=>[styles.item,{backgroundColor:pressed||hovered?panel:'transparent'}]}>
        <View style={styles.icon}><Ionicons {...appWebControlContentProps()} name={collapsed?'chevron-forward-outline':'chevron-back-outline'} size={20} color={muted}/></View>
        {!collapsed?<Text {...appWebControlContentProps()} style={{color:muted,fontSize:13}}>Свернуть</Text>:null}
      </Pressable>:null}
    </View>
  </View>
  {tooltip?<View testID="web-sidebar-tooltip" role="tooltip" pointerEvents="none" style={{position:'fixed',left:tooltip.left,top:tooltip.top,maxWidth:260,minHeight:36,paddingHorizontal:12,paddingVertical:8,borderRadius:10,backgroundColor:elevated,borderWidth:1,borderColor:line,zIndex:50,boxShadow:'0 6px 18px rgba(15,23,42,.14)'} as any}><Text numberOfLines={2} style={{color:text,fontSize:13,lineHeight:18}}>{tooltip.label}</Text></View>:null}
  </>;
}

function SidebarButton({item,collapsed,active,disabled,onPress,onTooltip,onHideTooltip}:{item:SidebarItem;collapsed:boolean;active:boolean;disabled:boolean;onPress:()=>void;onTooltip:(id:string,label:string,rect:{right:number;top:number;height:number})=>void;onHideTooltip:(id:string)=>void}){
  const node=useRef<View>(null);
  const {text,muted,accentText,panel,dark}=useAppSurfaceTheme();
  const gradient=item.service?.gradientStart&&item.service.gradientEnd?[item.service.gradientStart,item.service.gradientEnd]:undefined;
  const accent=item.service?serviceAccent(gradient,dark):accentText;
  const show=(event:any)=>{
    if(!collapsed)return;
    const rect=event.currentTarget?.getBoundingClientRect?.();
    if(rect)onTooltip(item.key,item.label,rect);
    else node.current?.measureInWindow((x,y,width,height)=>onTooltip(item.key,item.label,{right:x+width,top:y,height}));
  };
  return <Pressable ref={node} {...appWebControlProps('row')} testID={`sidebar-${item.key}`} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{selected:active,disabled}} disabled={disabled}
    onHoverIn={show} onHoverOut={()=>onHideTooltip(item.key)} onFocus={show} onBlur={()=>onHideTooltip(item.key)} onPress={onPress}
    style={({pressed,hovered}:any)=>[styles.item,{opacity:disabled ? .48 : 1,backgroundColor:active?withOpacity(accent,.12):pressed||hovered?panel:'transparent'}]}>
    <View style={styles.icon}><View testID={`sidebar-icon-${item.key}`} style={item.service?{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center'}:undefined}>
      <Ionicons {...(item.service?{}:appWebControlContentProps())} name={item.icon as any} size={23} color={disabled?muted:item.service||active?accent:muted}/>
    </View></View>
    {!collapsed?<Text {...appWebControlContentProps()} numberOfLines={1} style={{color:active?accent:text,fontSize:14,fontWeight:active?'600':'500',flex:1}}>{item.label}</Text>:null}
  </Pressable>;
}

const styles=StyleSheet.create({
  sidebar:{height:'100%',flexShrink:0,paddingHorizontal:11,paddingTop:12,paddingBottom:12,borderRightWidth:1,gap:18},
  brand:{minHeight:48,flexDirection:'row',alignItems:'center',gap:8,borderRadius:24},
  item:{minHeight:48,flexDirection:'row',alignItems:'center',gap:8,borderRadius:24,paddingHorizontal:1},
  icon:{width:48,height:48,alignItems:'center',justifyContent:'center',flexShrink:0},
});
