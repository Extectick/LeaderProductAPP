import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { SearchPickerScreen } from '../src/features/clientOrders/screen/mobile/SearchPickerScreen';

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(
    name,
    props,
    typeof children === 'function' ? children({ pressed: false }) : children
  );
  return {
    FlatList: host('FlatList'),
    Keyboard: { dismiss: jest.fn() },
    Platform: { OS: 'android' },
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {
      absoluteFillObject: {},
      create: (styles: any) => styles,
    },
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
    View: host('View'),
  };
});

jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return {
    Searchbar: host('Searchbar'),
    Surface: host('Surface'),
    Text: host('Text'),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    MaterialCommunityIcons: (props: any) => React.createElement('MaterialCommunityIcons', props),
  };
});

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const FlashList = ({ children, ...props }: any) => React.createElement('FlashList', props, children);
  return { FlashList };
});

describe('SearchPickerScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    require('react-native').Platform.OS = 'android';
    jest.useRealTimers();
  });

  function renderSearch(search: string, pickerKey = 'product', searchInputProps = {}) {
    const onSearchChange = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SearchPickerScreen, {
        visible: true, pickerKey, topInset: 0, title: 'Подбор товаров', titleIcon: 'cube-outline',
        onClose: jest.fn(), search, onSearchChange, searchInputProps,
        data: [], renderItem: () => null, keyExtractor: () => '',
      }));
    });
    return { renderer, onSearchChange, input: () => renderer.root.findByType('Searchbar' as any) };
  }

  it('selects the entire current product query on focus and repeated taps without searching', () => {
    const onFocus = jest.fn();
    const onPressOut = jest.fn();
    const { renderer, input, onSearchChange } = renderSearch('угорь', 'product', { onFocus, onPressOut });
    expect(input().props.selectTextOnFocus).toBe(true);
    const event = { nativeEvent: {} };
    act(() => input().props.onFocus(event));
    expect(input().props.selection).toEqual({ start: 0, end: 5 });
    expect(onFocus).toHaveBeenCalledWith(event);
    const previousSelection = input().props.selection;
    act(() => input().props.onPressOut(event));
    expect(input().props.selection).toEqual({ start: 0, end: 5 });
    expect(input().props.selection).not.toBe(previousSelection);
    expect(onPressOut).toHaveBeenCalledWith(event);
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => input().props.onChangeText('сыр'));
    expect(input().props.selection).toBeUndefined();
    expect(input().props.value).toBe('сыр');
    act(() => input().props.onPressOut(event));
    expect(input().props.selection).toEqual({ start: 0, end: 3 });
    expect(onSearchChange).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(280));
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('сыр');
    act(() => renderer.unmount());
  });

  it('releases selection on blur and clear, and leaves empty searches alone', () => {
    const onBlur = jest.fn();
    const { renderer, input, onSearchChange } = renderSearch('угорь', 'product', { onBlur });
    act(() => input().props.onFocus({}));
    act(() => input().props.onBlur({}));
    expect(input().props.selection).toBeUndefined();
    expect(onBlur).toHaveBeenCalledTimes(1);
    act(() => input().props.onPressOut({}));
    act(() => input().props.onClearIconPress());
    expect(input().props.selection).toBeUndefined();
    expect(input().props.value).toBe('');
    expect(onSearchChange).toHaveBeenCalledWith('');
    act(() => input().props.onPressOut({}));
    expect(input().props.selection).toBeUndefined();
    act(() => renderer.unmount());
  });

  it('supports clicking an already-focused product search on web', () => {
    require('react-native').Platform.OS = 'web';
    const { renderer, input } = renderSearch('угорь');
    act(() => input().props.onClick());
    expect(input().props.selection).toEqual({ start: 0, end: 5 });
    act(() => input().props.onChangeText('лосось'));
    expect(input().props.selection).toBeUndefined();
    act(() => input().props.onClick());
    expect(input().props.selection).toEqual({ start: 0, end: 6 });
    act(() => renderer.unmount());
  });

  it('preserves the existing selection behavior in other reference pickers', () => {
    const onFocus = jest.fn();
    const { renderer, input } = renderSearch('Клиент', 'counterparty', { onFocus });
    expect(input().props.selectTextOnFocus).toBeUndefined();
    expect(input().props.onPressOut).toBeUndefined();
    expect(input().props.onFocus).toBe(onFocus);
    act(() => renderer.unmount());
  });

  it('updates the native field immediately and debounces only the search request', () => {
    const onSearchChange = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(React.createElement(SearchPickerScreen<{ guid: string }>, {
        visible: true,
        pickerKey: 'product',
        topInset: 0,
        title: 'Подбор товаров',
        titleIcon: 'cube-outline',
        onClose: jest.fn(),
        search: '',
        onSearchChange,
        data: [],
        renderItem: () => null,
        keyExtractor: (item) => item.guid,
      }));
    });

    const searchbar = renderer!.root.findByType('Searchbar' as any);
    expect(searchbar.props.style).toMatchObject({ height: 42, minHeight: 42, maxHeight: 42 });
    expect(searchbar.props.inputStyle).toMatchObject({
      height: 40,
      minHeight: 0,
      paddingVertical: 0,
      marginVertical: 0,
      fontSize: 17,
      includeFontPadding: false,
    });
    act(() => searchbar.props.onChangeText('сыр'));

    expect(renderer!.root.findByType('Searchbar' as any).props.value).toBe('сыр');
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(279));
    expect(onSearchChange).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('сыр');

    act(() => renderer!.unmount());
  });

  it('renders compact filters inside a horizontal scroll container', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SearchPickerScreen<{ guid: string }>, {
        visible: true,
        pickerKey: 'counterparty',
        topInset: 0,
        title: 'Контрагент',
        titleIcon: 'account-outline',
        onClose: jest.fn(),
        search: '',
        onSearchChange: jest.fn(),
        filters: [{
          key: 'my-clients',
          label: 'Мои клиенты',
          selected: true,
          onPress: jest.fn(),
        }],
        data: [],
        renderItem: () => null,
        keyExtractor: (item) => item.guid,
      }));
    });

    const scroll = renderer!.root.findByType('ScrollView' as any);
    expect(scroll.props.horizontal).toBe(true);
    expect(renderer!.root.findAllByType('Text' as any).some((node) => node.props.children === 'Мои клиенты')).toBe(true);

    act(() => renderer!.unmount());
  });

  it('dismisses the keyboard when the picker closes', () => {
    const onClose = jest.fn();
    const keyboard = require('react-native').Keyboard;
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(React.createElement(SearchPickerScreen<{ guid: string }>, {
        visible: true,
        pickerKey: 'counterparty',
        topInset: 0,
        title: 'Контрагент',
        titleIcon: 'account-outline',
        onClose,
        search: '',
        onSearchChange: jest.fn(),
        data: [],
        renderItem: () => null,
        keyExtractor: (item) => item.guid,
      }));
    });

    const closeButton = renderer!.root
      .findAllByType('Pressable' as any)
      .find((node) => node.props.accessibilityRole === 'button');
    act(() => closeButton!.props.onPress());

    expect(keyboard.dismiss).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => renderer!.unmount());
  });

  it('keeps both product filters icon-only and the same size as the close button', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    const toggle = jest.fn();
    act(() => {
      renderer = TestRenderer.create(React.createElement(SearchPickerScreen, {
        visible: true, pickerKey: 'product', topInset: 0, title: 'Подбор товаров', titleIcon: 'cube-outline',
        onClose: jest.fn(), search: '', onSearchChange: jest.fn(), data: [], renderItem: () => null,
        keyExtractor: () => '', filters: [
          { key: 'stock', label: 'С остатками', selected: true, iconOnly: true, onPress: toggle },
          { key: 'history', label: 'Клиент уже брал', selected: false, iconOnly: true, onPress: toggle, icon: 'history' },
        ],
      }));
    });
    const buttons = renderer!.root.findAllByType('Pressable' as any);
    const filters = buttons.filter(node => node.props.accessibilityRole === 'checkbox');
    expect(filters).toHaveLength(2);
    const flatten = (style: any[]) => Object.assign({}, ...style.filter(Boolean));
    for (const filter of filters) {
      expect(flatten(filter.props.style({ pressed: false }))).toMatchObject({ width: 40, height: 40 });
      expect(filter.findByType('MaterialCommunityIcons' as any).props.size).toBe(22);
      expect(filter.findAllByType('Text' as any)).toHaveLength(0);
    }
    act(() => filters[1].props.onPress());
    expect(toggle).toHaveBeenCalledTimes(1);
    act(() => renderer!.unmount());
  });
});
