import React from 'react';
import { StyleSheet } from 'react-native';
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
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ alignSelf: 'stretch', borderRadius: 0 });
  button.props.onPress();
  expect(props.onRefresh).toHaveBeenCalled();
});
it('shows actual progress with no second spinner and disables repeated taps', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true, progress: 0.45,
    transfer: { entity: 'selling-prices', updating: false, completed: 11, total: 12, itemsLoaded: 7000, itemsTotal: 7879 } }));
  expect(screen.root.findByType('TouchableRipple' as any).props.disabled).toBe(true);
  expect(screen.root.findByType('ProgressBar' as any).props).toMatchObject({ progress: 0.45, indeterminate: false });
  const texts = screen.root.findAllByType('PaperText' as any);
  expect(texts.map((text) => text.props.children.replace(/\s/g, ' '))).toEqual(['Загружаем цены', '7 000/7 879']);
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityLabel).toContain('элементы:');
  expect(texts.every((text) => text.props.numberOfLines === 1)).toBe(true);
  expect(screen.root.findByType('ProgressBar' as any).props.style.height).toBe(40);
});
it('shows an indeterminate strip while obtaining the manifest', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true }));
  expect(screen.root.findByType('ProgressBar' as any).props.indeterminate).toBe(true);
  expect(screen.root.findAllByType('PaperText' as any).map((text) => text.props.children)).toEqual(['Проверяем изменения']);
});
it('shows an unknown delta size honestly and keeps both texts in one line', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true, progress: 0.6,
    transfer: { entity: 'selling-prices', updating: true, completed: 10, total: 12, itemsLoaded: 1000, itemsTotal: null } }));
  const texts = screen.root.findAllByType('PaperText' as any);
  expect(texts.map((text) => text.props.children.replace(/\s/g, ' '))).toEqual(['Обновляем цены', '1 000/…']);
  expect(texts.every((text) => text.props.numberOfLines === 1)).toBe(true);
  expect(texts[1].props.style.flexShrink).toBe(0);
});
it('shows zero rows for an empty directory and no misleading directory counter while committing', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true, progress: 0.99,
    transfer: { entity: 'manager-stock', updating: true, completed: 11, total: 12, itemsLoaded: 0, itemsTotal: 0 } }));
  expect(screen.root.findAllByType('PaperText' as any)[1].props.children).toBe('0/0');
  await act(async () => { screen.update(React.createElement(OfflineDataBanner, { ...props, loading: true, progress: 0.99,
    transfer: { entity: null, updating: false, completed: 12, total: 12 } })); });
  expect(screen.root.findAllByType('PaperText' as any).map((text) => text.props.children)).toEqual(['Проверка завершена']);
});
it('keeps the date and refresh action after completion or a failed refresh', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, ready: true, syncedAt: '2026-09-10T10:00:00Z' }));
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityLabel).toContain('10.09.');
  expect(screen.root.findByType('TouchableRipple' as any).props.disabled).toBe(false);
  await act(async () => { screen.update(React.createElement(OfflineDataBanner, { ...props, ready: true, syncedAt: '2026-09-10T10:00:00Z', error: 'Нет сети' })); });
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityLabel).toBe('Не удалось загрузить данные');
  expect(screen.root.findByType('TouchableRipple' as any).props.accessibilityHint).toContain('10.09.');
  expect(screen.root.findByType('PaperText' as any).props.children).toBe('Не удалось загрузить данные');
  expect(screen.root.findByType('PaperText' as any).props.numberOfLines).toBe(1);
});
it.each([
  ['catalog', 'номенклатуру'], ['organizations', 'организации'], ['warehouses', 'склады'],
  ['counterparties', 'клиентов'], ['agreements', 'соглашения'], ['contracts', 'договоры'],
  ['delivery-addresses', 'адреса'], ['price-types', 'виды цен'], ['order-options', 'настройки заказов'],
  ['selling-prices', 'цены'], ['stock', 'остатки'], ['manager-stock', 'резервы'],
])('labels every directory with a one-line update message: %s', async (entity, name) => {
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true, progress: 0.5,
    transfer: { entity: entity as any, updating: true, completed: 6, total: 12 } }));
  const text = screen.root.findAllByType('PaperText' as any)[0];
  expect(text.props.children).toBe(`Обновляем ${name}`);
  expect(text.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail', maxFontSizeMultiplier: 1.2 });
  expect(StyleSheet.flatten(text.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
  expect(StyleSheet.flatten(screen.root.findByType('TouchableRipple' as any).props.style).overflow).toBe('hidden');
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

it('shows offline and the last sync date in the same compact strip', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, online: false, ready: true, syncedAt: '2026-09-10T10:00:00Z' }));
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.accessibilityLabel).toContain('Офлайн · Данные:');
  expect(button.props.accessibilityLabel).toContain('10.09.');
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityState.busy).toBe(false);
  expect(screen.root.findByType('Icon' as any).props.source).toBe('cloud-off-outline');
  expect(StyleSheet.flatten(screen.root.findByProps({ testID: 'orders-sync-strip' }).props.style)).toMatchObject({ borderRadius: 0, backgroundColor: '#F1F5F9' });
});

it('does not show a network error or an endless loader in known offline mode', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, online: false, loading: true, error: 'Нет связи с сервером' }));
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.accessibilityLabel).toBe('Офлайн · Данные не загружены');
  expect(button.props.accessibilityHint).not.toContain('Сохранённые данные доступны');
  expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
  expect(screen.root.findAllByType('ProgressBar' as any)).toHaveLength(0);
});

it('restores the update action after reconnection', async () => {
  await render(React.createElement(OfflineDataBanner, { ...props, online: false }));
  await act(async () => { screen.update(React.createElement(OfflineDataBanner, { ...props, online: true })); });
  const button = screen.root.findByType('TouchableRipple' as any);
  expect(button.props.disabled).toBe(false);
  expect(button.props.accessibilityLabel).toBe('Загрузить данные для офлайна');
  expect(screen.root.findAllByType('Icon' as any).map(icon => icon.props.source)).toEqual(['database-sync-outline', 'download']);
});

it('keeps sending outside the refresh touch target and the progress spans both actions', async () => {
  const send = jest.fn();
  const { TouchableRipple } = require('react-native-paper');
  await render(React.createElement(OfflineDataBanner, { ...props, loading: true,
    trailingAction: React.createElement(TouchableRipple, { testID: 'send', onPress: send }) }));
  const actions = screen.root.findAllByType('TouchableRipple' as any);
  expect(actions).toHaveLength(2);
  expect(actions[0].props.disabled).toBe(true);
  expect(actions[0].findAllByProps({ testID: 'send' })).toHaveLength(0);
  props.onRefresh.mockClear();
  actions[1].props.onPress();
  expect(send).toHaveBeenCalledTimes(1);
  expect(props.onRefresh).not.toHaveBeenCalled();
  expect(actions[0].findAllByType('ProgressBar' as any)).toHaveLength(0);
  expect(screen.root.findAllByType('ProgressBar' as any)).toHaveLength(1);
});
