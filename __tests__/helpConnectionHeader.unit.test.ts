import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AppState,Platform,StyleSheet} from 'react-native';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({muted:'#888',text:'#111',panel:'#eee',accentText:'#07f'}),useHelpReducedMotion:()=>false}));
jest.mock('../src/features/help/helpDiagnostics',()=>({helpDevRef:jest.fn()}));
jest.mock('../src/features/help/components/HelpPrimitives',()=>({HelpIcon:'HelpIcon'}));
import {HelpHeaderFrame} from '../src/features/help/components/HelpHeaderFrame';
import type {HelpConnectionPhase} from '../src/features/help/helpConnectionState';

let view:TestRenderer.ReactTestRenderer|undefined;
const originalPlatform=Platform.OS,originalState=AppState.currentState;
const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
const appListeners=new Set<()=>void>(),documentListeners=new Set<()=>void>();
let visibilityState='visible';
beforeEach(()=>{
  jest.useFakeTimers();Platform.OS='android';AppState.currentState='active';visibilityState='visible';
  appListeners.clear();documentListeners.clear();
  jest.spyOn(AppState,'addEventListener').mockImplementation((_type,listener)=>{
    const changed=listener as ()=>void;appListeners.add(changed);
    return {remove:()=>appListeners.delete(changed)};
  });
  Object.defineProperty(globalThis,'document',{configurable:true,value:{
    get visibilityState(){return visibilityState;},
    addEventListener:(_type:string,listener:()=>void)=>documentListeners.add(listener),
    removeEventListener:(_type:string,listener:()=>void)=>documentListeners.delete(listener),
  }});
});
afterEach(async()=>{
  if(view)await act(async()=>view!.unmount());view=undefined;
  expect(appListeners.size).toBe(0);expect(documentListeners.size).toBe(0);
  jest.restoreAllMocks();jest.useRealTimers();Platform.OS=originalPlatform;AppState.currentState=originalState;
  if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');
});
const status=()=>view!.root.findAllByProps({testID:'help-connection-status'})[0]?.props.children;
const advance=async(ms:number)=>{await act(async()=>jest.advanceTimersByTime(ms));};
const mount=async(props:React.ComponentProps<typeof HelpHeaderFrame>)=>{await act(async()=>{view=TestRenderer.create(React.createElement(HelpHeaderFrame,props));});};
const update=async(props:React.ComponentProps<typeof HelpHeaderFrame>)=>{await act(async()=>view!.update(React.createElement(HelpHeaderFrame,props)));};
const visible=async(active:boolean)=>{
  await act(async()=>{
    visibilityState=active?'visible':'hidden';AppState.currentState=active?'active':'background';
    // Web emits both native compatibility and DOM events for the same transition.
    for(const listener of appListeners)listener();
    for(const listener of documentListeners)listener();
  });
};

test('legacy connecting stays silent until timeout, then offers retry without shifting geometry',async()=>{
  const onReconnect=jest.fn(),props={onBack:jest.fn(),connecting:true,onReconnect};
  await mount(props);
  const geometry=StyleSheet.flatten(view!.root.findByProps({testID:'help-header'}).props.style);
  await advance(11999);expect(status()).toBeUndefined();
  await advance(1);expect(status()).toBe('Нет связи');
  expect(view!.root.findAllByProps({testID:'help-connection-spinner'})).toHaveLength(0);
  expect(StyleSheet.flatten(view!.root.findByProps({testID:'help-header'}).props.style)).toEqual(geometry);
  const retry=view!.root.findAllByProps({testID:'help-connection-retry'}).find(node=>node.props.accessibilityRole==='button')!;
  await act(async()=>retry.props.onPress());expect(onReconnect).toHaveBeenCalledTimes(1);
  expect(status()).toBeUndefined();await advance(11999);expect(status()).toBeUndefined();
  await update({...props,connecting:false});expect(status()).toBeUndefined();
  await advance(12000);expect(status()).toBeUndefined();
});

test.each(['android','web'] as const)('%s ignores background time and starts a fresh connection budget on resume',async(platform)=>{
  Platform.OS=platform;await mount({connectionPhase:'connecting'});
  await advance(1000);expect(status()).toBeUndefined();
  await visible(false);await advance(60000);expect(status()).toBeUndefined();
  await visible(true);expect(status()).toBeUndefined();
  await advance(11999);expect(status()).toBeUndefined();
  await advance(1);expect(status()).toBe('Нет связи');
});

test.each(['android','web'] as const)('%s does not restart the attempt on duplicate foreground events',async(platform)=>{
  Platform.OS=platform;await mount({connectionPhase:'connecting'});
  await advance(8000);await visible(true);
  await advance(4000);expect(status()).toBe('Нет связи');
});

test.each(['android','web'] as const)('%s clears an expired status through background and starts clean on resume',async(platform)=>{
  Platform.OS=platform;await mount({connectionPhase:'connecting'});
  await advance(12000);expect(status()).toBe('Нет связи');
  await visible(false);await advance(60000);await visible(true);
  expect(status()).toBeUndefined();await advance(11999);expect(status()).toBeUndefined();
});

test.each(['checking','syncing'] as const)('%s never displays normal resume/sync work as lost connection',async(connectionPhase)=>{
  await mount({connecting:true,connectionPhase});
  await advance(30000);expect(status()).toBeUndefined();
  expect(view!.root.findAllByProps({testID:'help-connection-retry'})).toHaveLength(0);
  await visible(false);await advance(60000);await visible(true);
  await advance(30000);expect(status()).toBeUndefined();
});

test.each(['offline','sync-error'] as const)('a one-second %s followed by synchronization does not flash',async(connectionPhase)=>{
  await mount({connectionPhase});await advance(1000);expect(status()).toBeUndefined();
  await update({connectionPhase:'syncing'});await advance(4000);expect(status()).toBeUndefined();
  await update({connectionPhase:'ready'});await advance(12000);expect(status()).toBeUndefined();
});

test.each([
  ['offline','Нет связи','Повторить подключение'],
  ['sync-error','Не удалось обновить','Повторить обновление сообщений'],
] as const)('%s is visible only after sustained failure and resets on retry/resume',async(connectionPhase,label,retryLabel)=>{
  const onReconnect=jest.fn();await mount({connectionPhase,onReconnect});
  await advance(2999);expect(status()).toBeUndefined();await advance(1);expect(status()).toBe(label);
  expect(view!.root.findAllByProps({testID:'help-connection-spinner'})).toHaveLength(0);
  const retry=view!.root.findAllByProps({testID:'help-connection-retry'}).find(node=>node.props.accessibilityRole==='button')!;
  expect(retry.props.accessibilityLabel).toBe(retryLabel);
  await act(async()=>retry.props.onPress());expect(onReconnect).toHaveBeenCalledTimes(1);expect(status()).toBeUndefined();
  await advance(3000);expect(status()).toBe(label);
  await visible(false);expect(status()).toBeUndefined();await advance(60000);await visible(true);expect(status()).toBeUndefined();
  await advance(2999);expect(status()).toBeUndefined();await advance(1);expect(status()).toBe(label);
  await update({connectionPhase:'ready',onReconnect});expect(status()).toBeUndefined();
});

test('new attempts and phase changes discard stale warning timers',async()=>{
  await mount({connectionPhase:'offline'});await advance(2000);
  await update({connectionPhase:'sync-error'});await advance(1000);expect(status()).toBeUndefined();
  await update({connectionPhase:'ready'});await advance(12000);expect(status()).toBeUndefined();
  await update({connectionPhase:'connecting'});await advance(12000);expect(status()).toBe('Нет связи');
  for(const connectionPhase of ['checking','syncing','connecting'] as HelpConnectionPhase[]){
    await update({connectionPhase});expect(status()).toBeUndefined();
    await advance(400);expect(status()).toBeUndefined();
  }
  await update({connectionPhase:'paused'});await advance(12000);expect(status()).toBeUndefined();
});
