import {HelpAudioTranscriptScope} from '../helpAudioTranscript';
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { HelpAudioPlaybackProvider, useHelpAudioController, useHelpAudioPlayback, type HelpAudioPlaybackController } from '../HelpAudioPlayback';
import { helpDevActions, helpDevRef, helpDevState } from '../helpDiagnostics';
import { HelpVoicePlaybackBar, HELP_VOICE_PLAYBACK_BAR_HEIGHT } from './HelpVoicePlaybackBar';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';

const PlaybackScopeIdentity = createContext('');

/** Status ticks update consumers, without rerendering the screen or timeline. */
export function HelpPlaybackScope({ userId, ticketId, onError, children }: {
  userId: number | null | undefined; ticketId: number | null; onError: (message: string) => void; children: React.ReactNode;
}) {
  const playback = useHelpAudioController({ userId, ticketId, onError });
  return <PlaybackScopeIdentity.Provider value={`${userId ?? ''}:${ticketId ?? ''}`}><HelpAudioTranscriptScope userId={userId} ticketId={ticketId}><HelpAudioPlaybackProvider value={playback}>{children}</HelpAudioPlaybackProvider></HelpAudioTranscriptScope></PlaybackScopeIdentity.Provider>;
}

export function HelpChatPlayback({ onJump }: { onJump: (messageId: number) => void }) {
  const audio = useHelpAudioPlayback();
  const scope = useContext(PlaybackScopeIdentity);
  useEffect(() => helpDevActions('voice', {
    'voice.toggle': () => audio?.toggle(),
    'voice.speed': value => { if (value === 1 || value === 1.5 || value === 2) audio?.setSpeed(value); },
    'voice.stop': () => audio?.stop(),
    'voice.jump': () => { if (audio?.current) onJump(audio.current.messageId); },
  }), [audio, onJump]);
  useEffect(() => {
    helpDevState({ voiceActive: Boolean(audio?.current), voicePlaying: audio?.playing ?? false, voiceLoading: audio?.loading ?? false,
      voicePosition: Math.round((audio?.positionSeconds ?? 0) * 10) / 10, voiceDuration: audio?.durationSeconds ?? 0,
      voiceSpeed: audio?.speed ?? 1, voiceError: Boolean(audio?.error) });
  }, [audio]);
  // A new account/ticket never retains the previous author's closing frame.
  return <HelpPlaybackPresence key={scope} audio={audio} onJump={onJump} />;
}

/** Retain only the closing visual, while controls and playback stop immediately. */
export function HelpPlaybackPresence({ audio, onJump }: { audio: HelpAudioPlaybackController | null; onJump: (messageId: number) => void }) {
  const c = useHelpTheme(), reduced = useHelpReducedMotion();
  const visible = Boolean(audio?.current);
  const [retained, setRetained] = useState<HelpAudioPlaybackController | null>(visible ? audio : null);
  const latest = useRef(audio); latest.current = audio;
  const lastVisible = useRef(audio?.current ? audio : null);
  if (visible) lastVisible.current = audio;
  const transition = useRef(new Animated.Value(0)).current;
  const revision = useRef(0);
  useLayoutEffect(() => {
    const version = ++revision.current;
    transition.stopAnimation();
    if (visible) setRetained(latest.current);
    if (!visible && !lastVisible.current) { transition.setValue(0); return; }
    if (reduced) {
      transition.setValue(visible ? 1 : 0);
      if (!visible) setRetained(null);
      return;
    }
    const animation = Animated.timing(transition, {
      toValue: visible ? 1 : 0, duration: visible ? 200 : 180,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !visible && version === revision.current) setRetained(null);
    });
    return () => { ++revision.current; animation.stop(); };
  }, [visible, reduced, transition]);
  const shown = visible ? audio : retained ? lastVisible.current : null;
  if (!shown?.current) return null;
  const item = shown.current;
  return <Animated.View testID="help-voice-playback-presence" pointerEvents={visible ? 'auto' : 'none'}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    style={{ height: transition.interpolate({ inputRange: [0, 1], outputRange: [0, HELP_VOICE_PLAYBACK_BAR_HEIGHT + 4] }), overflow: 'hidden' }}>
    <Animated.View ref={node => helpDevRef('header.voice', node as unknown as View)}
      style={{ opacity: transition, transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }], backgroundColor: c.headerSurface }}>
      <HelpVoicePlaybackBar author={item.author} positionSeconds={shown.positionSeconds} durationSeconds={shown.durationSeconds}
        playing={visible && shown.playing} loading={visible && shown.loading} rate={shown.speed}
        onToggle={() => { if (visible) void latest.current?.toggle(); }}
        onRateChange={rate => { if (visible) latest.current?.setSpeed(rate); }}
        onClose={() => { if (visible) latest.current?.stop(); }}
        onPressTitle={() => { if (visible) onJump(item.messageId); }} />
    </Animated.View>
  </Animated.View>;
}
