import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OfflineDataBanner, OfflineProductDataNote } from '../src/features/clientOrders/screen/mobile/OfflineDataBanner';
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => (props: any) => React.createElement(name, props, props.children);
  return { Icon: host('Icon'), ProgressBar: host('ProgressBar'), Text: host('PaperText'), TouchableRipple: host('TouchableRipple') };
});
let screen: ReactTestRenderer;
const render = async (component: React.ReactElement) => { await act(async () => { screen = create(component); }); };
afterEach(async () => { await act(async () => { screen?.unmount(); }); });
const props = { ready: false, syncedAt: null, loading: false, progress: null, error: null, onRefresh: jest.fn() };

it('offers initial preparation as a compact full-width button', async () => {
  await render(React.createElement(OfflineDataBanner, props));
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.accessibilityLabel).toBe('Загрузить данные для офлайна');
  expect(button.props.style).toMatchObject({ alignSelf: 'stretch', borderRadius: 0 });
  button.props.onPress();
  expect(props.onRefresh).toHaveBeenCalled();
});
it('shows actual progress with no second spinner and disables repeated taps', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true, progress: 0.45 }));
  expect(screen.root.findByType('TouchableRipple' as any).props.disabled).toBe(true);
  expect(screen.root.findByType('ProgressBar' as any).props).toMatchObject({ progress: 0.45, indeterminate: false });
  expect(screen.root.findAllByType('PaperText' as any).some((text) => String(text.props.children).includes('45'))).toBe(true);
});
it('shows an indeterminate strip while obtaining the manifest', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true }));
  expect(screen.root.findByType('ProgressBar' as any).props.indeterminate).toBe(true);
});
it('keeps the date and refresh action after completion or a failed refresh', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, ready: true, syncedAt: '2026-09-10T10:00:00Z' }));
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityLabel).toContain('10.09.');
  expect(screen.root.findByType('TouchableRipple' as any).props.disabled).toBe(false);
  await act(async () => { screen.update(React.createElement(OfflineDataBanner, { ...props, ready: true, syncedAt: '2026-09-10T10:00:00Z', error: 'Нет сети' })); });
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityLabel).toContain('Не обновлено');
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityLabel).toContain('10.09.');
});
it('hides product freshness online and restores the compact note offline', async () => {
  await render(React.createElement(OfflineProductDataNote, { online: true, syncedAt: '2026-09-10T10:00:00Z' }));
  expect(screen.toJSON()).toBeNull();
  await act(async () => { screen.update(React.createElement(OfflineProductDataNote, { online: false, syncedAt: '2026-09-10T10:00:00Z' })); });
  const note = screen.root.findByType('PaperText' as any);
  expect(note.props.children).toContain('Цены и остатки обновлены');
  expect(note.props.style).toMatchObject({ fontSize: 11, paddingVertical: 3 });
});
it('does not invent a date when offline data has never been prepared', async () => {
  await render(React.createElement(OfflineProductDataNote, { online: false, syncedAt: null }));
  expect(screen.root.findByType('PaperText' as any).props.children).toContain('ещё не загружены');
});
