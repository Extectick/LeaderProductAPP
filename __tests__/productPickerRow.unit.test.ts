import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ProductPickerRow } from '../src/features/clientOrders/screen/mobile/ProductPickerRow';
import { ProductPickerQuantityDialog } from '../src/features/clientOrders/screen/mobile/ProductPickerQuantityDialog';

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  return { Pressable: host('Pressable'), View: host('View'), StyleSheet: { create: (s: any) => s } };
});
jest.mock('react-native-paper', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: any) => React.createElement(name, props, children);
  const Dialog = Object.assign(host('Dialog'), { Title: host('Title'), Content: host('Content'), Actions: host('Actions') });
  return { Text: host('Text'), Tooltip: host('Tooltip'), IconButton: host('IconButton'), Button: host('Button'), TextInput: host('TextInput'), HelperText: host('HelperText'), Portal: host('Portal'), Dialog };
});
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: (props: any) => require('react').createElement('Icon', props) }));

describe('compact product picker controls', () => {
  it('keeps the thumbnail in a stretched left column outside the title and lower controls', () => {
    const item = { guid: 'p', name: 'Угорь', packages: [] };
    let view!: TestRenderer.ReactTestRenderer;
    act(() => { view = TestRenderer.create(React.createElement(ProductPickerRow, {
      item, quantity: 0, unit: 'кг', thumbnail: React.createElement('Thumbnail' as any),
      hasPriceType: true, hasWarehouse: true, onStep: jest.fn(), onOpen: jest.fn(),
      onLongPress: jest.fn(), onEditQuantity: jest.fn(),
    })); });
    const row = view.toJSON() as TestRenderer.ReactTestRendererJSON;
    const [thumbnail, content] = row.children as TestRenderer.ReactTestRendererJSON[];
    expect(row.props.style[0]).toMatchObject({ flexDirection: 'row', alignItems: 'stretch' });
    expect(thumbnail.props.testID).toBe('product-thumbnail-p');
    expect(thumbnail.props.style).toMatchObject({ width: 80, flexShrink: 0 });
    expect(content.props.style).toMatchObject({ flex: 1 });
    expect((content.children![0] as TestRenderer.ReactTestRendererJSON).type).toBe('Pressable');
    expect((content.children![1] as TestRenderer.ReactTestRendererJSON).props.style.flexDirection).toBe('row');
    act(() => view.unmount());
  });
  it('shows cost without a label or SKU and makes plus independent from opening the product', () => {
    const onStep = jest.fn(), onOpen = jest.fn(), onEditQuantity = jest.fn();
    const item = { guid: 'p', name: 'Угорь', code: 'УТ-123', packages: [], receiptPrice: 1290, basePrice: 1650 };
    let view!: TestRenderer.ReactTestRenderer;
    const props = { item, quantity: 0, unit: 'кг', thumbnail: null, hasPriceType: true, hasWarehouse: true, onStep, onOpen, onLongPress: jest.fn(), onEditQuantity };
    act(() => { view = TestRenderer.create(React.createElement(ProductPickerRow, props)); });
    const visibleText = view.root.findAllByType('Text' as any).map(node => node.props.children).join(' ');
    expect(visibleText).not.toMatch(/Себест|УТ-123|Уже в заказе/);
    expect(visibleText.replace(/\s/g, '')).toContain('1290₽');
    const buttons = view.root.findAllByType('IconButton' as any);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.icon).toBe('plus');
    const emptyPlusStyle = buttons[0].props.style;
    expect(buttons[0].props.size).toBe(17);
    expect(emptyPlusStyle).toMatchObject({ width: 32, height: 36, margin: 0 });
    expect(buttons[0].props.disabled).toBe(false);
    expect(view.root.findAllByType('Pressable' as any).some(node => node.props.testID === 'product-quantity-p')).toBe(false);
    act(() => buttons[0].props.onPress());
    expect(onStep).toHaveBeenCalledWith(item, 1);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => { view.update(React.createElement(ProductPickerRow, { ...props, quantity: 1 })); });
    expect(view.root.findAllByType('IconButton' as any).map(node => node.props.icon)).toEqual(['minus', 'plus']);
    const filledPlus = view.root.findAllByType('IconButton' as any)[1];
    expect(filledPlus.props.size).toBe(17);
    expect(filledPlus.props.style).toBe(emptyPlusStyle);
    act(() => view.root.findAllByType('IconButton' as any)[0].props.onPress());
    expect(onStep).toHaveBeenLastCalledWith(item, -1);
    const number = view.root.findAllByType('Pressable' as any).find(node => node.props.testID === 'product-quantity-p')!;
    act(() => number.props.onPress());
    expect(onEditQuantity).toHaveBeenCalledWith(item);
    act(() => { view.update(React.createElement(ProductPickerRow, { ...props, quantity: 0, disabled: true })); });
    const emptyButtons = view.root.findAllByType('IconButton' as any);
    expect(emptyButtons).toHaveLength(1);
    expect(emptyButtons[0].props.icon).toBe('plus');
    expect(emptyButtons[0].props.disabled).toBe(true);
    expect(view.root.findAllByType('Pressable' as any).some(node => node.props.testID === 'product-quantity-p')).toBe(false);
    act(() => view.unmount());
  });
  it('validates manual entry, cancels without changes, and commits only on confirmation', () => {
    const onConfirm = jest.fn(), onDismiss = jest.fn();
    let view!: TestRenderer.ReactTestRenderer;
    act(() => { view = TestRenderer.create(React.createElement(ProductPickerQuantityDialog, { name: 'Угорь', quantity: 3, unit: 'кг', fractional: true, onConfirm, onDismiss })); });
    const input = () => view.root.findByType('TextInput' as any);
    act(() => input().props.onChangeText('2,375'));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => input().props.onSubmitEditing());
    expect(onConfirm).toHaveBeenCalledWith(2.375);
    act(() => input().props.onChangeText('-10'));
    expect(view.root.findAllByType('Button' as any)[1].props.disabled).toBe(true);
    act(() => view.root.findAllByType('Button' as any)[0].props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    act(() => view.unmount());
  });
});
