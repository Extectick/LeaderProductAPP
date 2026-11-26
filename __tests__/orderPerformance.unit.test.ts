import { AppState } from 'react-native';
import { measureOrderDraftRead, startOrderPerformance } from '../src/shared/monitoring/orderPerformance';
const mockSend = jest.fn();
jest.mock('../src/shared/monitoring/appErrorDelivery', () => ({ queueOrderTiming: (...args: unknown[]) => mockSend(...args) }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: jest.fn(() => ({remove: jest.fn()})) } }));

it('reports input wait, event-loop drift and draft reads once per metric, excluding inactive and cross-account work', async () => {
  jest.useFakeTimers();
  let tick = 1000;
  const monotonic = jest.spyOn(performance, 'now').mockImplementation(() => tick);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'PerformanceObserver');
  let notify!: (list: any) => void;
  class Observer {
    static supportedEntryTypes = ['event'];
    constructor(cb: typeof notify) { notify = cb; }
    observe() {} disconnect() {}
  }
  Object.defineProperty(globalThis, 'PerformanceObserver', {configurable:true, value:Observer});
  const stop = startOrderPerformance(100, () => 'line-editor')!;
  try {
    const slow = async () => { tick += 900; return 7; };
    expect(await measureOrderDraftRead('100','draft_read_changed', slow)).toBe(7);
    await measureOrderDraftRead('100','draft_read_changed', slow);
    await measureOrderDraftRead('99','draft_read_all', slow);
    notify({getEntries: () => [{name:'pointerdown',startTime:1500,processingStart:5100}]});
    jest.advanceTimersByTime(1000);
    expect(mockSend.mock.calls).toEqual([
      [100, 'line-editor', {metric:'draft_read_changed', durationMs:900}],
      [100, 'line-editor', {metric:'input_dispatch', durationMs:3600}],
      [100, 'line-editor', {metric:'js_event_loop', durationMs:1700}],
    ]);
    const change = jest.mocked(AppState.addEventListener).mock.calls[0][1];
    await measureOrderDraftRead('100','draft_read_all',async () => { change('background'); tick += 5000; });
    jest.advanceTimersByTime(7000);
    expect(mockSend).toHaveBeenCalledTimes(3);
  } finally {
    stop(); monotonic.mockRestore(); jest.useRealTimers();
    if (original) Object.defineProperty(globalThis,'PerformanceObserver',original);
    else Reflect.deleteProperty(globalThis,'PerformanceObserver');
  }
});
