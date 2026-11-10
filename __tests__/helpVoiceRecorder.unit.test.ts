import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, PanResponder, Platform, StyleSheet } from 'react-native';
jest.mock('react-native-gesture-handler', () => {
  const build = () => {
    const gesture: any = { handlers: {} };
    for (const name of ['withTestId','enabled','maxPointers','manualActivation','shouldCancelWhenOutside']) gesture[name] = () => gesture;
    for (const name of ['onTouchesDown','onStart','onUpdate','onEnd','onFinalize']) gesture[name] = (fn: unknown) => { gesture.handlers[name] = fn; return gesture; };
    return gesture;
  };
  return { Gesture: { Pan: build }, GestureDetector: 'GestureDetector' };
});
jest.mock('react-native-reanimated', () => {
  const React = require('react'), RN = require('react-native');
  return { __esModule:true, default:{View:RN.View}, cancelAnimation:jest.fn(),runOnJS:(fn:unknown)=>fn,
    useSharedValue:(value:unknown)=>React.useRef({value}).current,
    useAnimatedStyle:(fn:()=>any)=>({get transform(){return fn().transform;},get opacity(){return fn().opacity;}}),withTiming:(value:unknown)=>value };
});
let mockSnapshot = {
  recording: false,
  durationMs: 0,
  amplitude: 0,
  hasDraft: false
};
const mockNative = {
  snapshot: jest.fn(async () => mockSnapshot),
  start: jest.fn(async () => {
    mockSnapshot = {
      ...mockSnapshot,
      recording: true,
      hasDraft: true
    };
    return mockSnapshot;
  }),
  pause: jest.fn(async () => {
    mockSnapshot = {
      ...mockSnapshot,
      recording: false
    };
    return mockSnapshot;
  }),
  discard: jest.fn(async () => {
    mockSnapshot = {
      recording: false,
      durationMs: 0,
      amplitude: 0,
      hasDraft: false
    };
  }),
  exportAudio: jest.fn(async () => ({
    uri: 'file://export.m4a',
    size: 1000,
    durationMs: 3000
  }))
};
const mockPlayer = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  seekTo: jest.fn(async () => {})
};
const mockPermission = jest.fn(async () => ({
  granted: true
}));
let mockTouchPosition = {absoluteX:0,absoluteY:0};
jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => mockNative
}));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: () => mockPermission(),
  requestRecordingPermissionsAsync: () => mockPermission(),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({
    playing: false,
    currentTime: 0,
    didJustFinish: false
  })
}));
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(async () => {})
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons'
}));
jest.mock('../src/features/help/helpTheme', () => ({
  useHelpTheme: () => ({
    surface: '#fff',
    text: '#111',
    muted: '#999',
    accent: '#3289ff',
    panel: '#eee',
    line: '#ddd',
    danger: '#f00'
  }),
  useHelpReducedMotion: () => true
}));
jest.mock('../src/features/help/HelpAudioPlayback', () => ({
  useHelpAudioCommands: () => ({
    stop: jest.fn()
  })
}));
jest.mock('../src/features/help/helpHaptics',()=>({helpHaptic:jest.fn()}),{virtual:true});
const {helpHaptic}=require('../src/features/help/helpHaptics');
Object.defineProperty(Platform, 'OS', {
  configurable: true,
  value: 'android'
});
const {
  HelpVoiceRecorder
} = require('../src/features/help/components/HelpVoiceRecorder');
describe('Android voice draft transitions', () => {
  let tree: TestRenderer.ReactTestRenderer, appChange: (next: string) => void;
  let props: any;
  beforeEach(() => {
    mockTouchPosition = {absoluteX:0,absoluteY:0};
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPermission.mockResolvedValue({
      granted: true
    });
    mockSnapshot = {
      recording: false,
      durationMs: 0,
      amplitude: 0,
      hasDraft: false
    };
    jest.spyOn(PanResponder, 'create').mockImplementation(config => ({
      panHandlers: config
    }) as any);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      appChange = callback as any;
      return {
        remove: jest.fn()
      };
    });
    props = {
      draftKey: 'qa:voice',
      visible: true,
      disabled: false,
      onActive: jest.fn(),
      onSend: jest.fn(async () => true),
      error: jest.fn()
    };
  });
  afterEach(async () => {
    if (tree) await act(async () => tree.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  async function render() {
    await act(async () => {
      tree = TestRenderer.create(React.createElement(HelpVoiceRecorder, props));
    });
  }
  function button(label: string) {
    return tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  }
  function mic() {
    const handlers = tree.root.findByType('GestureDetector' as any).props.gesture.handlers;
    return {props:{
      onPanResponderGrant: () => {
        mockTouchPosition={absoluteX:0,absoluteY:0};
        // RNGH dispatches pointer DOWN before Pan's native handle() calls begin.
        // Android rejects setGestureState(ACTIVE) unless it is already BEGAN.
        let state:'undetermined'|'began'|'active'|'failed'='undetermined';
        handlers.onTouchesDown({allTouches:[mockTouchPosition]},{
          begin:()=>{if(state==='undetermined')state='began';},
          activate:()=>{if(state==='began'){state='active';handlers.onStart();}},
          fail:()=>{state='failed';},
        });
      },
      onPanResponderMove: (_:unknown,g:{dx:number;dy:number}) => { jest.advanceTimersByTime(16);mockTouchPosition={absoluteX:g.dx,absoluteY:g.dy};handlers.onUpdate(mockTouchPosition); },
      onPanResponderRelease: () => handlers.onEnd(mockTouchPosition,true)
    }};
  }
  async function tick(durationMs: number) {
    mockSnapshot = {
      ...mockSnapshot,
      durationMs
    };
    await act(async () => {
      jest.advanceTimersByTime(80);
    });
  }
  async function lock() {
    await act(async () => mic().props.onPanResponderGrant());
    await act(async () => mic().props.onPanResponderMove(null, {
      dx: 0,
      dy: -80
    }));
    await act(async () => mic().props.onPanResponderRelease());
  }
  test('locking and pausing keep the input height and place the locked pause above the send button',async()=>{
    await render();await lock();await tick(2000);
    const locked=StyleSheet.flatten(tree.root.findByProps({testID:'help-voice-locked'}).props.style);
    expect(locked).toMatchObject({height:48,marginTop:0,borderWidth:0});
    expect(button('Приостановить запись').props.style).toMatchObject({bottom:72,right:11,height:44});
    await act(async()=>button('Приостановить запись').props.onPress());
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'help-voice-paused'}).props.style)).toMatchObject({height:48,marginTop:0});
    expect(props.onSend).not.toHaveBeenCalled();
  });
  test('a stationary finger starts recording before any move event', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({testID:'help-voice-holding'}).length).toBeGreaterThan(0);
    await tick(2000);
    await act(async () => mic().props.onPanResponderRelease());
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });
  test('mic switches between single axes until locking, then ignores further dragging', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await act(async () => mic().props.onPanResponderMove(null, { dx: -12, dy: -20 }));
    const transform = () => StyleSheet.flatten(tree.root.findAllByProps({ testID: 'help-voice-drag-button' })[0].props.style).transform;
    expect(transform()[0].translateX).toBe(0);
    expect(transform()[1].translateY).toBe(-20);
    await act(async () => mic().props.onPanResponderMove(null, { dx: -45, dy: -30 }));
    expect(transform()[0].translateX).toBe(-45);
    expect(transform()[1].translateY).toBe(0);
    expect(mockNative.discard).not.toHaveBeenCalled();
    await act(async () => mic().props.onPanResponderMove(null, { dx: 15, dy: 12 }));
    expect(transform()[0].translateX).toBe(0);
    expect(transform()[1].translateY).toBe(0);
    await act(async () => mic().props.onPanResponderMove(null, { dx: -45, dy: -80 }));
    expect(transform()[1].translateY).toBe(-65);
    expect(button('Приостановить запись')).toBeUndefined();
    await act(async () => mic().props.onPanResponderRelease());
    expect(transform()[1].translateY).toBe(0);
    await act(async () => mic().props.onPanResponderMove(null, { dx: -100, dy: -80 }));
    expect(mockNative.discard).not.toHaveBeenCalled();
    expect(button('Приостановить запись')).toBeDefined();
  });
  test('upward drag can switch to horizontal cancellation without diagonal motion', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await act(async () => mic().props.onPanResponderMove(null, { dx: -15, dy: -30 }));
    await act(async () => mic().props.onPanResponderMove(null, { dx: -45, dy: -30 }));
    const transform = StyleSheet.flatten(tree.root.findAllByProps({ testID: 'help-voice-drag-button' })[0].props.style).transform;
    expect(transform[0].translateX).toBe(-45);
    expect(transform[1].translateY).toBe(0);
    expect(button('Приостановить запись')).toBeUndefined();
    await act(async () => mic().props.onPanResponderMove(null, { dx: -90, dy: -40 }));
    expect(mockNative.discard).not.toHaveBeenCalled();
    await act(async () => mic().props.onPanResponderRelease());
    expect(mockNative.discard).toHaveBeenCalledTimes(1);
    expect(props.onSend).not.toHaveBeenCalled();
  });
  test('crossing both targets while holding is reversible and only release commits the final target', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await tick(2000);
    await act(async () => mic().props.onPanResponderMove(null, { dx: 0, dy: -100 }));
    expect(button('Приостановить запись')).toBeUndefined();
    await act(async () => mic().props.onPanResponderMove(null, { dx: -100, dy: -20 }));
    expect(mockNative.discard).not.toHaveBeenCalled();
    expect(mockNative.pause).not.toHaveBeenCalled();
    await act(async () => mic().props.onPanResponderMove(null, { dx: 0, dy: 0 }));
    await act(async () => mic().props.onPanResponderRelease());
    expect(props.onSend).toHaveBeenCalledTimes(1);
    expect(mockNative.exportAudio).toHaveBeenCalledWith('qa:voice', 0, 2000);
  });
  test('native gesture interruption pauses instead of sending or deleting', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await tick(2000);
    await act(async () => tree.root.findByType('GestureDetector' as any).props.gesture.handlers.onFinalize({},false));
    expect(button('Продолжить запись')).toBeDefined();
    expect(props.onSend).not.toHaveBeenCalled();
    expect(mockNative.discard).not.toHaveBeenCalled();
  });
  test('release uses the final target even when its position update was coalesced', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await tick(2000);
    const handlers = tree.root.findByType('GestureDetector' as any).props.gesture.handlers;
    await act(async () => {
      handlers.onUpdate({absoluteX:-20,absoluteY:0});
      handlers.onUpdate({absoluteX:-100,absoluteY:0});
    });
    expect(mockNative.discard).not.toHaveBeenCalled();
    await act(async () => handlers.onEnd({absoluteX:-100,absoluteY:0},true));
    expect(mockNative.discard).toHaveBeenCalledTimes(1);
    expect(props.onSend).not.toHaveBeenCalled();
  });
  test('hold release sends, upward gesture locks and pause does not send', async () => {
    await render();
    await lock();
    await tick(4000);
    await act(async () => button('Приостановить запись').props.onPress());
    expect(props.onSend).not.toHaveBeenCalled();
    expect(button('Продолжить запись')).toBeDefined();
    await act(async () => button('Отправить запись').props.onPress());
    expect(mockNative.exportAudio).toHaveBeenCalledWith('qa:voice', 0, 4000);
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'file://export.m4a',
      mimeType: 'audio/mp4'
    }));
    expect(mockNative.discard).toHaveBeenCalledWith('qa:voice');
  });
  test('trim affects preview and send; resume resets trim and returns to locked recording', async () => {
    mockSnapshot = {
      recording: false,
      durationMs: 4000,
      amplitude: 0,
      hasDraft: true
    };
    await render();
    await act(async () => tree.root.findAllByProps({
      testID: 'help-voice-wave'
    })[0].props.onLayout({
      nativeEvent: {
        layout: {
          width: 200
        }
      }
    }));
    const handle = tree.root.findAll(n => n.props.accessibilityLabel === 'Начало обрезки')[0];
    await act(async () => {
      handle.props.onPanResponderGrant();
      handle.props.onPanResponderMove(null, {
        dx: 50
      });
      handle.props.onPanResponderRelease();
    });
    await act(async () => button('Прослушать выбранный фрагмент').props.onPress());
    expect(mockNative.exportAudio).toHaveBeenLastCalledWith('qa:voice', 1000, 4000);
    await act(async () => button('Продолжить запись').props.onPress());
    expect(button('Приостановить запись')).toBeDefined();
    expect(mockPlayer.pause).toHaveBeenCalled();
    await tick(5500);
    await act(async () => button('Приостановить запись').props.onPress());
    await act(async () => button('Отправить запись').props.onPress());
    expect(mockNative.exportAudio).toHaveBeenLastCalledWith('qa:voice', 0, 5500);
  });
  test('limit and background enter pause without sending; navigation retains native draft', async () => {
    await render();
    await lock();
    await tick(3000);
    await act(async () => appChange('background'));
    expect(button('Продолжить запись')).toBeDefined();
    expect(props.onSend).not.toHaveBeenCalled();
    await act(async () => appChange('active'));
    await act(async () => button('Продолжить запись').props.onPress());
    mockSnapshot = {
      recording: false,
      durationMs: 60000,
      amplitude: 0,
      hasDraft: true
    };
    await tick(60000);
    expect(button('Продолжить запись').props.disabled).toBe(true);
    expect(props.onSend).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
    expect(mockNative.pause).toHaveBeenCalledWith('qa:voice');
    expect(mockNative.discard).not.toHaveBeenCalled();
  });
  test('releasing an unlocked recording sends the full audio, while sliding left discards it', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await tick(1400);
    await act(async () => mic().props.onPanResponderRelease());
    expect(mockNative.exportAudio).toHaveBeenLastCalledWith('qa:voice', 0, 1400);
    await act(async () => mic().props.onPanResponderGrant());
    await tick(1000);
    await act(async () => mic().props.onPanResponderMove(null, {
      dx: -90,
      dy: 0
    }));
    expect(mockNative.discard).toHaveBeenCalledTimes(1);
    await act(async () => mic().props.onPanResponderRelease());
    expect(mockNative.discard).toHaveBeenCalledTimes(2);
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });
  test('both trim handles affect the actual send and a failed send retains a stable export', async () => {
    mockSnapshot = {
      recording: false,
      durationMs: 4000,
      amplitude: 0,
      hasDraft: true
    };
    props.onSend.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render();
    await act(async () => tree.root.findAllByProps({
      testID: 'help-voice-wave'
    })[0].props.onLayout({
      nativeEvent: {
        layout: {
          width: 200
        }
      }
    }));
    for (const [label, dx] of [['Начало обрезки', 50], ['Конец обрезки', -50]] as const) {
      const h = tree.root.findAll(n => n.props.accessibilityLabel === label)[0];
      await act(async () => {
        h.props.onPanResponderGrant();
        h.props.onPanResponderMove(null, {
          dx
        });
        h.props.onPanResponderRelease();
      });
    }
    await act(async () => button('Отправить запись').props.onPress());
    expect(mockNative.exportAudio).toHaveBeenLastCalledWith('qa:voice', 1000, 3000);
    expect(mockNative.discard).not.toHaveBeenCalled();
    await act(async () => appChange('background'));
    expect(button('Прослушать выбранный фрагмент')).toBeDefined();
    await act(async () => button('Отправить запись').props.onPress());
    expect(mockNative.exportAudio).toHaveBeenCalledTimes(1);
    expect(props.onSend.mock.calls[0][0].uri).toBe(props.onSend.mock.calls[1][0].uri);
  });
  test('release after the limit or loss of screen focus cannot auto-send a paused recording',async()=>{
    await render();const control=mic();await act(async()=>control.props.onPanResponderGrant());
    mockSnapshot={recording:false,durationMs:60000,amplitude:0,hasDraft:true};await tick(60000);
    await act(async()=>control.props.onPanResponderRelease());expect(props.onSend).not.toHaveBeenCalled();
    await act(async()=>button('Удалить запись').props.onPress());
    await act(async()=>mic().props.onPanResponderGrant());await tick(2000);
    props={...props,screenActive:false};await act(async()=>tree.update(React.createElement(HelpVoiceRecorder,props)));
    await act(async()=>mic().props.onPanResponderRelease());expect(props.onSend).not.toHaveBeenCalled();expect(button('Продолжить запись')).toBeDefined();
  });
  test('granting the system permission requires a fresh hold', async () => {
    mockPermission.mockResolvedValueOnce({ granted: false }).mockResolvedValueOnce({ granted: true });
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(props.onActive).toHaveBeenLastCalledWith(false);
    await act(async () => mic().props.onPanResponderGrant());
    expect(mockNative.start).toHaveBeenCalledTimes(1);
  });
  test('left cancel never flashes paused trim controls while native discard completes', async () => {
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    await tick(1400);
    let finishDiscard!: () => void;
    mockNative.discard.mockImplementationOnce(() => new Promise<void>(resolve => { finishDiscard = resolve; }));
    await act(async () => mic().props.onPanResponderMove(null, { dx: -90, dy: 0 }));
    await act(async () => mic().props.onPanResponderRelease());
    expect(tree.root.findAllByProps({ testID: 'help-voice-paused' })).toHaveLength(0);
    expect(button('Продолжить запись')).toBeUndefined();
    await act(async () => finishDiscard());
    expect(props.onActive).toHaveBeenLastCalledWith(false);
    expect(props.onSend).not.toHaveBeenCalled();
  });
  test('permission denial returns to idle and never starts the microphone', async () => {
    mockPermission.mockResolvedValue({
      granted: false
    });
    await render();
    await act(async () => mic().props.onPanResponderGrant());
    expect(mockNative.start).not.toHaveBeenCalled();
    expect(props.onActive).toHaveBeenLastCalledWith(false);
    expect(props.error).toHaveBeenCalled();
    expect(helpHaptic).not.toHaveBeenCalled();
  });
  test('sound samples drive the centre of the live wave and silence does not invent speech',async()=>{
    await render();await lock();
    await act(async()=>tree.root.findAllByProps({testID:'help-voice-wave'})[0].props.onLayout({nativeEvent:{layout:{width:150}}}));
    mockSnapshot={...mockSnapshot,amplitude:.05};await tick(1000);
    const bars=tree.root.findAll(n=>typeof n.props.testID==='string'&&/^help-voice-live-bar-/.test(n.props.testID)&&typeof n.type!=='string');
    const scale=(index:number)=>StyleSheet.flatten(bars[index].props.style).transform[0].scaleY;
    expect(bars.length).toBe(25);
    expect(scale(12)).toBeGreaterThan(.5);
    expect(StyleSheet.flatten(bars[12].props.style).opacity).toBe(1);
    expect(scale(0)).toBeLessThan(.1);
    expect(scale(11)).toBe(scale(13));
    mockSnapshot={...mockSnapshot,amplitude:0};
    for(let sample=0;sample<16;sample++)await tick(1080+sample*80);
    expect(scale(12)).toBeLessThan(.1);
    expect(StyleSheet.flatten(bars[12].props.style).opacity).toBe(0);
    await act(async()=>button('Приостановить запись').props.onPress());
    expect(tree.root.findAllByProps({testID:'help-voice-trim-wave'}).length).toBeGreaterThan(0);
  });
  test('voice haptics acknowledge successful explicit transitions, not polling, restore or background pause',async()=>{
    await render();expect(helpHaptic).not.toHaveBeenCalled();
    await lock();expect(helpHaptic.mock.calls.map((row:any[])=>row[0])).toEqual(['recordStart','recordLock']);
    await tick(2000);await tick(2080);
    expect(helpHaptic).toHaveBeenCalledTimes(2);
    await act(async()=>button('Приостановить запись').props.onPress());
    expect(helpHaptic).toHaveBeenLastCalledWith('recordPause');
    await act(async()=>button('Продолжить запись').props.onPress());
    expect(helpHaptic).toHaveBeenLastCalledWith('recordResume');
    await act(async()=>appChange('background'));
    expect(helpHaptic).toHaveBeenCalledTimes(4);
    await act(async()=>appChange('active'));
    await act(async()=>button('Удалить запись').props.onPress());
    expect(helpHaptic).toHaveBeenLastCalledWith('recordCancel');
    expect(helpHaptic).not.toHaveBeenCalledWith('send');
  });
  test('restoring a saved native recording does not produce startup or locking haptics',async()=>{
    mockSnapshot={recording:true,durationMs:2000,amplitude:0,hasDraft:true};
    await render();expect(button('Приостановить запись')).toBeDefined();
    await tick(2080);expect(helpHaptic).not.toHaveBeenCalled();
  });
  test('failed recorder operations never acknowledge a transition with a vibration',async()=>{
    await render();mockNative.start.mockRejectedValueOnce(new Error('native start failed'));
    await act(async()=>mic().props.onPanResponderGrant());expect(helpHaptic).not.toHaveBeenCalled();
    await lock();helpHaptic.mockClear();
    mockNative.pause.mockRejectedValueOnce(new Error('native pause failed'));
    await act(async()=>button('Приостановить запись').props.onPress());
    expect(helpHaptic).not.toHaveBeenCalled();
    mockNative.discard.mockRejectedValueOnce(new Error('native discard failed'));
    await act(async()=>button('Отменить запись').props.onPress());
    expect(helpHaptic).not.toHaveBeenCalled();
  });
});
