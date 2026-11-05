jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('../utils/appVersion',()=>({getAppVersionInfo:jest.fn(()=>({fullVersionLabel:'0.1.46.19',nativeVersion:'0.1.46',nativeBuild:'45',updateId:'11111111-1111-4111-8111-111111111111',runtimeVersion:'0.1.46'}))}));
jest.mock('expo-updates',()=>({channel:'dev'}));
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{scheme:'leaderproduct',updates:{requestHeaders:{'expo-channel-name':'dev'}}}}}));
jest.mock('expo-application',()=>({applicationId:'com.leaderproduct.app'}));
import {createHelpOriginTracker,helpContextScreen,helpOriginTracker} from '../src/features/help/helpClientContext';
import {captureHelpClientContext,withHelpClientContext} from '../src/features/help/helpClientContextRuntime';
import type {EntityTarget} from '../src/shared/entityLinks';

const ownScope='https://dev.example.test:7',otherScope='https://dev.example.test:8';
const target:EntityTarget={v:1,source:'app',kind:'user',id:'7'};
const started=Date.parse('2026-11-05T10:00:00.000Z');
beforeEach(()=>{helpOriginTracker.observe('','home',undefined);});

test('screen comes from route templates and excludes groups or accidental raw values',()=>{
 expect(helpContextScreen(['(main)','orders','[id]'])).toBe('orders/[id]');
 expect(helpContextScreen(['(main)','orders','123','person@example.test'])).toBe('orders/[id]/[id]');
 expect(helpContextScreen(['(main)','orders','11111111-1111-4111-8111-111111111111'])).toBe('orders/[id]');
 expect(helpContextScreen(['https://private.test?token=secret'])).toBe('[id]');
});
test('opening Help retains the preceding ordinary page and marks it previous',()=>{
 const tracker=createHelpOriginTracker();tracker.observe(ownScope,'orders/[id]',undefined,started);
 tracker.observe(ownScope,'services/help',undefined,started+1000);
 expect(tracker.read(ownScope,started+2000)).toMatchObject({screen:'orders/[id]',state:'previous'});
 expect(tracker.read(ownScope,started+31*60*1000)).toBeUndefined();
});
test('the current normalized card survives closing as previous, and another page clears its target',()=>{
 const tracker=createHelpOriginTracker();tracker.observe(ownScope,'services/help',target,started);
 expect(tracker.read(ownScope,started)).toMatchObject({screen:'entity/app/user',target,state:'current'});
 tracker.observe(ownScope,'services/help',undefined,started+1000);
 expect(tracker.read(ownScope,started+1000)).toMatchObject({target,state:'previous'});
 tracker.observe(ownScope,'profile',undefined,started+2000);
 expect(tracker.read(ownScope,started+2000)).toEqual({screen:'profile',state:'current',capturedAt:new Date(started+2000).toISOString()});
});
test('nested card back changes target and invalid targets cannot leak arbitrary navigation fields',()=>{
 const tracker=createHelpOriginTracker();tracker.observe(ownScope,'services/help',target,started);
 const product={v:1,source:'onec',baseKey:'torg2026',metaType:'Catalogs',name:'Номенклатура',guid:'11111111-1111-4111-8111-111111111111'};
 tracker.observe(ownScope,'services/help',product,started+1000);
 expect(tracker.read(ownScope,started+1000)?.target).toEqual(product);
 tracker.observe(ownScope,'services/help',target,started+2000);
 expect(tracker.read(ownScope,started+2000)?.target).toEqual(target);
 tracker.observe(ownScope,'services/help',{...target,password:'private'},started+3000);
 expect(JSON.stringify(tracker.read(ownScope,started+3000))).not.toContain('private');
});
test('account change, sign out and a different API isolate previous page/object state',()=>{
 const tracker=createHelpOriginTracker();tracker.observe(ownScope,'services/help',target,started);
 expect(tracker.read(otherScope,started)).toBeUndefined();
 expect(tracker.read('https://prod.example.test:7',started)).toBeUndefined();
 tracker.observe(otherScope,'services/help',undefined,started+1);
 expect(tracker.read(otherScope,started+1)).not.toHaveProperty('target');
 expect(tracker.read(ownScope,started+1)).toBeUndefined();
 tracker.observe('','home',undefined,started+2);
 expect(tracker.read(otherScope,started+2)).toBeUndefined();
});
test('temporary HTML card cleanup cannot replace a newer card or another account context',()=>{
 const tracker=createHelpOriginTracker();tracker.observe(ownScope,'services/help',undefined,started);
 const releaseFirst=tracker.temporary(ownScope,target,started+1000);
 expect(tracker.read(ownScope,started+1000)).toMatchObject({target,state:'current'});
 const newer={...target,id:'19'},releaseNewer=tracker.temporary(ownScope,newer,started+2000);
 releaseFirst();expect(tracker.read(ownScope,started+2000)).toMatchObject({target:newer,state:'current'});
 releaseNewer(started+3000);expect(tracker.read(ownScope,started+3000)).toMatchObject({target:newer,state:'previous'});
 const releaseBeforeAccountChange=tracker.temporary(ownScope,target,started+4000);
 tracker.observe(otherScope,'profile',undefined,started+5000);releaseBeforeAccountChange();
 expect(tracker.read(ownScope,started+5000)).toBeUndefined();expect(tracker.read(otherScope,started+5000)).toMatchObject({screen:'profile',state:'current'});
});
test('closing an HTML overlay restores a still-open ordinary entity panel',()=>{
 const tracker=createHelpOriginTracker();tracker.observe(ownScope,'services/help',target,started);
 const release=tracker.temporary(ownScope,{...target,id:'19'},started+1000);release(started+2000);
 expect(tracker.read(ownScope,started+2000)).toMatchObject({target,state:'current'});
});
test('diagnostics capture version, real native runtime and short locale/timezone without auth/contact values',()=>{
 const context=captureHelpClientContext(ownScope);
 expect(context).toMatchObject({v:1,app:{platform:'android',version:'0.1.46.19',nativeVersion:'0.1.46',build:'45',channel:'dev',runtimeVersion:'0.1.46',developmentClient:false}});
 expect(typeof context.locale).toBe('string');expect(typeof context.timeZone).toBe('string');
 expect(JSON.stringify(context)).not.toMatch(/password|email|phone|token|userId|profile/);
});
test('a queued logical send keeps its captured context even after navigation and an OTA value change',()=>{
 helpOriginTracker.observe(ownScope,'orders/[id]',undefined,started);
 const sent=withHelpClientContext({text:'Что здесь?',clientContext:undefined},ownScope);
 helpOriginTracker.observe(ownScope,'profile',undefined,started+1000);
 const replay=withHelpClientContext(sent,ownScope);
 expect(replay.clientContext).toBe(sent.clientContext);
 expect(replay.clientContext.origin?.screen).toBe('orders/[id]');
 expect(captureHelpClientContext(ownScope).origin?.screen).toBe('profile');
});
test('optional native diagnostics failure leaves sending possible',()=>{
 const versions=require('../utils/appVersion');versions.getAppVersionInfo.mockImplementationOnce(()=>{throw Error('native temporarily unavailable')});
 expect(captureHelpClientContext(ownScope)).toMatchObject({v:1,app:{platform:'android'}});
});
test('development-client identity is separate from OTA disabled or a generic development build',()=>{
 const application=require('expo-application'),updates=require('expo-updates');application.applicationId='com.leaderproduct.app.dev';
 const before=updates.channel;updates.channel=null;
 try{expect(captureHelpClientContext(ownScope).app).toMatchObject({developmentClient:true,channel:'dev'});}
 finally{application.applicationId='com.leaderproduct.app';updates.channel=before;}
});
