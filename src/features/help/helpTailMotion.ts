export type HelpTailGeometry={content:number;margin:number;width:number;height:number};

// Presentation must stay inside the nearby virtualized cells, including when
// several streamed chunks arrive before the preceding animation has finished.
export function helpTailMotionLimit(height:number){return Math.min(120,Math.max(0,height)*.25);}

/** Long native histories already have a same-frame content spring. FlashList's
 * short-history alignment changes its inner margin without growing ScrollView's
 * content height, so only that missing displacement needs a second owner. */
export function helpTailDisplacement(previous:HelpTailGeometry|null,next:HelpTailGeometry,options:{native:boolean;active:boolean;liveGrowth:boolean}){
  if(!previous||!options.active||!options.liveGrowth||Math.abs(previous.width-next.width)>.5||Math.abs(previous.height-next.height)>.5)return 0;
  const delta=options.native?previous.margin-next.margin:next.content-previous.content;
  const limit=helpTailMotionLimit(next.height);
  return Number.isFinite(delta)&&Math.abs(delta)>.5?Math.max(-limit,Math.min(limit,delta)):0;
}
