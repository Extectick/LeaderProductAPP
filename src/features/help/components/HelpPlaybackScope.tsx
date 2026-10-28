import React, { useEffect } from 'react';
import { View } from 'react-native';
import { HelpAudioPlaybackProvider, useHelpAudioController, useHelpAudioPlayback } from '../HelpAudioPlayback';
import { helpDevActions, helpDevRef, helpDevState } from '../helpDiagnostics';
import { HelpVoicePlaybackBar } from './HelpVoicePlaybackBar';

/** Status ticks update consumers, without rerendering the screen or timeline. */
export function HelpPlaybackScope({ userId, ticketId, onError, children }: {
  userId: number | null | undefined; ticketId: number | null; onError: (message: string) => void; children: React.ReactNode;
}) {
  const playback = useHelpAudioController({ userId, ticketId, onError });
  return <HelpAudioPlaybackProvider value={playback}>{children}</HelpAudioPlaybackProvider>;
}

export function HelpChatPlayback({ onJump }: { onJump: (messageId: number) => void }) {
  const audio = useHelpAudioPlayback();
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
  if (!audio?.current) return null;
  return <View ref={node => helpDevRef('header.voice', node)} style={{ marginTop: -12, paddingBottom: 16 }}>
    <HelpVoicePlaybackBar author={audio.current.author} positionSeconds={audio.positionSeconds} durationSeconds={audio.durationSeconds}
      playing={audio.playing} loading={audio.loading} rate={audio.speed} onToggle={() => void audio.toggle()}
      onRateChange={audio.setSpeed} onClose={audio.stop} onPressTitle={() => onJump(audio.current!.messageId)} />
  </View>;
}
