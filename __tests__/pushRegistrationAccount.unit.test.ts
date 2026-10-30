import {createPushRegistrationStore} from '../utils/pushRegistrationAccount';
const credential=(id:number)=>`${Buffer.from('{}').toString('base64')}.${Buffer.from(JSON.stringify({userId:id})).toString('base64')}.test`;
async function settle(){for(let i=0;i<15;i++)await Promise.resolve();}
let access:string|null,saved:string|null,request:jest.Mock,fetchExpo:jest.Mock,store:ReturnType<typeof createPushRegistrationStore>;
beforeEach(()=>{access=credential(5);saved=null;request=jest.fn(async()=>({ok:true,status:200}));fetchExpo=jest.fn(async()=> 'synthetic-expo-token');store=createPushRegistrationStore({acquireCredential:async()=>access,readCredential:async()=>access,fetchExpoToken:fetchExpo,request,readSavedToken:async()=>saved,saveToken:async token=>{saved=token;},removeToken:async()=>{saved=null;}});});
test('an old account cannot register after native token retrieval finishes late',async()=>{
 let resolve!:(value:any)=>void,alive=true;fetchExpo.mockReturnValueOnce(new Promise(done=>{resolve=done;}));const work=store.sync(5,()=>alive);await settle();alive=false;access=credential(6);resolve('synthetic-expo-token');expect(await work).toBeNull();expect(request).not.toHaveBeenCalled();expect(saved).toBeNull();
});
test('a late registration is compensated with its original credentials before logout cleanup',async()=>{
 let finish!:(value:any)=>void,alive=true;saved='previous-synthetic-token';request.mockImplementation((method:string)=>method==='POST'?new Promise(done=>{finish=done;}):Promise.resolve({ok:true,status:200}));
 const work=store.sync(5,()=>alive);await settle();expect(request.mock.calls.map(([method])=>method)).toEqual(['POST']);alive=false;const cleanup=store.unregister();finish({ok:true,status:200});await Promise.all([work,cleanup]);expect(request.mock.calls.map(([method])=>method)).toEqual(['POST','DELETE','DELETE']);expect(saved).toBeNull();expect(request.mock.calls[1][2]).toBe(credential(5));
});
test('HTTP authorization retains the original account if a different user signs in while POST is pending',async()=>{
 let finish!:(value:any)=>void;request.mockImplementation((method:string)=>method==='POST'?new Promise(done=>{finish=done;}):Promise.resolve({ok:true,status:200}));const work=store.sync(5);await settle();access=credential(6);finish({ok:true,status:200});expect(await work).toBeNull();expect(saved).toBeNull();for(const [,_,authorization] of request.mock.calls)expect(authorization).toBe(credential(5));
});
