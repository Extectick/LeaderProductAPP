import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHelpTheme } from '../helpTheme';
import {AppDesktopDialog} from '@/components/ui/AppDesktopDialog';
import {appWebControlContentProps,appWebControlProps} from '@/components/ui/appWebInteraction';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';
export type HelpTextSelection = {
  start: number;
  end: number;
};
export function HelpExpandedEditor({
  value,
  onChange,
  selection,
  onDone,
  returnFocusRef
}: {
  value: string;
  onChange: (text: string) => void;
  selection: HelpTextSelection;
  onDone: (selection: HelpTextSelection) => void;
  returnFocusRef?:React.RefObject<{focus:()=>void}|null>;
}) {
  const c = useHelpTheme(),
    insets = useSafeAreaInsets();
  const window=useWindowDimensions(),desktop=Platform.OS==='web'&&window.width>APP_LAYOUT.compactMax;
  const [range, setRange] = useState(selection),
    current = useRef(selection);
  const inputRef=useRef<TextInput>(null),finished=useRef(false);
  function done() {
    if(finished.current)return;finished.current=true;
    onDone(current.current);
  }
  const input=<TextInput ref={inputRef} testID="help-expanded-input" accessibilityLabel={desktop?'Текст сообщения':'Текст сообщения на весь экран'} autoFocus={!desktop} multiline value={value} onChangeText={onChange} selection={range} onSelectionChange={e=>{
    current.current=e.nativeEvent.selection;setRange(current.current);
  }} textAlignVertical="top" placeholder="Сообщение…" placeholderTextColor={c.muted} style={{flex:1,minHeight:0,color:c.text,fontSize:desktop?16:18,lineHeight:24,padding:20,includeFontPadding:false,
    ...(desktop?{backgroundColor:c.background,borderWidth:1,borderColor:c.line,borderRadius:12}:null)}}/>;
  if(desktop)return <AppDesktopDialog title="Сообщение" onClose={done} maxWidth={760} height={Math.min(640,window.height-64)} scrollable={false} initialFocusRef={inputRef} returnFocusRef={returnFocusRef} testID="help-expanded-dialog"
    footer={<View style={{flexDirection:'row',justifyContent:'flex-end'}}><Pressable {...appWebControlProps('filled')} accessibilityRole="button" accessibilityLabel="Готово, вернуться в чат" onPress={done}
      style={({pressed})=>({minHeight:40,paddingHorizontal:20,borderRadius:12,justifyContent:'center',backgroundColor:c.accent,opacity:pressed?.8:1})}>
      <Text {...appWebControlContentProps()} style={{color:'#FFF',fontSize:14,fontWeight:'600'}}>Готово</Text>
    </Pressable></View>}>{input}</AppDesktopDialog>;
  return <Modal visible animationType="slide" onRequestClose={done}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{
      flex: 1,
      backgroundColor: c.background,
      paddingTop: insets.top,
      paddingBottom: insets.bottom
    }}>
      <View style={{
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        gap: 8
      }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Вернуться к сообщению" onPress={done} style={{
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center'
        }}><Ionicons name="chevron-back" size={25} color={c.text} /></Pressable>
        <Text style={{
          flex: 1,
          color: c.text,
          fontSize: 18,
          fontWeight: '500'
        }}>Сообщение</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Готово, вернуться в чат" onPress={done} style={{
          minHeight: 48,
          paddingHorizontal: 16,
          justifyContent: 'center'
        }}><Text style={{
            color: c.accentText,
            fontSize: 16
          }}>Готово</Text></Pressable>
      </View>
      {input}
    </KeyboardAvoidingView>
  </Modal>;
}
