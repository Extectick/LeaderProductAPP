type HelpInputScrollEvent={
  nativeEvent?:{contentOffset?:{y?:unknown};target?:unknown}|null;
  currentTarget?:unknown;
  target?:unknown;
};

/** RN TextInput emits contentOffset; RN-web forwards the textarea's DOM scroll event. */
export function helpInputScrollY(event:HelpInputScrollEvent):number|null{
  const native=event.nativeEvent,offset=native?.contentOffset?.y;
  if(typeof offset==='number'&&Number.isFinite(offset))return Math.max(0,offset);
  // Read synchronously while React's currentTarget still refers to this textarea.
  for(const target of [event.currentTarget,event.target,native?.target]){
    if(!target||typeof target!=='object')continue;
    const top=(target as {scrollTop?:unknown}).scrollTop;
    if(typeof top==='number'&&Number.isFinite(top))return Math.max(0,top);
  }
  return null;
}
