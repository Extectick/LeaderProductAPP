import type {HelpMessage} from './helpApi';
import type {HelpPending} from './helpDurableTypes';
import {helpPendingMessage} from './helpPendingPresentation';
import type {HelpTimelineRow} from './helpTimelineModel';

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

function tailMessageContent(message:HelpMessage){
  const run=message.assistantRun;
  const attachments=(rows:HelpMessage['attachments']|undefined)=>rows?.map(row=>[row.kind,row.name,row.mimeType,row.size,row.durationMs]);
  // Identity/profile, dates, read receipts and provider metrics do not change
  // the body. Replayed copies of the same answer must not arm arrival motion.
  return JSON.stringify([message.kind,message.text,message.rating,message.itStatusChange,message.ticketStatusChange,
    attachments(message.attachments),message.replyTo?.text,attachments(message.replyTo?.attachments),
    run&&[run.status,run.step,run.completedSteps,run.phase,run.draftText,run.error,run.action,run.suggestions,run.questions,
      run.activities?.map(activity=>[activity.id,activity.kind,activity.label,activity.status,activity.text])]]);
}

function pendingQuestionContent(pending:HelpPending|undefined) {
  return pending?JSON.stringify([pending.key,pending.status,pending.error,tailMessageContent(helpPendingMessage(pending,0))]):undefined;
}

/** Initial history can keep measuring after reveal; only actual body changes start live motion. */
export function helpTailContentChanged(previous:readonly HelpTimelineRow[],next:readonly HelpTimelineRow[]){
  const content=(rows:readonly HelpTimelineRow[])=>rows.filter(row=>row.kind==='message'||row.kind==='pending');
  const before=content(previous),after=content(next);
  if(helpTailHistoryChange(before.map(row=>row.key),after.map(row=>row.key)))return false;
  if(before.length!==after.length)return true;
  const known=new Map(before.map(row=>[row.key,row]));
  return after.some(row=>{
    const previous=known.get(row.key);
    return !previous||(previous.message!==row.message&&tailMessageContent(previous.message)!==tailMessageContent(row.message))
      ||(previous.questionAnswer!==row.questionAnswer&&
        (previous.questionAnswer&&tailMessageContent(previous.questionAnswer))!==(row.questionAnswer&&tailMessageContent(row.questionAnswer)))
      ||pendingQuestionContent(previous.questionPending)!==pendingQuestionContent(row.questionPending);
  });
}
