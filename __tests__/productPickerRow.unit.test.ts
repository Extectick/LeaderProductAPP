import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ProductPickerRow } from '../src/features/clientOrders/screen/mobile/ProductPickerRow';
import { ProductPickerQuantityControl } from '../src/features/clientOrders/screen/mobile/ProductPickerQuantityControl';
import { applyProductPickerQuantity, productPickerQuantity, type ProductQuantityChange } from '../src/features/clientOrders/lib/productPickerQuantity';
import { buildNewItem } from '../src/features/clientOrders/lib/clientOrdersShared';

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  const TextInput = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ blur: () => props.onBlur?.() }));
    return React.createElement('TextInput', props);
  });
  return { Pressable: host('Pressable'), View: host('View'), TextInput, StyleSheet: { create: (s: any) => s } };
});
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return { Text: host('Text'), Tooltip: host('Tooltip'), IconButton: host('IconButton') };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: (props: any) => require('react').createElement('Icon', props) }));

const item = { guid: 'p', name: 'Угорь', code: 'УТ-123', packages: [], isWeight: true,
  baseUnit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' }, receiptPrice: 1290, basePrice: 1650 };
const renderThumbnail = jest.fn(() => React.createElement('Thumbnail' as any));
const noOp = () => {};
const rowProps = { item, quantity: 0, unit: 'кг', fractional: true, renderThumbnail,
  hasPriceType: true, hasWarehouse: true, onChangeQuantity: noOp, onOpen: noOp, onLongPress: noOp };
const button = (view: TestRenderer.ReactTestRenderer, icon: string) => view.root.findAllByType('IconButton' as any).find(node => node.props.icon === icon)!;
const input = (view: TestRenderer.ReactTestRenderer) => view.root.findByType('TextInput' as any);

describe('compact product picker controls', () => {
  it('keeps the photo left, tightens spacing and reuses the thumbnail during quantity updates', () => {
    renderThumbnail.mockClear();
    let view!: TestRenderer.ReactTestRenderer;
    act(() => { view = TestRenderer.create(React.createElement(ProductPickerRow, rowProps)); });
    const row = view.toJSON() as TestRenderer.ReactTestRendererJSON;
    const [thumbnail, content] = row.children as TestRenderer.ReactTestRendererJSON[];
    expect(row.props.style[0]).toMatchObject({ flexDirection: 'row', alignItems: 'stretch', paddingVertical: 4 });
    expect(thumbnail.props.style).toMatchObject({ width: 80, flexShrink: 0 });
    expect(content.props.style).toMatchObject({ flex: 1, minWidth: 0 });
    const details = content.children![1] as TestRenderer.ReactTestRendererJSON;
    expect(details.props.style).toMatchObject({ alignSelf: 'stretch' });
    expect(details.children).toHaveLength(2);
    for (const line of details.children as TestRenderer.ReactTestRendererJSON[]) {
      expect(line.props.style).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between' });
    }
    const text = view.root.findAllByType('Text' as any).map(node => node.props.children).join(' ');
    expect(text).not.toMatch(/Себест|УТ-123|Уже в заказе/);
    expect(text.replace(/\s/g, '')).toContain('1290₽');
    const plusStyle = button(view, 'plus').props.style;
    expect(button(view, 'plus').props.size).toBe(17);
    expect(view.root.findAllByType('IconButton' as any)).toHaveLength(1);
    act(() => view.update(React.createElement(ProductPickerRow, { ...rowProps, quantity: 3 })));
    expect(button(view, 'plus').props.style).toBe(plusStyle);
    expect(button(view, 'plus').props.size).toBe(17);
    expect(renderThumbnail).toHaveBeenCalledTimes(1);
    expect(input(view).props.selectTextOnFocus).toBe(true);
    const counter = view.root.findAllByType('View' as any).find(node => node.props.testID === 'product-counter-p')!;
    expect(counter.props.style).toMatchObject({ flexDirection: 'row', minHeight: 36 });
    act(() => view.unmount());
  });

  it('overlays the compact purchase age on the photo, including today, and hides invalid or missing history', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 13, 12));
    let view!: TestRenderer.ReactTestRenderer;
    try {
      act(() => { view = TestRenderer.create(React.createElement(ProductPickerRow, {
        ...rowProps, item: { ...item, lastPurchasedDate: '2026-09-24' },
      })); });
      const photo = () => view.root.findAllByType('View' as any).find(node => node.props.testID === 'product-thumbnail-p')!;
      const badge = () => photo().findAllByType('View' as any).find(node => node.props.testID === 'product-history-p')!;
      expect(badge().props.style).toMatchObject({ position: 'absolute', top: 0, left: 0 });
      expect(badge().props.pointerEvents).toBe('none');
      expect(badge().props.accessibilityLabel).toBe('Брал 19 дн. назад');
      expect(badge().findByType('Text' as any).props.children.join('')).toBe('19 дн.');
      expect(view.root.findAllByType('Text' as any).map(node => node.props.children).join(' ')).not.toMatch(/Брал|назад/);
      act(() => view.update(React.createElement(ProductPickerRow, { ...rowProps, item: { ...item, lastPurchasedDate: '2026-10-13' } })));
      expect(badge().findByType('Text' as any).props.children.join('')).toBe('0 дн.');
      expect(badge().props.accessibilityLabel).toBe('Брал сегодня');
      for (const lastPurchasedDate of [undefined, '2026-10-14', '2026-02-30']) {
        act(() => view.update(React.createElement(ProductPickerRow, { ...rowProps, item: { ...item, lastPurchasedDate } })));
        expect(badge()).toBeUndefined();
      }
    } finally {
      act(() => view?.unmount());
      jest.useRealTimers();
    }
  });

  function Harness({ initial = 3, blocked = () => false, blocker, disabled = false, fractional = true }: {
    initial?: number; blocked?: () => boolean; blocker?: Promise<void>; disabled?: boolean; fractional?: boolean;
  }) {
    const [items, setItems] = React.useState(() => initial ? [buildNewItem(item, { quantity: initial })] : []);
    const quantity = productPickerQuantity(items, item).quantity;
    const onChangeQuantity = (_: any, change: ProductQuantityChange) => setItems(current => applyProductPickerQuantity(current, item, change));
    function Document() {
      if (blocked() && quantity !== initial) throw blocker;
      return React.createElement('Document' as any, { quantity });
    }
    return React.createElement(React.Fragment, null,
      React.createElement(ProductPickerQuantityControl, { item, quantity, unit: 'кг', fractional, disabled, onChangeQuantity }),
      React.createElement(React.Suspense, { fallback: null }, React.createElement(Document)));
  }

  it('changes the visible counter before the slow document commits and retains every rapid tap', async () => {
    let release!: () => void;
    const blocker = new Promise<void>(resolve => { release = resolve; });
    let block = false;
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => { view = TestRenderer.create(React.createElement(Harness, { initial: 0, blocked: () => block, blocker })); });
    block = true;
    await act(async () => { button(view, 'plus').props.onPress(); });
    expect(input(view).props.value).toBe('1');
    expect(view.root.findByType('Document' as any).props.quantity).toBe(0);
    await act(async () => { for (let i = 0; i < 5; i++) button(view, 'plus').props.onPress(); });
    expect(input(view).props.value).toBe('6');
    await act(async () => { for (let i = 0; i < 2; i++) button(view, 'minus').props.onPress(); });
    expect(input(view).props.value).toBe('4');
    block = false;
    await act(async () => { release(); await blocker; });
    expect(input(view).props.value).toBe('4');
    expect(view.root.findByType('Document' as any).props.quantity).toBe(4);
    act(() => view.unmount());
  });

  it('edits inline with a comma, rejects invalid values and removes only after clearing and blurring', async () => {
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => { view = TestRenderer.create(React.createElement(Harness)); });
    act(() => input(view).props.onFocus());
    await act(async () => input(view).props.onChangeText('2,375'));
    expect(input(view).props.value).toBe('2,375');
    expect(view.root.findByType('Document' as any).props.quantity).toBe(2.375);
    await act(async () => input(view).props.onChangeText('-10'));
    expect(view.root.findByType('Document' as any).props.quantity).toBe(2.375);
    act(() => input(view).props.onBlur());
    expect(input(view).props.value).toBe('2,375');
    act(() => input(view).props.onFocus());
    act(() => input(view).props.onChangeText(''));
    expect(view.root.findByType('Document' as any).props.quantity).toBe(2.375);
    await act(async () => input(view).props.onBlur());
    expect(view.root.findAllByType('TextInput' as any)).toHaveLength(0);
    expect(view.root.findAllByType('IconButton' as any)).toHaveLength(1);
    expect(view.root.findByType('Document' as any).props.quantity).toBe(0);
    act(() => view.unmount());
  });

  it('does not replay a cleared or stale input on native blur after a step', async () => {
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => { view = TestRenderer.create(React.createElement(Harness)); });
    act(() => input(view).props.onFocus());
    act(() => input(view).props.onChangeText(''));
    await act(async () => button(view, 'plus').props.onPress());
    expect(view.root.findByType('Document' as any).props.quantity).toBe(1);
    expect(input(view).props.value).toBe('1');
    await act(async () => button(view, 'minus').props.onPress());
    expect(view.root.findAllByType('TextInput' as any)).toHaveLength(0);
    act(() => view.unmount());
  });

  it('blocks edits when locked and rejects fractions for piece quantities', async () => {
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => { view = TestRenderer.create(React.createElement(Harness, { disabled: true })); });
    expect(input(view).props.editable).toBe(false);
    expect(button(view, 'plus').props.disabled).toBe(true);
    await act(async () => button(view, 'plus').props.onPress());
    expect(view.root.findByType('Document' as any).props.quantity).toBe(3);
    await act(async () => view.update(React.createElement(Harness, { fractional: false })));
    expect(input(view).props.keyboardType).toBe('number-pad');
    act(() => input(view).props.onFocus());
    await act(async () => input(view).props.onChangeText('1,5'));
    expect(view.root.findByType('Document' as any).props.quantity).toBe(3);
    act(() => view.unmount());
  });
});
