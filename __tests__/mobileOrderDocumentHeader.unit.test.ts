import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import { Stack } from 'expo-router';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import 'expo-router/build/testing-library/mocks';
import { ServicesHeaderSlotProvider, type ServicesHeaderOverride } from '../src/features/services/headerSlotContext';
import { MobileOrderDocumentHeader } from '../src/features/clientOrders/components/MobileOrderDocumentHeader';

jest.mock('../components/AppHeader', () => ({ AppHeader: 'AppHeader' }));

const element = React.createElement;

test('document actions and tab content stay local across editor, picker and list transitions in a services stack', async () => {
  let mode: 'list' | 'editor' | 'picker' = 'list';
  let changeMode!: (nextMode: typeof mode) => void;
  let setQuantity!: (next: number) => void;
  const record = jest.fn();
  const writes = jest.fn();
  const goBack = jest.fn();
  function Services() {
    const [header, setHeader] = React.useState<ServicesHeaderOverride | null>(null);
    const slots = React.useMemo(() => ({
      setHeaderBottomSlot: () => {}, setHeaderRightSlot: () => {},
      setHeaderOverride(next: ServicesHeaderOverride | null) {
        writes(next);
        setHeader(next);
      },
    }), []);
    return element(ServicesHeaderSlotProvider, {value: slots, children: element(Stack, {screenOptions: {headerShown: !header?.hidden}})});
  }
  function Editor() {
    const [stage, setStage] = React.useState<typeof mode>('list');
    const [quantity, update] = React.useState(0);
    changeMode = setStage;
    setQuantity = update;
    // Each edit creates new callbacks and tab JSX exactly as changed draft state does.
    return element(MobileOrderDocumentHeader, {
      visible: stage === 'editor', onBack: () => goBack(quantity), titleSlot: element(Text, null, quantity),
      rightSlot: element(Pressable, { onPress: () => record(quantity) }), bottomSlot: element(Text, null, 'Товары'),
    });
  }
  const context = getMockContext({ _layout: () => element(Stack, {screenOptions: {headerShown: false}}), 'services/_layout': Services, 'services/client_orders': Editor });
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => { view = TestRenderer.create(element(ExpoRoot, {context, location: '/services/client_orders'})); });
  try {
    const headers = () => view.root.findAll(node => (node.type as unknown) === 'AppHeader');
    expect(headers()).toHaveLength(0);
    expect(writes.mock.calls).toEqual([[{hidden: true}]]);
    await act(async () => changeMode('editor'));
    for (let n = 1; n <= 12; n++) await act(async () => setQuantity(n));
    const header = headers()[0].props;
    header.onBack();
    header.rightSlot.props.onPress();
    expect(header.bottomSlot.props.children).toBe('Товары');
    expect(goBack).toHaveBeenCalledWith(12);
    expect(record).toHaveBeenCalledWith(12);
    await act(async () => changeMode('picker'));
    expect(headers()).toHaveLength(0);
    await act(async () => changeMode('editor'));
    expect(headers()).toHaveLength(1);
    await act(async () => changeMode('list'));
    expect(headers()).toHaveLength(0);
    expect(writes).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => view.unmount());
  }
  expect(writes).toHaveBeenLastCalledWith(null);
});
