import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
jest.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('../src/features/help/helpDiagnostics', () => ({ helpDevRef: jest.fn(), helpDevState: jest.fn() }));
jest.mock('@react-native-masked-view/masked-view', () => 'MaskedView');
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
import { HelpChatSearch, HelpChatSearchArrows, HelpChatSearchDock, helpSearchExcerpt, helpSearchSegments } from '../src/features/help/components/HelpChatSearch';
import { HelpChatHeader, HelpMoreCloseButton } from '../src/features/help/components/HelpChatHeader';

describe('Help message search navigation and literal highlighting', () => {
  let screen: TestRenderer.ReactTestRenderer | undefined;
  afterEach(async () => { if (screen) await act(async () => screen!.unmount()); screen = undefined; jest.restoreAllMocks(); });

  test('search symbols are literal, with no regex interpretation or lost text', () => {
    const text = 'Ошибка [1C]+. Проверили [1c]+ повторно.';
    const segments = helpSearchSegments(text, '[1c]+');
    expect(segments.filter(segment => segment.match).map(segment => segment.text)).toEqual(['[1C]+', '[1c]+']);
    expect(segments.map(segment => segment.text).join('')).toBe(text);
  });

  test('Cyrillic matches ignore case while preserving emoji and the original string', () => {
    const text = '📎 ОБМЕН восстановлен. Проверьте обмен ещё раз.';
    const segments = helpSearchSegments(text, 'обмен');
    expect(segments.filter(segment => segment.match).map(segment => segment.text)).toEqual(['ОБМЕН', 'обмен']);
    expect(segments.map(segment => segment.text).join('')).toBe(text);
    expect(helpSearchSegments(text, '   ')).toEqual([{ text, match: false }]);
  });

  test('the result snippet includes a distant match instead of only the start of a long message', () => {
    const text = `${'Начало. '.repeat(100)}НУЖНЫЙ ТЕКСТ${' конец'.repeat(40)}`;
    const snippet = helpSearchExcerpt(text, 'нужный текст');
    expect(snippet).toContain('НУЖНЫЙ ТЕКСТ');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(152);
  });

  test('one-letter queries preserve long messages without creating thousands of text spans', () => {
    const text = 'а '.repeat(10000);
    const segments = helpSearchSegments(text, 'а');
    expect(segments.length).toBeLessThanOrEqual(201);
    expect(segments.map(segment => segment.text).join('')).toBe(text);
  });

  test('newest-first search moves up to older results and disables navigation beyond the first result', async () => {
    const next = jest.fn(), previous = jest.fn();
    await act(async () => { screen = TestRenderer.create(React.createElement(HelpChatSearchArrows, { total: 19, selectedIndex: 0, onPrevious: previous, onNext: next })); });
    const older = screen!.root.findAllByProps({ accessibilityLabel: 'Следующий результат поиска, раньше' }).find(node => node.props.accessibilityRole === 'button')!;
    const newer = screen!.root.findAllByProps({ accessibilityLabel: 'Предыдущий результат поиска, позже' }).find(node => node.props.accessibilityRole === 'button')!;
    expect(older.props.disabled).toBe(false);
    expect(newer.props.disabled).toBe(true);
    await act(async () => older.props.onPress());
    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).not.toHaveBeenCalled();
  }, 15000);

  test('the search header contains only its capsule; results and navigation belong to separate bottom controls', async () => {
    await act(async () => { screen = TestRenderer.create(React.createElement(HelpChatSearch, { query: '', onQueryChange: jest.fn(), onClose: jest.fn(), total: 19, selectedIndex: 0, onPrevious: jest.fn(), onNext: jest.fn(), showList: false, onToggleList: jest.fn() })); });
    expect(screen!.root.findAllByProps({ children: 'Поиск по переписке' })).toHaveLength(0);
    expect(screen!.root.findAllByProps({ children: '1 из 19' })).toHaveLength(0);
    expect(screen!.root.findAllByProps({ accessibilityLabel: 'Следующий результат поиска, раньше' })).toHaveLength(0);
    expect(screen!.root.findAllByProps({ testID: 'help-chat-search-input' }).length).toBeGreaterThan(0);
  });

  test('the bottom panel owns the result count and result-list action', async () => {
    const toggle = jest.fn();
    await act(async () => { screen = TestRenderer.create(React.createElement(HelpChatSearchDock, { query: 'обмен', total: 19, selectedIndex: 2, showList: false, onToggleList: toggle })); });
    expect(screen!.root.findAllByProps({ children: '3 из 19' }).length).toBeGreaterThan(0);
    const button = screen!.root.findAllByProps({ accessibilityLabel: 'Показать список результатов' }).find(node => node.props.accessibilityRole === 'button')!;
    await act(async () => button.props.onPress());
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  test('the menu control survives search mode changes and animates both directions', async () => {
    const animation = jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
    const base = { title: 'Обращение', meta: 'Открыто', onBack: jest.fn(), onMenu: jest.fn(), onSearch: jest.fn() };
    await act(async () => { screen = TestRenderer.create(React.createElement(HelpChatHeader, base)); });
    const control = screen!.root.findByType(HelpMoreCloseButton);
    const search = { query: 'обмен', onQueryChange: jest.fn(), onClose: jest.fn() };
    await act(async () => screen!.update(React.createElement(HelpChatHeader, { ...base, search })));
    expect(screen!.root.findByType(HelpMoreCloseButton)).toBe(control);
    expect(animation.mock.calls.at(-1)?.[1]).toMatchObject({ toValue: 1, useNativeDriver: true });
    await act(async () => screen!.update(React.createElement(HelpChatHeader, base)));
    expect(screen!.root.findByType(HelpMoreCloseButton)).toBe(control);
    expect(animation.mock.calls.at(-1)?.[1]).toMatchObject({ toValue: 0, useNativeDriver: true });
  });
});
