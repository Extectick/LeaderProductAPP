import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,StyleSheet} from 'react-native';
import {HelpInlineDate,HelpInlineDateContext,HelpTimelineDates,HelpTimelineDatesHost,type HelpDateMarker,type HelpTimelineDatesHandle} from '../src/features/help/components/HelpTimelineDates';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({muted:'#777',panel:'#eee'})}));

const marker:HelpDateMarker={key:'day-1',date:'2026-11-04T12:00:00Z',y:150,nextY:350,hidden:false,pinned:false};

// The actual date stays inside the content. Only its pinned copy is projected;
// both visibility values must change from the same native scroll event.
test('in-flow date and pinned date hand off on the same offset, reverse, and push without a moving duplicate',async()=>{
  const scrollOffset=new Animated.Value(0),onPress=jest.fn();
  const presentation={markers:[marker],scrollOffset,scrollId:'chat-test'};
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpInlineDateContext.Provider,{value:{...presentation,headerHeight:100}},
    React.createElement(HelpInlineDate,{rowKey:marker.key,date:marker.date,onPress:()=>onPress(marker.date)}),
    React.createElement(HelpTimelineDates,{presentation,headerHeight:100,bottom:60,onPress})));});
  try{
    const inline=tree.root.findByProps({testID:'help-inline-date-motion'});
    const pinned=tree.root.findByProps({testID:'help-moving-date'});
    for(const offset of [0,30,61,62,63,180,238,250,262,280,250,100,62,61,0]){
      act(()=>scrollOffset.setValue(offset));
      const a=StyleSheet.flatten(inline.props.style),b=StyleSheet.flatten(pinned.props.style);
      expect(a.transform).toBeUndefined(); // Physical scroll/tail/IME owns movement.
      expect(a.opacity.__getValue()).toBe(offset<62?1:0);
      expect(b.opacity.__getValue()).toBe(offset<62?0:1);
      expect(b.transform[0].translateY.__getValue()).toBeCloseTo(-Math.min(24,Math.max(0,offset-238)));
      expect(tree.root.findByProps({testID:'help-inline-date-motion'})).toBe(inline);
      expect(tree.root.findByProps({testID:'help-moving-date'})).toBe(pinned);
    }
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'help-date-layer'}).props.style)).toMatchObject({top:88,bottom:60,overflow:'hidden'});
    await act(async()=>tree.root.findAllByProps({testID:'help-date-jump'}).find(item=>item.props.accessibilityRole==='button')!.props.onPress());
    expect(onPress).toHaveBeenCalledWith(marker.date);
  }finally{await act(async()=>tree.unmount());}
});

test.each([{nextY:undefined,offset:10000,expected:0},{nextY:174,offset:70,expected:-8},{nextY:174,offset:90,expected:-24}])('last day and adjacent estimated boundaries stay finite: %j',async({nextY,offset,expected})=>{
  const scrollOffset=new Animated.Value(offset),presentation={markers:[{...marker,nextY}],scrollOffset,scrollId:'edge-test'};
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpTimelineDates,{presentation,headerHeight:100,bottom:60,onPress:jest.fn()}));});
  try{
    const value=StyleSheet.flatten(tree.root.findByProps({testID:'help-moving-date'}).props.style).transform[0].translateY;
    expect(typeof value==='number'?value:value.__getValue()).toBeCloseTo(expected);
  }finally{await act(async()=>tree.unmount());}
});

test('retained navigation snapshots keep the actual date even when its live copy is pinned',async()=>{
  const presentation={markers:[{...marker,pinned:true}],scrollOffset:new Animated.Value(100),scrollId:'snapshot-test',headerHeight:100};
  let tree!:TestRenderer.ReactTestRenderer;
  await act(async()=>{tree=TestRenderer.create(React.createElement(HelpInlineDateContext.Provider,{value:presentation},React.createElement(HelpInlineDate,{rowKey:marker.key,date:marker.date,retained:true,onPress:jest.fn()})));});
  try{
    expect(tree.root.findAllByProps({testID:'help-inline-date-motion'})).toHaveLength(0);
    expect(tree.root.findAllByProps({testID:'help-date-separator'}).length).toBeGreaterThan(0);
    expect(tree.root.findByProps({testID:'help-inline-date'}).props.style?.opacity).not.toBe(0);
  }finally{await act(async()=>tree.unmount());}
});

test('date measurements update only their host without rerendering its chat parent',async()=>{
  const ref=React.createRef<HelpTimelineDatesHandle>();
  let renders=0,tree!:TestRenderer.ReactTestRenderer;
  function Parent(){renders++;return React.createElement(HelpTimelineDatesHost,{ref,headerHeight:100,bottom:60,onPress:jest.fn()});}
  await act(async()=>{tree=TestRenderer.create(React.createElement(Parent));});
  try{
    expect(tree.root.findAllByProps({testID:'help-date-layer'})).toHaveLength(0);
    await act(async()=>ref.current!.update({markers:[marker],scrollOffset:new Animated.Value(0),scrollId:'host-test'}));
    expect(tree.root.findAllByProps({testID:'help-date-layer'}).length).toBeGreaterThan(0);expect(renders).toBe(1);
    await act(async()=>ref.current!.update(null));
    expect(tree.root.findAllByProps({testID:'help-date-layer'})).toHaveLength(0);expect(renders).toBe(1);
  }finally{await act(async()=>tree.unmount());}
});
