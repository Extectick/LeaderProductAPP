/** Network outages belong in the small header status, not an action-error banner. */
export function isHelpConnectionIssue(error:unknown):boolean {
  const value=typeof error==='object'&&error!==null?error as {status?:number;code?:string;message?:string}:null;
  if(value?.code==='HELP_ACCOUNT_CHANGED')return false;
  if(value?.status!==undefined&&[0,408,502,503,504].includes(value.status))return true;
  const message=typeof error==='string'?error:value?.message??'';
  return /нет (?:связи|соединения)|сервер.{0,30}(?:недоступен|не отвечает)|network(?: request)? (?:failed|error)|failed to fetch|fetch failed|networkerror|request timed out|connection (?:lost|refused)|socket disconnected/i.test(message);
}
