import { formatWebQuantity, handleWebCellKey, stepWebQuantity } from '../src/features/clientOrders/screen/desktop/clientOrdersWebEditing';

describe('web order quantity editor', () => {
  it.each([[9, '10'], [99, '100'], [999, '1000']])('increments %s without dropping integer zeroes', (before, after) => {
    expect(stepWebQuantity(before, false, 1)).toBe(after);
  });
  it('preserves whole weight amounts and formats fractional quantities', () => {
    expect(formatWebQuantity(100, true)).toBe('100');
    expect(stepWebQuantity('9,125', true, 1)).toBe('10,125');
    expect(stepWebQuantity('0,5', true, -1)).toBe('0,001');
    expect(stepWebQuantity('1', false, -1)).toBe('1');
  });
  it('restores the focus checkpoint on Escape and commits on Enter', () => {
    const restore = jest.fn(), blur = jest.fn();
    const event = { key: 'Escape', target: { blur } as unknown as EventTarget, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    handleWebCellKey(event, restore);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
    handleWebCellKey({ ...event, key: 'Enter' }, restore);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(2);
  });
  it('does not interrupt IME confirmation or ordinary Tab navigation', () => {
    const restore = jest.fn(), blur = jest.fn(), preventDefault = jest.fn();
    const event = { key: 'Enter', nativeEvent: { isComposing: true }, target: { blur } as unknown as EventTarget, preventDefault, stopPropagation: jest.fn() };
    handleWebCellKey(event, restore);
    handleWebCellKey({ ...event, nativeEvent: { isComposing: false }, key: 'Tab' }, restore);
    expect(restore).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
