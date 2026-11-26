import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
const mockClose = jest.fn();
const mockCapture = jest.fn();
let mockModalProps: any;
jest.mock('@/src/shared/monitoring', () => ({
  captureException: (...args: any[]) => mockCapture(...args), addMonitoringBreadcrumb: jest.fn(),
}));
jest.mock('../src/features/clientOrders/lib/clientOrdersUi', () => ({ packageLabel: jest.fn(), unitLabel: jest.fn() }));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Animated: {}, PanResponder: {},
  Keyboard: { dismiss: jest.fn() }, Platform: { OS: 'android' },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  StyleSheet: { create: (v: any) => v, absoluteFill: {} },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'AnimatedView' },
  Extrapolation: { CLAMP: 'clamp' }, interpolate: jest.fn(), useAnimatedStyle: () => ({}), useAnimatedProps: (worklet: () => unknown) => worklet(),
}));
jest.mock('react-native-paper', () => ({ Text: 'Text', Portal: 'PaperPortal', Modal: 'PaperModal',
  Surface: 'Surface', Divider: 'Divider', IconButton: 'IconButton', Button: 'PaperButton',
  useTheme: () => ({ animation: { scale: 1 } }),
  Dialog: Object.assign((props: any) => require('react').createElement('Dialog', props), { Content: 'DialogContent' }),
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return { BottomSheetModal: React.forwardRef((props: any, ref: any) => {
    mockModalProps = props;
    React.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
    return React.createElement('NativeModal', null, props.children);
  }) };
});

import { ConfirmDialog, PickerBottomSheet, SheetModal } from '../src/features/clientOrders/screen/mobile/ClientOrdersMobileUi';

describe('native picker sheet lifecycle', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  let setVisible: (v: boolean) => void;
  async function mount() {
    function Harness() {
      const [visible, update] = React.useState(true);
      setVisible = update;
      return React.createElement(PickerBottomSheet, {
        visible, topOffset: 80, title: 'Position',
        onClose: () => { if (mockClose() === false) return false; update(false); },
        headerContent: close => React.createElement('Close' as any, { onPress: close }),
        children: React.createElement('Content' as any),
      });
    }
    await act(async () => { renderer = TestRenderer.create(React.createElement(Harness)); });
    await act(async () => { await jest.advanceTimersByTimeAsync(20); });
  }
  async function close() {
    await act(async () => { renderer.root.findByType('Close' as any).props.onPress(); });
  }
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockClose.mockReset(); });
  afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.useRealTimers(); });

  it('passes touches and accessibility through a closed backdrop, including during a delayed modal unmount', async () => {
    await mount();
    const index = { value: -1 };
    let backdrop!: TestRenderer.ReactTestRenderer;
    const render = () => mockModalProps.backdropComponent({ animatedIndex: index });
    await act(async () => { backdrop = TestRenderer.create(render()); });
    const interaction = () => backdrop.root.findByType('AnimatedView' as any).props.animatedProps;
    try {
      expect(interaction()).toMatchObject({ pointerEvents: 'none', importantForAccessibility: 'no-hide-descendants' });
      index.value = 0;
      await act(async () => backdrop.update(render()));
      expect(interaction()).toMatchObject({ pointerEvents: 'auto', accessibilityElementsHidden: false });
      mockClose.mockReturnValueOnce(false);
      const press = () => backdrop.root.findByProps({ accessibilityLabel: 'Закрыть панель' }).props.onPress();
      await act(async () => press());
      expect(mockDismiss).not.toHaveBeenCalled();
      await act(async () => press());
      await act(async () => backdrop.update(render()));
      expect(mockClose).toHaveBeenCalledTimes(2);
      expect(interaction()).toMatchObject({ pointerEvents: 'none', accessibilityElementsHidden: true });
      expect(backdrop.root.findAllByProps({ accessibilityLabel: 'Закрыть панель' })).toHaveLength(0);
    } finally {
      await act(async () => backdrop.unmount());
    }
  });

  it('dismisses the mounted native modal instead of tearing it out during keyboard/portal cleanup', async () => {
    await mount();
    expect(mockPresent).toHaveBeenCalledTimes(1);
    await close();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('NativeModal' as any)).toHaveLength(1);
    await act(async () => mockModalProps.onDismiss());
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('allows retry after the edit-flush callback throws', async () => {
    mockClose.mockImplementationOnce(() => { throw new Error('edit flush failed'); });
    await mount();
    await close();
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockDismiss).not.toHaveBeenCalled();
    await close();
    expect(mockClose).toHaveBeenCalledTimes(2);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('honors a veto and does not poison subsequent close attempts', async () => {
    mockClose.mockReturnValueOnce(false);
    await mount(); await close();
    expect(mockDismiss).not.toHaveBeenCalled();
    await close();
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not let a previous dismissal close a rapidly reopened sheet', async () => {
    await mount();
    await act(async () => setVisible(false));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    await act(async () => setVisible(true));
    await act(async () => { await jest.advanceTimersByTimeAsync(20); });
    expect(mockPresent).toHaveBeenCalledTimes(1);
    await act(async () => mockModalProps.onDismiss());
    expect(mockPresent).toHaveBeenCalledTimes(2);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('uses actual native dismissal, not intermediate keyboard animation indices, to notify a swipe close', async () => {
    await mount();
    expect(mockModalProps.onAnimate).toBeUndefined();
    expect(mockModalProps.onChange).toBeUndefined();
    await act(async () => mockModalProps.onDismiss());
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('restores a swiped sheet if its close callback rejects dismissal', async () => {
    mockClose.mockReturnValueOnce(false);
    await mount();
    await act(async () => mockModalProps.onDismiss());
    expect(mockPresent).toHaveBeenCalledTimes(2);
    await close();
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it('never mounts an inactive inspector Paper portal while the draft keeps changing', async () => {
    const render = (visible: boolean, revision: number) => React.createElement(SheetModal, {
      visible, styles: {}, title: 'Inspector', onClose: mockClose,
      children: React.createElement('Revision' as any, { revision }),
    });
    await act(async () => { renderer = TestRenderer.create(render(false, 1)); });
    for (let revision = 2; revision < 60; revision++) {
      await act(async () => renderer.update(render(false, revision)));
    }
    expect(renderer.toJSON()).toBeNull();
    expect(renderer.root.findAllByType('PaperPortal' as any)).toHaveLength(0);
    await act(async () => renderer.update(render(true, 60)));
    expect(renderer.root.findAllByType('PaperPortal' as any)).toHaveLength(1);
    await act(async () => renderer.update(render(false, 61)));
    expect(renderer.toJSON()).toBeNull();
  });
  it('retains the closing confirmation for its animation, then releases its portal even after a rapid reopen', async () => {
    const onConfirm = jest.fn(async () => {});
    const dialog = { title: 'Отправка', confirmLabel: 'Да', onConfirm };
    const render = (state: typeof dialog | null) => React.createElement(ConfirmDialog, { state, onDismiss: mockClose, styles: {} });
    await act(async () => { renderer = TestRenderer.create(render(dialog)); });
    const confirm = renderer.root.findAllByType('PaperButton' as any).find(button => button.props.children === 'Да');
    await act(async () => confirm!.props.onPress());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
    await act(async () => renderer.update(render(null)));
    expect(renderer.root.findByType('Dialog' as any).props.visible).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(100); });
    await act(async () => renderer.update(render({ ...dialog, title: 'Повторная отправка' })));
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(renderer.root.findByType('Dialog' as any).props.visible).toBe(true);
    const cancel = renderer.root.findAllByType('PaperButton' as any).find(button => button.props.children === 'Отмена');
    await act(async () => cancel!.props.onPress());
    expect(mockClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => renderer.update(render(null)));
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(renderer.root.findAllByType('PaperPortal' as any)).toHaveLength(0);
  });

});
