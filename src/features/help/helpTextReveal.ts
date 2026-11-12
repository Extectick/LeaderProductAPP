/** Display state only. Server snapshots remain the authoritative, complete text. */
export const HELP_TEXT_FRAME_MS=20;
export const HELP_TEXT_BUFFER_MS=80;
export const HELP_TEXT_FINAL_MS=0;
export type HelpTextReveal={identity:string;source:string;offset:number;deadline:number;lastTick:number;live:boolean;breaks:number[];wordBreaks:number[];startedAt:number;startIndex:number};
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
/** First mounted snapshots are already visible history, including an active
 * response remounted by the virtualized list. Only subsequent appends smooth. */
export function createHelpTextReveal(identity:string,text:string,active:boolean,now:number):HelpTextReveal{
 return {identity,source:text,offset:text.length,deadline:now,lastTick:now,live:active,breaks:[],wordBreaks:[],startedAt:now,startIndex:0};
}
function boundaryIndex(breaks:number[],offset:number):number {
 let lo=0,hi=breaks.length-1;
 while(lo<hi){const mid=(lo+hi)>>>1;if(breaks[mid]<offset)lo=mid+1;else hi=mid;}
 return lo;
}
/** Prefer complete words/phrases, without waiting for a token that may never
 * arrive. Punctuation and whitespace terminate units; long URLs/code/CJK use
 * the same bounded grapheme fallback instead of an artificial typing speed. */
function wordBreaks(text:string,breaks:number[]):number[]{
 const result:number[]=[];
 for(let index=1;index<breaks.length;index++){
  const part=text.slice(breaks[index-1],breaks[index]);
  if(/[\s.,!?;:)\]}…。，！？；：]/u.test(part))result.push(index);
 }
 if(result.at(-1)!==breaks.length-1)result.push(breaks.length-1);
 return result;
}
export function updateHelpTextReveal(state:HelpTextReveal,identity:string,text:string,active:boolean,completed:boolean,enabled:boolean,now:number):HelpTextReveal{
 // The final authoritative answer is available now: never leave a fake typing
 // queue after completion. Withdrawals/corrections must also take effect now.
 if(state.identity!==identity||!enabled||!active||completed||!text.startsWith(state.source))return createHelpTextReveal(identity,text,active,now);
 const progress=stepHelpTextReveal(state,now);
 if(text===state.source)return progress;
 const breaks=helpTextBreaks(text),index=boundaryIndex(breaks,progress.offset),offset=breaks[index]??progress.offset;
 return {...progress,source:text,breaks,wordBreaks:wordBreaks(text,breaks),offset,live:true,lastTick:now,
  startedAt:now,startIndex:index,deadline:offset<text.length?now+HELP_TEXT_BUFFER_MS:now};
}
export function stepHelpTextReveal(state:HelpTextReveal,now:number):HelpTextReveal{
 if(state.offset>=state.source.length||now<=state.lastTick)return state;
 const end=state.breaks.length-1;
 const fraction=Math.min(1,Math.max(0,(now-state.startedAt)/Math.max(1,state.deadline-state.startedAt)));
 const desired=state.startIndex+Math.floor((end-state.startIndex)*fraction);
 const current=boundaryIndex(state.breaks,state.offset);
 let next=Math.max(current,now>=state.deadline?end:desired);
 if(next>current&&next<end){
  // Rounding at most 12 graphemes forward keeps typical words whole while a
  // very long URL, identifier or unspaced paragraph cannot appear as one jump.
  const word=state.wordBreaks[boundaryIndex(state.wordBreaks,next)];
  if(word!==undefined&&word-next<=12)next=word;
 }
 return {...state,offset:state.breaks[next]??state.source.length,lastTick:now};
}
