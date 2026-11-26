import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { OrderShareFeedback } from '../src/features/clientOrders/components/OrderShareFeedback';

const mockManager = { mount: jest.fn(() => 1), update: jest.fn(), unmount: jest.fn() };
jest.mock('react-native-paper', () => {
  const React = require('react');
  const Consumer = require('react-native-paper/lib/commonjs/components/Portal/PortalConsumer').default;
  return {
    Portal: ({ children }: { children: React.ReactNode }) => React.createElement(Consumer, { manager: mockManager }, children),
    Snackbar: 'Snackbar',
  };
});

it('keeps idle order edits out of the Paper portal and only publishes changed feedback', async () => {
  const dismiss = jest.fn();
  const tree = (message: string) => React.createElement(OrderShareFeedback, { message, onDismiss: dismiss });
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(tree('')); });
  try {
    for (let n = 0; n < 60; n++) await act(async () => view.update(tree('')));
    expect(mockManager.mount).not.toHaveBeenCalled();
    expect(mockManager.update).not.toHaveBeenCalled();
    await act(async () => view.update(tree('Копирую ссылку…')));
    expect(mockManager.mount).toHaveBeenCalledTimes(1);
    await act(async () => view.update(tree('Копирую ссылку…')));
    expect(mockManager.update).not.toHaveBeenCalled();
    await act(async () => view.update(tree('Ссылка скопирована')));
    expect(mockManager.update).toHaveBeenCalledTimes(1);
    const [, snackbar] = mockManager.update.mock.calls[0];
    expect(snackbar.props).toMatchObject({ children: 'Ссылка скопирована', visible: true, duration: 5000, onDismiss: dismiss });
    snackbar.props.action.onPress();
    expect(dismiss).toHaveBeenCalled();
    await act(async () => view.update(tree('')));
    expect(mockManager.unmount).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => view.unmount());
  }
});
