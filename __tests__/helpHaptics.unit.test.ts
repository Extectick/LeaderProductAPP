import {AppState, Platform} from 'react-native';
import * as Haptics from 'expo-haptics';
import {helpHaptic} from '../src/features/help/helpHaptics';

jest.mock('expo-haptics', () => ({
  AndroidHaptics:{Confirm:'confirm',Reject:'reject',Gesture_Start:'start',Gesture_End:'end',Long_Press:'menu',Segment_Tick:'tick'},
  ImpactFeedbackStyle:{Medium:'medium',Light:'light'},NotificationFeedbackType:{Error:'error'},
  performAndroidHapticsAsync:jest.fn().mockResolvedValue(undefined),selectionAsync:jest.fn().mockResolvedValue(undefined),
  notificationAsync:jest.fn().mockResolvedValue(undefined),impactAsync:jest.fn().mockResolvedValue(undefined),
}));
const os=Platform.OS,state=AppState.currentState;
beforeEach(()=>{Platform.OS='android';AppState.currentState='active';jest.clearAllMocks();});
afterEach(()=>{Platform.OS=os;AppState.currentState=state;});
test('send and recorder transitions use distinct platform effects',()=>{
  helpHaptic('send');helpHaptic('recordStart');helpHaptic('recordPause');helpHaptic('recordLock');
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(1,'confirm');
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(2,'start');
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(3,'end');
  expect(Haptics.performAndroidHapticsAsync).toHaveBeenNthCalledWith(4,'confirm');
});
test('background and web do not vibrate; iOS uses native feedback',()=>{
  AppState.currentState='background';helpHaptic('send');AppState.currentState='active';Platform.OS='web';helpHaptic('send');
  expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  Platform.OS='ios';helpHaptic('selection');helpHaptic('send');
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
});
test('unsupported or failed native feedback never rejects the user action',async()=>{
  (Haptics.performAndroidHapticsAsync as jest.Mock).mockRejectedValueOnce(new Error('unsupported'));
  expect(()=>helpHaptic('send')).not.toThrow();await Promise.resolve();
  (Haptics.performAndroidHapticsAsync as jest.Mock).mockImplementationOnce(()=>{throw Error('unavailable');});
  expect(()=>helpHaptic('recordStart')).not.toThrow();
});
