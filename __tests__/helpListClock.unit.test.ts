import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AppState} from 'react-native';
import {useHelpListClock} from '../src/features/help/useHelpListClock';

test('only the visible foreground list owns one clock; background and unmount stop it',()=>{
  jest.useFakeTimers();jest.setSystemTime(new Date(2026,10,5,12));
  let clock=0,listener!:(state:string)=>void,screen:TestRenderer.ReactTestRenderer|undefined;
  const remove=jest.fn();const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((_event,callback)=>{listener=callback as any;return {remove};});
  function Probe({enabled}:{enabled:boolean}){clock=useHelpListClock(enabled);return null;}
  try{
    act(()=>{screen=TestRenderer.create(React.createElement(Probe,{enabled:false}));});
    expect(subscription).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
    act(()=>screen!.update(React.createElement(Probe,{enabled:true})));expect(jest.getTimerCount()).toBe(1);
    const before=clock;act(()=>jest.advanceTimersByTime(60000));expect(clock).toBe(before+60000);
    act(()=>listener('background'));expect(jest.getTimerCount()).toBe(0);
    const background=clock;act(()=>jest.advanceTimersByTime(120000));expect(clock).toBe(background);
    act(()=>listener('active'));expect(clock).toBe(Date.now());expect(jest.getTimerCount()).toBe(1);
    act(()=>screen!.update(React.createElement(Probe,{enabled:false})));expect(jest.getTimerCount()).toBe(0);expect(remove).toHaveBeenCalledTimes(1);
  }finally{if(screen)act(()=>screen!.unmount());subscription.mockRestore();jest.useRealTimers();}
});
