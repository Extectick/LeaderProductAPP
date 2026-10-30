/** Expo view commands can outlive the Fabric view they were scheduled for. */
export function isDetachedHelpInputFocusError(error:unknown){
  const message=error instanceof Error?error.message:typeof error==='string'?error:'';
  return /LeaderHelpInputView/.test(message)&&(/Unable to find[\s\S]*view with tag\s+\d+/i.test(message)||/cannot(?: be)? cast[\s\S]*(?:java\.lang\.)?Integer/i.test(message));
}
/** Focus after the view commits, cancelling requests belonging to a departed composer. */
export function scheduleHelpInputFocus(getInput:()=>{focus:()=>void}|null){
  let cancelled=false;
  const frame=requestAnimationFrame(()=>{if(!cancelled)getInput()?.focus();});
  return()=>{cancelled=true;cancelAnimationFrame(frame);};
}
