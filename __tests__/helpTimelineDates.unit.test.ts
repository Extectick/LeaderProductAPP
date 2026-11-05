import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,StyleSheet} from 'react-native';
import {HelpTimelineDates,helpDateMotion,type HelpDateMarker} from '../src/features/help/components/HelpTimelineDates';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({muted:'#777',panel:'#eee'})}));

const marker:HelpDateMarker={key:'day-1',date:'2026-11-04T12:00:00Z',y:150,nextY:350,hidden:false};
function position(offset:number,value=marker,top=88){return new Animated.Value(offset).interpolate(helpDateMotion(value,top)).__getValue()+top;}

test('a date follows the exact scroll position, pins continuously and detaches along the same path',()=>{
  for(const offset of [0,30,61,61.5,62,62.5,100,180,100,62.5,62,61.5,61,30,0]){
    expect(position(offset)).toBeCloseTo(Math.max(88,150-offset),8);
  }
});

test('the next date pushes out the previous day with no gap or overlapping pills',()=>{
  const next:HelpDateMarker={key:'day-2',date:'2026-11-05T12:00:00Z',y:350,hidden:false};
  for(const offset of [237,238,238.5,250,261.5,262,262.5,280,262,250,238]){
    const previous=position(offset),upcoming=position(offset,next);
    expect(previous).toBeCloseTo(Math.min(88,350-offset-24),8);
    expect(upcoming).toBeCloseTo(Math.max(88,350-offset),8);
    expect(upcoming-previous).toBeGreaterThanOrEqual(24);
  }
});

test('the final day stays pinned through overscroll and zero-length pin ranges are continuous',()=>{
  expect(position(10000,{...marker,nextY:undefined})).toBe(88);
  for(const offset of [61,62,63,70])expect(position(offset,{...marker,nextY:174})).toBeCloseTo(150-offset,8);
});

test('one visible date node survives scrolling, idle time and reverse movement without opacity animation',async()=>{
  const scrollOffset=new Animated.Value(0),onPress=jest.fn();let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpTimelineDates,{presentation:{markers:[marker],scrollOffset},headerHeight:100,bottom:60,onPress}));});
  try{
    const node=tree.root.findByProps({testID:'help-moving-date'});
    const style=()=>StyleSheet.flatten(node.props.style);
    for(const offset of [0,61,62,63,180,63,62,61,0]){
      act(()=>scrollOffset.setValue(offset));
      expect(style().transform![0].translateY.__getValue()+88).toBeCloseTo(Math.max(88,150-offset),8);
      expect(style().opacity).toBeUndefined();
      expect(tree.root.findByProps({testID:'help-moving-date'})).toBe(node);
    }
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'help-date-layer'}).props.style)).toMatchObject({top:88,bottom:60,overflow:'hidden'});
    const button=tree.root.findAllByProps({testID:'help-date-jump'}).find(item=>item.props.accessibilityRole==='button')!;
    await act(async()=>button.props.onPress());expect(onPress).toHaveBeenCalledWith(marker.date);
  }finally{await act(async()=>tree.unmount());}
});
