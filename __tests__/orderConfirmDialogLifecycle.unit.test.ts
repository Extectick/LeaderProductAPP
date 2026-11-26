import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockClose = jest.fn();
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
  Extrapolation: { CLAMP: 'clamp' }, interpolate: jest.fn(), useAnimatedStyle: () => ({}),
}));
jest.mock('react-native-paper', () => ({ Text: 'Text', Portal: 'PaperPortal', Modal: 'PaperModal',
  Surface: 'Surface', Divider: 'Divider', IconButton: 'IconButton', Button: 'PaperButton',
  useTheme: () => ({ animation: { scale: 1 } }),
  Dialog: Object.assign((props: any) => require('react').createElement('Dialog', props), { Content: 'DialogContent' }),
}));
jest.mock('@gorhom/bottom-sheet', () => ({}));
import { ConfirmDialog } from '../src/features/clientOrders/screen/mobile/ClientOrdersMobileUi';

describe('order confirmation dialog lifecycle', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.useRealTimers(); });
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
