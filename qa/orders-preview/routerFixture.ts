import React from 'react';
export function useIsFocused() {return true;}
export function useFocusEffect(effect:()=>void|(()=>void)) {React.useEffect(effect,[effect]);}
export function useLocalSearchParams() {
  const [params,setParams] = React.useState(() => Object.fromEntries(new URLSearchParams(location.search)));
  React.useEffect(() => {const update=()=>setParams(Object.fromEntries(new URLSearchParams(location.search)));window.addEventListener('popstate',update);window.addEventListener('orders-fixture-route',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('orders-fixture-route',update);};},[]);
  return params;
}
const route = (value:any,replace=false) => {
  if (typeof value === 'object' && value.params?.orderGuid) {
    const url=new URL(location.href);url.searchParams.set('orderGuid',value.params.orderGuid);
    history[replace?'replaceState':'pushState']({},'',url);window.dispatchEvent(new Event('orders-fixture-route'));
  }
};
const router = {navigate:(value:any)=>route(value),push:(value:any)=>route(value),replace:(value:any)=>route(value,true),back:()=>history.back(),canGoBack:()=>history.length>1,setParams:(params:any)=>route({params},true)};
export function useRouter(){return router;}
export function useNavigation(){return {setOptions:()=>{},addListener:()=>()=>{},canGoBack:()=>history.length>1};}
export function usePathname(){return '/services/client_orders';}
