import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,StyleSheet} from 'react-native';
let mockReduced=true;
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpReducedMotion:()=>mockReduced,useHelpTheme:()=>({text:'#F2F4F7',muted:'#A6B0BE',accentText:'#68B0FF',line:'#33404E'})}));
import {HelpVoicePlaybackBar,type HelpVoicePlaybackBarProps} from '../src/features/help/components/HelpVoicePlaybackBar';

describe('Help shared voice playback strip',()=>{
  let screen:TestRenderer.ReactTestRenderer|undefined;
  let props:HelpVoicePlaybackBarProps;
  beforeEach(()=>{mockReduced=true;props={author:'Анна',positionSeconds:12,durationSeconds:90,playing:true,rate:1,onToggle:jest.fn(),onRateChange:jest.fn(),onClose:jest.fn()};});
  afterEach(async()=>{if(screen)await act(async()=>screen!.unmount());screen=undefined;jest.restoreAllMocks();});
  async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpVoicePlaybackBar,props));});}
  const control=(id:string)=>screen!.root.findAllByProps({testID:id}).find(node=>node.props.accessibilityRole==='button')!;
  test('pause and close control the shared player, with44dp targets and author/time',async()=>{
    await render();
    expect(screen!.root.findAllByProps({children:'Анна'}).length).toBeGreaterThan(0);
    expect(screen!.root.findAllByProps({children:'Голосовое · 0:12 / 1:30'}).length).toBeGreaterThan(0);
    const toggle=control('help-voice-playback-toggle');expect(toggle.props.accessibilityLabel).toBe('Приостановить голосовое сообщение');
    for(const id of ['help-voice-playback-toggle','help-voice-playback-rate','help-voice-playback-close']){
      const style=StyleSheet.flatten(control(id).props.style({pressed:false}));expect(style.width).toBeGreaterThanOrEqual(44);expect(style.height).toBeGreaterThanOrEqual(44);
    }
    await act(async()=>toggle.props.onPress());await act(async()=>control('help-voice-playback-close').props.onPress());
    expect(props.onToggle).toHaveBeenCalledTimes(1);expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  test.each([[1,1.5],[1.5,2],[2,1]] as const)('speed%sswitches to%s without restarting playback',async(rate,next)=>{
    props.rate=rate;await render();await act(async()=>control('help-voice-playback-rate').props.onPress());
    expect(props.onRateChange).toHaveBeenCalledWith(next);expect(props.onToggle).not.toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
  });
  test('loading can always be closed and paused state offers resume',async()=>{
    props.loading=true;props.playing=false;await render();
    expect(control('help-voice-playback-toggle').props.disabled).toBe(true);expect(control('help-voice-playback-close').props.disabled).not.toBe(true);
    await act(async()=>control('help-voice-playback-close').props.onPress());expect(props.onClose).toHaveBeenCalledTimes(1);
    props={...props,loading:false};await act(async()=>screen!.update(React.createElement(HelpVoicePlaybackBar,props)));
    expect(control('help-voice-playback-toggle').props.accessibilityLabel).toBe('Продолжить голосовое сообщение');
  });
  test.each([[300,90,90],[-5,90,0],[Infinity,90,0],[12,NaN,0],[12,0,0]])('progress clamps%s/%s to%s and never exposesNaN',async(position,duration,expected)=>{
    props.positionSeconds=position;props.durationSeconds=duration;await render();
    const progress=screen!.root.findAllByProps({testID:'help-voice-playback-progress'}).find(node=>node.props.accessibilityRole==='progressbar')!;
    expect(progress.props.accessibilityValue.now).toBe(expected);expect(Number.isFinite(progress.props.accessibilityValue.max)).toBe(true);expect(progress.props.accessibilityValue.text).not.toMatch(/NaN|Infinity/);
  });
  test('title navigation is optional and independent from playback',async()=>{
    props.onPressTitle=jest.fn();await render();
    const title=screen!.root.findAllByProps({accessibilityLabel:'К голосовому сообщению Анна'}).find(node=>node.props.accessibilityRole==='button')!;
    await act(async()=>title.props.onPress());expect(props.onPressTitle).toHaveBeenCalledTimes(1);expect(props.onToggle).not.toHaveBeenCalled();
  });
  test('progress uses native animation only while playing and honors reduced motion',async()=>{
    const timing=jest.spyOn(Animated,'timing').mockReturnValue({start:jest.fn(),stop:jest.fn(),reset:jest.fn()});
    await render();expect(timing).not.toHaveBeenCalled();
    mockReduced=false;props={...props,positionSeconds:13};await act(async()=>screen!.update(React.createElement(HelpVoicePlaybackBar,props)));
    expect(timing).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({useNativeDriver:true,toValue:13/90,duration:100}));
    timing.mockClear();props={...props,playing:false,positionSeconds:14};await act(async()=>screen!.update(React.createElement(HelpVoicePlaybackBar,props)));expect(timing).not.toHaveBeenCalled();
  });
});
