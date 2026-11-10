import {AppState, Platform} from 'react-native';
import * as Haptics from 'expo-haptics';

export type HelpHapticEvent = 'send' | 'success' | 'error' | 'selection' | 'menu'
  | 'recordStart' | 'recordPause' | 'recordResume' | 'recordLock' | 'recordCancel';

/** User actions only. Native effects respect the device's haptic settings. */
export function helpHaptic(event: HelpHapticEvent): void {
  if (Platform.OS === 'web' || AppState.currentState !== 'active') return;
  try {
    let effect: Promise<void>;
    if (Platform.OS === 'android') {
      const kind = event === 'error' ? Haptics.AndroidHaptics.Reject
        : event === 'send' || event === 'success' || event === 'recordLock' ? Haptics.AndroidHaptics.Confirm
        : event === 'recordStart' || event === 'recordResume' ? Haptics.AndroidHaptics.Gesture_Start
        : event === 'recordPause' || event === 'recordCancel' ? Haptics.AndroidHaptics.Gesture_End
        : event === 'menu' ? Haptics.AndroidHaptics.Long_Press : Haptics.AndroidHaptics.Segment_Tick;
      effect = Haptics.performAndroidHapticsAsync(kind);
    } else if (event === 'selection') effect = Haptics.selectionAsync();
    else if (event === 'error') effect = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else effect = Haptics.impactAsync(event === 'recordLock' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    void effect.catch(() => {});
  } catch { /* Feedback must never block sending or recording. */ }
}
