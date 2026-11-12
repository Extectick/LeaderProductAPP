export type HelpTransportPhase = 'paused' | 'checking' | 'connecting' | 'ready' | 'offline';
export type HelpSyncPhase = 'idle' | 'syncing' | 'error';
export type HelpConnectionPhase = HelpTransportPhase | 'syncing' | 'sync-error';
export type HelpConnectionSnapshot = {transport:HelpTransportPhase;sync:HelpSyncPhase};

/** A slow history read is distinct from an unresponsive live connection. */
export function helpConnectionPhase(state:HelpConnectionSnapshot):HelpConnectionPhase {
  if(state.transport!=='ready')return state.transport;
  return state.sync==='syncing'?'syncing':state.sync==='error'?'sync-error':'ready';
}

/** Network outages belong in the small header status, not an action-error banner. */
export function isHelpConnectionIssue(error:unknown):boolean {
  const value=typeof error==='object'&&error!==null?error as {status?:number;code?:string;message?:string;name?:string}:null;
  if(value?.name==='TimeoutError')return true;
  if(value?.code==='HELP_ACCOUNT_CHANGED')return false;
  if(value?.status!==undefined&&[0,408,502,503,504].includes(value.status))return true;
  const message=typeof error==='string'?error:value?.message??'';
  return /нет (?:связи|соединения)|сервер.{0,30}(?:недоступен|не отвечает)|network(?: request)? (?:failed|error)|failed to fetch|fetch failed|networkerror|request timed out|connection (?:lost|refused)|socket disconnected/i.test(message);
}
