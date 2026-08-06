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

describe('SearchPickerScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
});
