/** Display state only. Server snapshots remain the authoritative, complete text. */
export const HELP_TEXT_FRAME_MS=40;
export const HELP_TEXT_BUFFER_MS=200;
export const HELP_TEXT_FINAL_MS=120;
export type HelpTextReveal={identity:string;source:string;offset:number;deadline:number;lastTick:number;live:boolean;breaks:number[]};
type Segmenter={segment:(value:string)=>Iterable<{index:number;segment:string}>};
let segmenter:Segmenter|null|undefined;

export function helpTextBreaks(text:string,forceFallback=false):number[]{
 if(!forceFallback&&segmenter===undefined){
  try{const Constructor=(Intl as typeof Intl&{Segmenter?:new(locale:string,options:{granularity:string})=>Segmenter}).Segmenter;segmenter=Constructor?new Constructor('ru',{granularity:'grapheme'}):null;}catch{segmenter=null;}
 }
 if(!forceFallback&&segmenter)return [0,...Array.from(segmenter.segment(text),part=>part.index+part.segment.length)];
 const ends=[0];let previous='',regional=0;
 for(const point of text){
  const code=point.codePointAt(0)!;
  const flag=code>=0x1f1e6&&code<=0x1f1ff;
  const continuation=/\p{Mark}/u.test(point)||code===0xfe0e||code===0xfe0f||code>=0x1f3fb&&code<=0x1f3ff||code>=0xe0020&&code<=0xe007f||point==='\u200d'||previous==='\u200d'||previous==='\r'&&point==='\n'||flag&&regional%2===1;
  if(continuation&&ends.length>1)ends[ends.length-1]+=point.length;else ends.push(ends.at(-1)!+point.length);
  regional=flag?regional+1:0;previous=point;
 }
 return ends;
}
export function createHelpTextReveal(identity:string,text:string,active:boolean,now:number):HelpTextReveal{
 return {identity,source:text,offset:text.length,deadline:now,lastTick:now,live:active,breaks:[]};
}
export function updateHelpTextReveal(state:HelpTextReveal,identity:string,text:string,active:boolean,completed:boolean,enabled:boolean,now:number):HelpTextReveal{
 if(state.identity!==identity||!enabled||!text.startsWith(state.source)||!active&&!(completed&&state.live))return createHelpTextReveal(identity,text,active,now);
 const changed=text!==state.source;
 return {...state,source:text,breaks:changed?helpTextBreaks(text):state.breaks,live:state.live||active,lastTick:state.offset>=state.source.length?now:state.lastTick,
  deadline:changed||!active&&state.deadline>now+HELP_TEXT_FINAL_MS?now+(active?HELP_TEXT_BUFFER_MS:HELP_TEXT_FINAL_MS):state.deadline};
}
export function stepHelpTextReveal(state:HelpTextReveal,now:number):HelpTextReveal{
 if(state.offset>=state.source.length)return state;
 const elapsed=Math.max(0,now-state.lastTick),remaining=state.source.length-state.offset;
 const desired=now>=state.deadline?state.source.length:Math.min(state.source.length,state.offset+Math.max(1,Math.ceil(remaining*elapsed/Math.max(1,state.deadline-state.lastTick))));
 // Snap forward to a whole grapheme, never a surrogate/combining/ZWJ fragment.
 let lo=0,hi=state.breaks.length-1;
 while(lo<hi){const mid=(lo+hi)>>>1;if(state.breaks[mid]<desired)lo=mid+1;else hi=mid;}
 return {...state,offset:state.breaks[lo]??state.source.length,lastTick:now};
}
