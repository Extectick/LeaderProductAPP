import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Animated,Pressable,StyleSheet,View} from 'react-native';
let mockReduced=false;
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({accent:'#3289FF',green:'#21864E'}),useHelpReducedMotion:()=>mockReduced}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
import {HelpMessageSelectionRow,type HelpMessageSelectionRowProps} from '../src/features/help/components/HelpMessageSelectionRow';
let screen:TestRenderer.ReactTestRenderer,props:HelpMessageSelectionRowProps;
const node=(id:string)=>screen.root.findAll(n=>n.props.testID===id)[0];
const value=(x:any)=>typeof x==='number'?x:x.__getValue();
const offset=()=>value(StyleSheet.flatten(node('help-message-selection-content').props.style).transform[0].translateX);
const jobs:{value:Animated.Value;config:any}[]=[];
beforeEach(()=>{
 mockReduced=false;jobs.length=0;
 jest.spyOn(Animated,'timing').mockImplementation((value:any,config:any)=>({start:()=>{jobs.push({value,config});},stop:jest.fn(),reset:jest.fn()}));
 props={messageId:7,active:false,selected:false,incoming:true,onToggle:jest.fn(),onStart:jest.fn(),children:React.createElement(View,{testID:'child'})};
});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());jest.restoreAllMocks();});
async function render(){await act(async()=>{screen=TestRenderer.create(React.createElement(HelpMessageSelectionRow,props));});}
async function update(patch:Partial<typeof props>){props={...props,...patch};await act(async()=>screen.update(React.createElement(HelpMessageSelectionRow,props)));}
test('selection animates translation and checkbox with native180ms without changing measured content width',async()=>{
 await render();expect(offset()).toBe(0);
 await update({active:true});const job=jobs.at(-1)!;
 expect(job.config).toMatchObject({toValue:1,duration:180,useNativeDriver:true,isInteraction:false});
 await act(async()=>job.value.setValue(1));expect(offset()).toBe(36);
 expect(StyleSheet.flatten(node('help-message-selection-content').props.style)).toMatchObject({width:'100%'});
 expect(node('help-message-selection-content').props.pointerEvents).toBe('none');
 const checkbox=StyleSheet.flatten(node('help-message-selection-checkbox').props.style);
 expect(checkbox).toMatchObject({left:16,bottom:12});expect(value(checkbox.opacity)).toBe(1);
 const circle=node('help-message-selection-checkbox').findAllByType(View).find(n=>StyleSheet.flatten(n.props.style)?.width===26)!;
 expect(StyleSheet.flatten(circle.props.style)).toMatchObject({height:26,borderWidth:2,borderColor:'#FFFFFF'});
});
test('every selection row has a semantic checkbox; only selected rows receive full-row tint',async()=>{
 props.active=true;await render();
 expect(node('help-message-selection-toggle').props.accessibilityRole).toBe('checkbox');
 expect(node('help-message-selection-toggle').props.accessibilityState).toEqual({checked:false});
 expect(screen.root.findAllByProps({testID:'help-message-selection-tint'})).toHaveLength(0);
 await update({selected:true});expect(node('help-message-selection-toggle').props.accessibilityState).toEqual({checked:true});
 expect(StyleSheet.flatten(node('help-message-selection-tint').props.style)).toMatchObject({...StyleSheet.absoluteFillObject,backgroundColor:'#3289FF',opacity:.16});
 const circle=node('help-message-selection-checkbox').findAllByType(View).find(n=>StyleSheet.flatten(n.props.style)?.width===26)!;
 expect(StyleSheet.flatten(circle.props.style).backgroundColor).toBe('#21864E');
});
test('whole-row overlay toggles without exposing child actions or grabbing vertical scrolling',async()=>{
 props.active=true;await render();
 await act(async()=>node('help-message-selection-toggle').props.onPress());expect(props.onToggle).toHaveBeenCalledWith(7);
 expect(node('help-message-selection-content').props).toMatchObject({pointerEvents:'none',accessibilityElementsHidden:true,importantForAccessibility:'no-hide-descendants'});
 for(const item of screen.root.findAllByType(Pressable)){
  expect(item.props.onStartShouldSetResponderCapture).toBeUndefined();expect(item.props.onMoveShouldSetResponderCapture).toBeUndefined();expect(item.props.panHandlers).toBeUndefined();
 }
});
test('outside selection long press starts selection for plain AI content and keeps nested human actions intact',async()=>{
 const childLongPress=jest.fn();props.children=React.createElement(Pressable,{testID:'human-child',onLongPress:childLongPress});await render();
 expect(node('human-child').props.onLongPress).toBe(childLongPress);
 expect(node('help-message-selection-content').props.pointerEvents).toBe('auto');
 await act(async()=>node('help-message-selection-long-press').props.onLongPress());expect(props.onStart).toHaveBeenCalledWith(7);
 await update({active:true});expect(node('help-message-selection-long-press').props.onLongPress).toBeUndefined();
});
test('outgoing content stays fixed and reduced motion snaps entrance and exit immediately',async()=>{
 mockReduced=true;props.incoming=false;await render();expect(jobs).toHaveLength(0);
 await update({active:true});expect(offset()).toBe(0);expect(value(StyleSheet.flatten(node('help-message-selection-checkbox').props.style).opacity)).toBe(1);
 await update({incoming:true});expect(offset()).toBe(36);
 await update({active:false});expect(offset()).toBe(0);expect(value(StyleSheet.flatten(node('help-message-selection-checkbox').props.style).opacity)).toBe(0);
 expect(jobs).toHaveLength(0);
});
test('selection changes do not restart motion and a recycled old callback cannot act on a new message',async()=>{
 props.active=true;await render();const toggle=node('help-message-selection-toggle').props.onPress,count=jobs.length;
 await update({selected:true});expect(jobs).toHaveLength(count);
 await update({messageId:8});await act(async()=>toggle());expect(props.onToggle).not.toHaveBeenCalled();
 await act(async()=>node('help-message-selection-toggle').props.onPress());expect(props.onToggle).toHaveBeenCalledWith(8);
});

test('incoming text keeps the same available width through selection and exit, including wide attachments',async()=>{
 await render();
 const geometry=()=>StyleSheet.flatten(node('help-message-selection-long-press').props.style);
 const contentGeometry=()=>StyleSheet.flatten(node('help-message-selection-content').props.style);
 expect(geometry()).toMatchObject({width:'100%',paddingRight:36});
 expect(contentGeometry().maxWidth).toBeUndefined();
 const before=geometry();
 await update({active:true});expect(geometry()).toEqual(before);expect(contentGeometry().maxWidth).toBeUndefined();
 await update({active:false});expect(geometry()).toEqual(before);
 await update({incoming:false});expect(geometry().paddingRight).toBeUndefined();
});

test('dock slides mounted composer down and actions up without replacing composer or changing measured height',async()=>{
 const {HelpSelectionDock}=require('../src/features/help/components/HelpSelectionDock');
 const p={active:false,canReply:true,canForward:true,onReply:jest.fn(),onForward:jest.fn(),children:React.createElement(View,{testID:'preserved-composer'})};
 await act(async()=>{screen=TestRenderer.create(React.createElement(HelpSelectionDock,p));});
 const child=node('preserved-composer');
 await act(async()=>node('help-selection-composer').props.onLayout({nativeEvent:{layout:{height:112}}}));
 await act(async()=>screen.update(React.createElement(HelpSelectionDock,{...p,active:true})));
 expect(node('preserved-composer')).toBe(child);
 expect(StyleSheet.flatten(node('help-selection-composer').props.style).height).toBe(112);
 const motion=jobs.at(-1)!;expect(motion.config).toMatchObject({toValue:1,duration:220,useNativeDriver:true});
 await act(async()=>motion.value.setValue(1));
 expect(value(StyleSheet.flatten(node('help-selection-composer').props.style).transform[0].translateY)).toBe(124);
 expect(value(StyleSheet.flatten(node('help-selection-actions').props.style).transform[0].translateY)).toBe(0);
 const reply=screen.root.findAll(n=>n.props.accessibilityLabel==='Ответить на выбранное сообщение')[0];
 expect(reply.props.disabled).toBe(false);await act(async()=>reply.props.onPress());expect(p.onReply).toHaveBeenCalledTimes(1);
 await act(async()=>screen.update(React.createElement(HelpSelectionDock,p)));
 expect(node('preserved-composer')).toBe(child);expect(node('help-selection-actions').props.pointerEvents).toBe('none');
});
