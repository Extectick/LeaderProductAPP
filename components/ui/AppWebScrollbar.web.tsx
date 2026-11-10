import React,{useLayoutEffect,useRef,useState} from 'react';
import {withOpacity} from '@/src/features/services/ui/servicesTokens';
import {appScrollbarKey,appScrollbarMetrics,appScrollbarSeek} from './appScrollbar';
import type {AppWebScrollbarProps} from './AppWebScrollbar';

/** The thumb paints above header blur; the real list remains the scroll owner. */
export function AppWebScrollbar({scrollRef,scrollId,top,bottom,active,colors:c,label='Прокрутка списка',testID='app-list-scrollbar',thumbTestID='app-list-scrollbar-thumb'}:AppWebScrollbarProps){
  const track=useRef<HTMLDivElement>(null),thumb=useRef<HTMLDivElement>(null),scroller=useRef<HTMLElement|null>(null);
  const [metrics,setMetrics]=useState(()=>appScrollbarMetrics(0,0,0,0));
  const current=useRef(metrics);current.current=metrics;
  const drag=useRef<{id:number;offset:number}|null>(null);
  const [hovered,setHovered]=useState(false),[dragging,setDragging]=useState(false);
  const schedule=useRef(()=>{});

  useLayoutEffect(()=>{
    if(!active)return;
    let frame:number|undefined,attempts=0,disposed=false;
    let node:HTMLElement|null=null,resize:ResizeObserver|undefined,mutations:MutationObserver|undefined;
    const bar=track.current;
    const measure=()=>{
      frame=undefined;if(disposed||!node||!bar)return;
      const visibleHeight=bar.getBoundingClientRect().height||bar.clientHeight;
      // Rows scroll behind the panels, but page steps/thumb proportions use
      // the unobscured track. Preserve the real node's complete scroll range.
      const maximum=Math.max(0,node.scrollHeight-node.clientHeight);
      const next=appScrollbarMetrics(visibleHeight,visibleHeight+maximum,node.scrollTop,visibleHeight);
      current.current=next;
      setMetrics(previous=>Object.keys(next).every(key=>Math.abs(previous[key as keyof typeof next]-next[key as keyof typeof next])<.1)?previous:next);
    };
    const enqueue=()=>{if(!disposed&&frame===undefined)frame=requestAnimationFrame(measure);};
    schedule.current=enqueue;
    const connect=()=>{
      frame=undefined;if(disposed)return;
      const candidate=scrollRef.current?.getScrollableNode?.() as HTMLElement|null;
      if(!candidate||typeof candidate.addEventListener!=='function'){
        if(++attempts<12)frame=requestAnimationFrame(connect);
        return;
      }
      node=candidate;scroller.current=node;
      node.addEventListener('scroll',enqueue,{passive:true});
      if(typeof ResizeObserver!=='undefined'){
        resize=new ResizeObserver(enqueue);resize.observe(node);if(bar)resize.observe(bar);
        if(node.firstElementChild)resize.observe(node.firstElementChild);
      }
      if(typeof MutationObserver!=='undefined'){
        mutations=new MutationObserver(()=>{if(node?.firstElementChild)resize?.observe(node.firstElementChild);enqueue();});
        mutations.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
      }
      measure();
    };
    const wheel=(event:WheelEvent)=>{
      if(!node||!event.deltaY)return;
      event.preventDefault();
      node.scrollTop+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?current.current.viewport:1);
      enqueue();
    };
    bar?.addEventListener('wheel',wheel,{passive:false});
    connect();
    return()=>{
      disposed=true;if(frame!==undefined)cancelAnimationFrame(frame);
      node?.removeEventListener('scroll',enqueue);bar?.removeEventListener('wheel',wheel);
      resize?.disconnect();mutations?.disconnect();scroller.current=null;schedule.current=()=>{};drag.current=null;
    };
  },[active,scrollRef,top,bottom]);

  const seek=(clientY:number,offset:number)=>{
    const node=scroller.current,bar=track.current;if(!node||!bar)return;
    node.scrollTop=appScrollbarSeek(clientY-bar.getBoundingClientRect().top,offset,current.current);
    schedule.current();
  };
  const endDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(drag.current?.id!==event.pointerId)return;
    drag.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const overflow=active&&metrics.maximum>1&&metrics.track>0;
  return <div ref={track} data-testid={testID} role="scrollbar" aria-label={label} aria-controls={scrollId} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(metrics.maximum)} aria-valuenow={Math.round(metrics.scroll)} aria-valuetext={`${Math.round(metrics.maximum?metrics.scroll/metrics.maximum*100:0)}%`} tabIndex={overflow?0:-1} aria-hidden={!overflow}
    onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}
    onPointerDown={event=>{
      if(event.button!==0||!overflow)return;
      event.preventDefault();event.currentTarget.focus({preventScroll:true});
      const rect=event.currentTarget.getBoundingClientRect();
      const offset=thumb.current?.contains(event.target as Node)?event.clientY-rect.top-current.current.offset:current.current.thumb/2;
      drag.current={id:event.pointerId,offset};setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);seek(event.clientY,offset);
    }}
    onPointerMove={event=>{if(drag.current?.id===event.pointerId){event.preventDefault();seek(event.clientY,drag.current.offset);}}}
    onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}
    onKeyDown={event=>{const node=scroller.current;if(!node)return;const next=appScrollbarKey(event.key,{...current.current,scroll:node.scrollTop},event.shiftKey);if(next===null)return;event.preventDefault();event.stopPropagation();node.scrollTop=next;schedule.current();}}
    style={{position:'absolute',top,bottom,right:0,width:12,zIndex:3,visibility:overflow?'visible':'hidden',borderRadius:6,background:hovered||dragging?withOpacity(c.muted,.07):'transparent',touchAction:'none',userSelect:'none',cursor:'default'}}>
    <div ref={thumb} data-testid={thumbTestID} aria-hidden="true" style={{position:'absolute',top:metrics.offset,left:3,width:6,height:metrics.thumb,borderRadius:3,background:withOpacity(c.muted,(hovered||dragging) ? .64 : .4),pointerEvents:'auto'}}/>
  </div>;
}
