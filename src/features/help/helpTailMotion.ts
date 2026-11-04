export type HelpTailGeometry={content:number;margin:number;width:number;height:number};

// FlashList retains at least two viewports around the visible cells. A whole
// viewport can therefore move together, including a photo/album taller than a
// text row; capping this at a text-sized 120 px made the rest jump immediately.
export function helpTailMotionLimit(height:number){return Number.isFinite(height)?Math.max(0,height):0;}

/** Both short alignment and long tail scrolling move old rows by the measured
 * content growth. One presentation clock compensates that entire displacement;
 * native layout still owns the actual scroll range and keyboard/composer lift. */
export function helpTailDisplacement(previous:HelpTailGeometry|null,next:HelpTailGeometry,options:{active:boolean;liveGrowth:boolean}){
  if(!previous||!options.active||!options.liveGrowth||Math.abs(previous.width-next.width)>.5||Math.abs(previous.height-next.height)>.5)return 0;
  const delta=next.content-previous.content;
  const limit=helpTailMotionLimit(next.height);
  return Number.isFinite(delta)&&Math.abs(delta)>.5?Math.max(-limit,Math.min(limit,delta)):0;
}
