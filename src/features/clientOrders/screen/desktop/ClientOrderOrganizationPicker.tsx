import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {ClientOrderOrganization} from '@/utils/clientOrdersService';
import {AppDesktopDialog} from '@/components/ui/AppDesktopDialog';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';
import {appWebControlContentProps,appWebControlProps} from '@/components/ui/appWebInteraction';

export type ClientOrderOrganizationPickerProps={
  organizations:ClientOrderOrganization[];
  value?:ClientOrderOrganization;
  disabled?:boolean;
  onChange:(guid:string)=>void;
};

/** Desktop toolbar presentation; selection and order state remain with the caller. */
export function ClientOrderOrganizationPicker({organizations,value,disabled=false,onChange}:ClientOrderOrganizationPickerProps){
  const colors=useAppSurfaceTheme(),trigger=useRef<View>(null);
  const [open,setOpen]=useState(false);
  const multiple=organizations.length>1;
  useEffect(()=>{if(disabled||!multiple)setOpen(false);},[disabled,multiple]);
  useEffect(()=>{setOpen(false);},[value?.guid]);
  if(!organizations.length)return null;
  const selected=value??organizations[0];
  const content=<>
    <Ionicons {...appWebControlContentProps()} name="business-outline" size={20} color={colors.muted}/>
    <View style={{flexShrink:1,minWidth:0}}>
      <Text {...appWebControlContentProps()} style={{color:colors.muted,fontSize:11,lineHeight:14}}>Организация</Text>
      <Text {...appWebControlContentProps()} numberOfLines={1} style={{color:colors.text,fontSize:14,lineHeight:19,fontWeight:'500'}}>{selected.name}</Text>
    </View>
    {multiple?<Ionicons {...appWebControlContentProps()} name="chevron-down" size={16} color={colors.muted}/>:null}
  </>;
  const surface={height:48,maxWidth:300,minWidth:0,borderRadius:24,paddingHorizontal:14,flexDirection:'row' as const,alignItems:'center' as const,gap:10,flexShrink:1,backgroundColor:colors.panel};
  return <>
    {multiple?<Pressable ref={trigger} {...appWebControlProps()} testID="client-orders-organization-picker" accessibilityRole="button"
      accessibilityLabel={`Организация: ${selected.name}. Выбрать организацию`} accessibilityState={{disabled,expanded:open}} disabled={disabled}
      onPress={()=>{if(!disabled)setOpen(true);}} style={({pressed})=>({...surface,backgroundColor:pressed?colors.soft:colors.panel,opacity:disabled?.45:1})}>{content}</Pressable>
      :<View testID="client-orders-organization-value" accessibilityLabel={`Организация: ${selected.name}`} style={surface}>{content}</View>}
    {open?<AppDesktopDialog title="Выберите организацию" onClose={()=>setOpen(false)} maxWidth={480} maxHeight={560}
      returnFocusRef={trigger} testID="client-orders-organization-dialog" contentStyle={{paddingHorizontal:12,paddingBottom:12}}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Организация">
        {organizations.map(item=>{
          const checked=item.guid===selected.guid;
          return <Pressable key={item.guid} {...appWebControlProps('row')} testID={`client-orders-organization-${item.guid}`} accessibilityRole="radio"
            accessibilityLabel={item.name} accessibilityState={{checked,disabled}} disabled={disabled}
            onPress={()=>{if(disabled)return;setOpen(false);if(!checked)onChange(item.guid);}}
            style={({pressed})=>({minHeight:56,paddingHorizontal:14,paddingVertical:12,borderRadius:14,flexDirection:'row',alignItems:'center',gap:12,
              backgroundColor:checked||pressed?colors.soft:'transparent',opacity:disabled?.45:1})}>
            <Ionicons {...appWebControlContentProps()} name="business-outline" size={21} color={checked?colors.accentText:colors.muted}/>
            <Text {...appWebControlContentProps()} style={{flex:1,minWidth:0,color:colors.text,fontSize:15,lineHeight:21,fontWeight:checked?'600':'400'}}>{item.name}</Text>
            <Ionicons {...appWebControlContentProps()} name={checked?'radio-button-on':'radio-button-off'} size={21} color={checked?colors.accentText:colors.muted}/>
          </Pressable>;
        })}
      </View>
    </AppDesktopDialog>:null}
  </>;
}
