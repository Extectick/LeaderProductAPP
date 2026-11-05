import {jwtDecode} from 'jwt-decode';
import {getAccessToken} from '@/utils/tokenService';
import {buildEntityLink,type EntityTarget} from '../../shared/entityLinks';

type Scope={expectedUserId:number;signal:AbortSignal;isCurrent?:()=>boolean};
function cancelled():never{const error=new Error('Действие отменено');error.name='AbortError';throw error;}
async function assertActive(scope:Scope){
 if(scope.signal.aborted||scope.isCurrent?.()===false)cancelled();
 const token=await getAccessToken();
 let id:number;try{id=Number(jwtDecode<{userId?:number}>(token||'').userId);}catch{cancelled();}
 if(!Number.isSafeInteger(scope.expectedUserId)||scope.expectedUserId<1||id!==scope.expectedUserId||scope.signal.aborted||scope.isCurrent?.()===false)cancelled();
}
/** Copy only a validated app identity, never a resolver URL or credentials. */
export async function copyEntityCardLink(target:EntityTarget,scope:Scope):Promise<void>{
 const link=buildEntityLink(target);
 await assertActive(scope);
 const Clipboard=require('expo-clipboard') as typeof import('expo-clipboard');
 await assertActive(scope);
 if(await Clipboard.setStringAsync(link)===false)throw Error('ENTITY_COPY_FAILED');
}
