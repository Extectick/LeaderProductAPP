export type AppScrollbarMetrics={viewport:number;content:number;scroll:number;track:number;maximum:number;thumb:number;offset:number;travel:number};
const bound=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function appScrollbarMetrics(viewport:number,content:number,scroll:number,track:number):AppScrollbarMetrics{
  const maximum=Math.max(0,content-viewport);
  const thumb=maximum>0&&content>0?Math.min(track,Math.max(28,track*viewport/content)):track;
  const travel=Math.max(0,track-thumb);
  return {viewport,content,scroll:bound(scroll,0,maximum),track,maximum,thumb,travel,offset:maximum>0?bound(scroll,0,maximum)/maximum*travel:0};
}

export function appScrollbarSeek(point:number,grabOffset:number,metrics:AppScrollbarMetrics){
  return metrics.travel>0?bound((point-grabOffset)/metrics.travel,0,1)*metrics.maximum:0;
}

export function appScrollbarKey(key:string,metrics:AppScrollbarMetrics,shift=false):number|null{
  const page=Math.max(40,metrics.viewport*.9);
  const next=key==='ArrowDown'?metrics.scroll+40:key==='ArrowUp'?metrics.scroll-40:key==='PageDown'?metrics.scroll+page:key==='PageUp'?metrics.scroll-page:key==='Home'?0:key==='End'?metrics.maximum:key===' '?metrics.scroll+(shift?-page:page):null;
  return next===null?null:bound(next,0,metrics.maximum);
}
