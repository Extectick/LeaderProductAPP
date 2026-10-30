import {jwtDecode} from 'jwt-decode';
type Response={ok:boolean;status:number};
type Dependencies={
  acquireCredential:()=>Promise<string|null>;readCredential:()=>Promise<string|null>;
  fetchExpoToken:(askPermission?:boolean)=>Promise<string|null>;
  request:(method:'POST'|'DELETE',expoToken:string,credential:string)=>Promise<Response>;
  readSavedToken:()=>Promise<string|null>;saveToken:(token:string)=>Promise<void>;removeToken:()=>Promise<void>;
};
function ownerOf(token:string|null){try{return token?Number(jwtDecode<{userId?:number}>(token).userId):0;}catch{return 0;}}
/** Serialize registration/revocation so logout cannot be overtaken by an earlier request. */
export function createPushRegistrationStore(deps:Dependencies){
  let writes:Promise<unknown>=Promise.resolve();
  function serialized<T>(task:()=>Promise<T>){const next=writes.catch(()=>{}).then(task);writes=next;return next;}
  return {
    sync:async(expectedUserId?:number,isCurrent:()=>boolean=()=>true,options?:{askPermission?:boolean})=>{
      const before=await deps.acquireCredential(),owner=ownerOf(before);
      if(!owner||!isCurrent()||expectedUserId!==undefined&&owner!==expectedUserId)return null;
      const token=await deps.fetchExpoToken(options?.askPermission);if(!token||!isCurrent())return null;
      return serialized(async()=>{
        const credential=await deps.acquireCredential();
        if(!isCurrent()||!credential||ownerOf(credential)!==owner)return null;
        const result=await deps.request('POST',token,credential);
        if(!isCurrent()||ownerOf(await deps.readCredential())!==owner){
          await deps.request('DELETE',token,credential);return null;
        }
        if(!result.ok)throw Object.assign(new Error('Не удалось зарегистрировать push-токен'),{retryable:![400,401,403,404,422].includes(result.status)});
        await deps.saveToken(token);return token;
      });
    },
    unregister:()=>serialized(async()=>{
      const token=await deps.readSavedToken();if(!token)return;
      const credential=await deps.readCredential();
      try{if(credential)await deps.request('DELETE',token,credential);}finally{await deps.removeToken();}
    }),
  };
}
