import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { FilterLookupPickerPanel } from '../src/features/clientOrders/screen/mobile/FilterLookupPickerPanel';
jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return { View: host('View'), Pressable: host('Pressable'), ScrollView: host('ScrollView'), StyleSheet: { create: (s: any) => s, absoluteFill: {} } };
});
it('shows flat groups with mixed state, searches group names and selects every member even under a search', async () => {
  const members = [{ guid: 'main', name: 'Основной' }, { guid: 'processing', name: 'Переработка' }];
  const other = { guid: 'nsk', name: 'Новосибирск' };
  const onSelectGroup = jest.fn();
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(React.createElement(FilterLookupPickerPanel, {
    title: 'Склады', icon: 'warehouse', topInset: 0, bottomInset: 0, placeholder: 'Склад или группа', flat: true,
    localItems: [...members, other], groups: [{ key: 'omsk', name: 'Омск', items: members }, { key: 'nsk', name: 'Новосибирск', items: [other] }],
    selectedGuids: ['main'], onSelectGroup, onSelect: jest.fn(), onApply: jest.fn(), onReset: jest.fn(), onClose: jest.fn(),
  })); });
  const groups = () => view.root.findAllByType('Pressable' as any).filter(n => n.props.accessibilityLabel?.startsWith('Группа '));
  expect(groups()).toHaveLength(2);
  expect(groups()[0].props.accessibilityState.checked).toBe('mixed');
  expect(groups()[0].props['aria-checked']).toBe('mixed');
  await act(async () => view.root.findByType('Searchbar' as any).props.onChangeText('омск'));
  expect(groups()).toHaveLength(1);
  expect(view.root.findAllByType('Pressable' as any).filter(n => n.props.accessibilityRole === 'checkbox')).toHaveLength(3);
  await act(async () => view.root.findByType('Searchbar' as any).props.onChangeText('переработка'));
  expect(groups()).toHaveLength(1);
  act(() => groups()[0].props.onPress());
  expect(onSelectGroup).toHaveBeenCalledWith(members);
  act(() => view.unmount());
});
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return { Surface: host('Surface'), Text: host('Text'), Button: host('Button'), Searchbar: host('Searchbar'), ActivityIndicator: host('ActivityIndicator') };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: (p: any) => require('react').createElement('Icon', p) }));
jest.mock('../src/features/clientOrders/lib/clientOrdersUi', () => ({ getPickerItemMeta: () => '' }));
it('reuses the order selector with checkboxes, search, reset and explicit apply; selecting never closes it', async () => {
  const onSelect = jest.fn(), onApply = jest.fn(), onReset = jest.fn(), onClose = jest.fn();
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(React.createElement(FilterLookupPickerPanel, {
    title: 'Склады', icon: 'warehouse', topInset: 0, bottomInset: 0, placeholder: 'Название склада',
    localItems: [{ guid: '', name: 'Все' }, { guid: 'omsk', name: 'Омск' }, { guid: 'nsk', name: 'Новосибирск' }],
    selectedGuids: ['omsk'], onSelect, onApply, onReset, onClose,
  })); });
  const rows = () => view.root.findAllByType('Pressable' as any).filter(n => n.props.accessibilityRole === 'checkbox');
  expect(rows()).toHaveLength(3);
  expect(rows()[1].props.accessibilityState.checked).toBe(true);
  act(() => rows()[2].props.onPress());
  expect(onSelect).toHaveBeenCalledWith({ guid: 'nsk', name: 'Новосибирск' }); expect(onClose).not.toHaveBeenCalled(); expect(onApply).not.toHaveBeenCalled();
  await act(async () => view.root.findByType('Searchbar' as any).props.onChangeText('ново'));
  expect(rows()).toHaveLength(1);
  const buttons = view.root.findAllByType('Button' as any);
  act(() => buttons[0].props.onPress()); expect(onReset).toHaveBeenCalledTimes(1);
  act(() => buttons[1].props.onPress()); expect(onApply).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
});
