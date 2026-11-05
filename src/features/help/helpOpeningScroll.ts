export type HelpOpeningScrollPosition={kind:'end'}|{kind:'offset';offset:number};

/** Keep the full ScrollView ref API. During initial positioning every index
 * replay must use the same final viewport, including FlashList's delayed replay.
 * The resolver releases ownership on navigation or touch, including when a
 * reduced-motion entrance finishes before the queued index replay. */
export function helpOpeningScrollRef<T extends {scrollTo:Function;scrollToEnd:Function}>(native:T,position:()=>HelpOpeningScrollPosition|null):T {
  const scrollTo=(...args:unknown[])=>{
    const opening=position();
    if(!opening)return native.scrollTo(...args);
    if(opening.kind==='end')return native.scrollToEnd({animated:false});
    const options=typeof args[0]==='object'&&args[0]!==null?args[0]:{};
    return native.scrollTo({...options,y:opening.offset,animated:false});
  };
  return new Proxy(native,{get(target,key){
    if(key==='scrollTo')return scrollTo;
    const value=Reflect.get(target,key,target);
    return typeof value==='function'?value.bind(target):value;
  }});
}
