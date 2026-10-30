/** Keep a cold-start response until a current authenticated navigator accepts it. */
export async function restorePendingPushResponse<T>(read:()=>Promise<T|null>,clear:()=>Promise<void>,dispatch:(response:T)=>boolean,isCurrent:()=>boolean){
  const response=await read();
  if(!response||!isCurrent())return false;
  const accepted=dispatch(response);
  if(accepted&&isCurrent())await clear();
  return accepted;
}
