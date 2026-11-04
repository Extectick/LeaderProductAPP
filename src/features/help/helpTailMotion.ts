export type HelpTailGeometry={content:number;margin:number;width:number;height:number};

/** Versioned presentation policy. These values ship in OTA; the native owner
 * measures/pins geometry independently of the selected presentation curve. */
export type HelpTailMotionConfig={version:1;enabled:boolean;durationMs:number;curve:'spring'|'cubic'|'quint';maxViewport:number;entryDistanceDp:number};
export const HELP_TAIL_MOTION:HelpTailMotionConfig={version:1,enabled:true,durationMs:220,curve:'spring',maxViewport:1,entryDistanceDp:24};

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

/** A removed/replaced AI placeholder is not a page prepend. Only newly loaded
 * messages before an existing row (or a disjoint window) suppress tail motion. */
export function helpTailHistoryChange(previous:readonly string[],next:readonly string[]){
  if(!previous.length||!next.length)return false;
  const known=new Set(previous),retained=next.findIndex(key=>known.has(key));
  if(retained<0)return true;
  return next.slice(0,retained).some(key=>key.startsWith('message:')||key.startsWith('client:'));
}
