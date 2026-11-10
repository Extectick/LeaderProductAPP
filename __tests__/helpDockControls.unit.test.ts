import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {StyleSheet, View} from 'react-native';
import {HelpDockControls} from '../src/features/help/components/HelpDockControls';

describe('Help dock controls surface',()=>{
  let tree:TestRenderer.ReactTestRenderer;
  beforeEach(()=>{tree=undefined as unknown as TestRenderer.ReactTestRenderer;});
  afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
  async function render(nativeSynced:boolean,imeInset:number,dockHeight=64){
    const element=React.createElement(HelpDockControls,{nativeID:'controls-1',nativeSynced,imeInset,dockHeight,children:(bottom:number)=>React.createElement(View,{testID:'controls-child',style:{position:'absolute',bottom}})});
    await act(async()=>{if(tree)tree.update(element);else tree=TestRenderer.create(element);});
  }
  test('native sibling covers the scene and keeps control hit regions inside both parent bounds',async()=>{
    await render(true,0);
    const surface=tree.root.findByProps({testID:'help-dock-controls'});
    expect(StyleSheet.flatten(surface.props.style)).toEqual({position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:1});
    expect(surface.props.nativeID).toBe('controls-1');expect(surface.props.collapsable).toBe(false);
    expect(surface.props.pointerEvents).toBe('box-none');
    expect(StyleSheet.flatten(surface.findByProps({testID:'controls-child'}).props.style)).toMatchObject({bottom:76});
    await render(true,270);
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'controls-child'}).props.style).bottom).toBe(76);
  });
  test('legacy and web paths retain normal bounds while tracking their available keyboard inset',async()=>{
    await render(false,270);
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'controls-child'}).props.style).bottom).toBe(346);
    await render(false,0,90);
    expect(StyleSheet.flatten(tree.root.findByProps({testID:'controls-child'}).props.style).bottom).toBe(102);
  });
});
