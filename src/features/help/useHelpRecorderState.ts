import { useEffect, useState } from 'react';

type RecorderState = { isRecording: boolean; durationMillis: number; metering?: number };
type Recorder = { getStatus(): RecorderState };
const idle: RecorderState = { isRecording: false, durationMillis: 0 };

/** The fallback recorder is idle when the native voice control owns recording.
 * Poll its meter only during an actual fallback recording, never while typing. */
export function useHelpRecorderState(recorder: Recorder, recording: boolean) {
  const [state, setState] = useState<RecorderState>(idle);
  useEffect(() => {
    if (!recording) { setState(previous => previous === idle ? previous : idle); return; }
    const update = () => {
      const next = recorder.getStatus();
      setState(previous => previous.isRecording !== next.isRecording
        || Math.abs(previous.durationMillis - next.durationMillis) > 50
        || (previous.metering === undefined) !== (next.metering === undefined)
        || previous.metering !== undefined && next.metering !== undefined && Math.abs(previous.metering - next.metering) > .1
        ? next : previous);
    };
    update();
    const timer = setInterval(update, 80);
    return () => clearInterval(timer);
  }, [recorder, recording]);
  return state;
}
