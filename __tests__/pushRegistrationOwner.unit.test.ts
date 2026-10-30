const mockSync=jest.fn(async(..._args:any[])=>null),mockRemoveState=jest.fn(),mockState=jest.fn((..._args:any[])=>({remove:mockRemoveState}));
let mockResolveRotation!:(dispose:()=>void)=>void;
const mockRotation=jest.fn((..._args:any[])=>new Promise<()=>void>(done=>{mockResolveRotation=done;}));
jest.mock('react-native',()=>({Platform:{OS:'android'},AppState:{addEventListener:(...args:any[])=>mockState(...args)}}));
jest.mock('../utils/pushNotifications',()=>({syncPushToken:(...args:any[])=>mockSync(...args),subscribePushTokenChanges:(...args:any[])=>mockRotation(...args)}));
import {startPushTokenRegistration} from '../utils/pushRegistration';
test('authenticated lifecycle owns one foreground and rotation listener; a late listener is removed after logout',async()=>{
 const stop=startPushTokenRegistration(5);for(let i=0;i<5;i++)await Promise.resolve();expect(mockState).toHaveBeenCalledTimes(1);expect(mockRotation).toHaveBeenCalledTimes(1);expect(mockSync).toHaveBeenCalledTimes(1);
 const current=mockSync.mock.calls[0][1] as ()=>boolean;expect(current()).toBe(true);stop();stop();expect(current()).toBe(false);expect(mockRemoveState).toHaveBeenCalledTimes(1);
 const removeRotation=jest.fn();mockResolveRotation(removeRotation);for(let i=0;i<5;i++)await Promise.resolve();expect(removeRotation).toHaveBeenCalledTimes(1);
});
