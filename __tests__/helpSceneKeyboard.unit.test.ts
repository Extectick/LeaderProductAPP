import {Keyboard,Platform} from 'react-native';
import {dismissHelpSceneKeyboard} from '../src/features/help/helpSceneKeyboard';

describe('scene navigation and the keyboard',()=>{
  let original:string;
  beforeEach(()=>{original=Platform.OS;Object.defineProperty(Platform,'OS',{value:'android',configurable:true});jest.useFakeTimers();});
  afterEach(()=>{Object.defineProperty(Platform,'OS',{value:original,configurable:true});jest.restoreAllMocks();jest.useRealTimers();});
  test('does not delay a scene whose keyboard is already hidden',async()=>{
    jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);const hide=jest.spyOn(Keyboard,'dismiss');const listen=jest.spyOn(Keyboard,'addListener');
    await dismissHelpSceneKeyboard();expect(hide).toHaveBeenCalledTimes(1);expect(listen).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
  });
  test('starts the scene after the actual keyboard hide event and removes the fallback',async()=>{
    jest.spyOn(Keyboard,'isVisible').mockReturnValue(true);jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
    let hidden!:()=>void;const remove=jest.fn();jest.spyOn(Keyboard,'addListener').mockImplementation((_event,callback)=>{hidden=callback as ()=>void;return {remove} as any;});
    let finished=false;const closing=dismissHelpSceneKeyboard().then(()=>{finished=true;});await Promise.resolve();expect(finished).toBe(false);
    hidden();await closing;expect(finished).toBe(true);expect(remove).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
  });
  test('a missing Android event cannot trap Back indefinitely',async()=>{
    jest.spyOn(Keyboard,'isVisible').mockReturnValue(true);jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});const remove=jest.fn();jest.spyOn(Keyboard,'addListener').mockReturnValue({remove} as any);
    const closing=dismissHelpSceneKeyboard();jest.advanceTimersByTime(350);await closing;expect(remove).toHaveBeenCalledTimes(1);
  });
});
