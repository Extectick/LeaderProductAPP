export type HelpTicketMenuAnchor = {x:number;y:number};

/** DOM client coordinates and Modal positioning share the viewport origin. */
export function helpTicketMenuAnchor(event:{clientX?:number;clientY?:number;nativeEvent?:{clientX?:number;clientY?:number};currentTarget?:{getBoundingClientRect?:()=>{left:number;top:number;bottom:number;width:number}}}, keyboard=false):HelpTicketMenuAnchor {
  const rect=event.currentTarget?.getBoundingClientRect?.();
  if(keyboard&&rect)return {x:rect.left+Math.min(32,rect.width/2),y:rect.bottom-8};
  const x=event.clientX??event.nativeEvent?.clientX,y=event.clientY??event.nativeEvent?.clientY;
  return {x:Number.isFinite(x)?x!:rect?.left??12,y:Number.isFinite(y)?y!:rect?.bottom??12};
}

export function helpTicketMenuFrame(anchor:HelpTicketMenuAnchor,viewport:{width:number;height:number},actionCount:number){
  const margin=8,width=Math.min(264,Math.max(1,viewport.width-margin*2));
  const height=actionCount*48+10;
  return {width,left:Math.max(margin,Math.min(anchor.x,viewport.width-width-margin)),top:Math.max(margin,Math.min(anchor.y,viewport.height-height-margin))};
}
