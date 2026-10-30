/** Signals storage changes only; token values never enter notification/event payloads. */
const listeners=new Set<()=>void>();
export function subscribePushRegistrationChanges(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function emitPushRegistrationChanged(){for(const listener of listeners){try{listener();}catch{/* A consumer cannot undo an already persisted registration. */}}}
