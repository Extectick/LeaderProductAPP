import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {useHelpRecorderState} from '../src/features/help/useHelpRecorderState';

test('fallback recorder makes no status calls while idle and stops polling after recording',async()=>{
  jest.useFakeTimers();
  const recorder={getStatus:jest.fn(()=>({isRecording:true,durationMillis:800,metering:-20}))};
  let tree:Renderer.ReactTestRenderer|undefined,state:ReturnType<typeof useHelpRecorderState>;
  const Probe=({recording}:{recording:boolean})=>{state=useHelpRecorderState(recorder,recording);return null;};
  try{
    await act(async()=>{tree=Renderer.create(React.createElement(Probe,{recording:false}));});
    act(()=>jest.advanceTimersByTime(1000));expect(recorder.getStatus).not.toHaveBeenCalled();
    await act(async()=>tree!.update(React.createElement(Probe,{recording:true})));
    expect(state!).toMatchObject({isRecording:true,durationMillis:800});
    const calls=recorder.getStatus.mock.calls.length;act(()=>jest.advanceTimersByTime(160));
    expect(recorder.getStatus.mock.calls.length).toBe(calls+2);
    await act(async()=>tree!.update(React.createElement(Probe,{recording:false})));
    const stopped=recorder.getStatus.mock.calls.length;act(()=>jest.advanceTimersByTime(1000));
    expect(recorder.getStatus.mock.calls.length).toBe(stopped);expect(state!.durationMillis).toBe(0);
    await act(async()=>tree!.update(React.createElement(Probe,{recording:true})));
    expect(recorder.getStatus.mock.calls.length).toBe(stopped+1);
    await act(async()=>tree!.unmount());tree=undefined;
    const unmounted=recorder.getStatus.mock.calls.length;act(()=>jest.advanceTimersByTime(1000));
    expect(recorder.getStatus.mock.calls.length).toBe(unmounted);
  }finally{if(tree)await act(async()=>tree!.unmount());jest.useRealTimers();}
});
