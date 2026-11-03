import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpReducedMotion: () => false, useHelpTheme: () => ({ muted: '#999999', panel: '#222222' }) }));
import { HelpDateSeparator,HelpJumpToLatest } from '../src/features/help/components/HelpTimelineIndicators';

describe('Help date navigation chip', () => {
  let screen: TestRenderer.ReactTestRenderer;
  afterEach(async () => { if (screen) await act(async () => screen.unmount()); });

  test('an interactive day retains a compact pill inside a 44dp target and announces its destination', async () => {
    const onPress = jest.fn();
    await act(async () => { screen = TestRenderer.create(React.createElement(HelpDateSeparator, { date: new Date().toISOString(), onPress })); });
    const button = screen.root.findAllByProps({ testID: 'help-date-jump' }).find(node => node.props.accessibilityRole === 'button')!;
    expect(button.props.accessibilityLabel).toBe('Перейти к началу сообщений за сегодня');
    const targetStyle = StyleSheet.flatten(button.props.style({ pressed: false }));
    expect(targetStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(targetStyle.minWidth).toBeGreaterThanOrEqual(44);
    const pill = screen.root.findAllByProps({ children: 'Сегодня' }).find(node => node.props.style?.lineHeight)!;
    expect(pill.props.style.lineHeight + pill.props.style.paddingVertical * 2).toBe(24);
    await act(async () => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('without a navigation handler the date remains a readable heading, not an inert button', async () => {
    await act(async () => { screen = TestRenderer.create(React.createElement(HelpDateSeparator, { date: '2025-01-31T12:00:00.000Z' })); });
    expect(screen.root.findAllByProps({ testID: 'help-date-jump' })).toHaveLength(0);
    expect(screen.root.findAllByProps({ accessibilityRole: 'header' }).length).toBeGreaterThan(0);
  });
  test('legacy interaction proxy has one accessible hit target and no independent appearance animation',async()=>{
    const press=jest.fn(),animation=jest.spyOn(require('react-native').Animated,'timing');
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpJumpToLatest,{presentation:'interaction',count:4,onPress:press,style:{position:'absolute',bottom:76}}));});
    expect(animation).not.toHaveBeenCalled();
    const button=screen.root.findAllByProps({testID:'help-jump-to-latest'}).find(node=>node.props.accessibilityRole==='button')!;
    expect(button.props.accessibilityLabel).toBe('К последним сообщениям. Новых: 4');
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({width:38,height:38,backgroundColor:'transparent'});
    await act(async()=>button.props.onPress());expect(press).toHaveBeenCalledTimes(1);
    await act(async()=>screen.update(React.createElement(HelpJumpToLatest,{presentation:'interaction',visible:false,onPress:press})));
    expect(screen.toJSON()).toBeNull();animation.mockRestore();
  });
  test('legacy visual is a noninteractive View without a duplicated native button or accessibility label',async()=>{
    await act(async()=>{screen=TestRenderer.create(React.createElement(HelpJumpToLatest,{presentation:'visual',count:2,onPress:jest.fn()}));});
    const visual=screen.root.findByProps({testID:'help-jump-to-latest-visual'});
    expect(visual.props.accessible).toBe(false);expect(visual.props.pointerEvents).toBe('none');
    expect(typeof visual.props.style).toBe('object');
    expect(screen.root.findAll(node=>node.type!==HelpJumpToLatest&&(node.props.accessibilityRole==='button'||typeof node.props.onPress==='function'||node.props.accessibilityLabel!==undefined))).toHaveLength(0);
  });
});
