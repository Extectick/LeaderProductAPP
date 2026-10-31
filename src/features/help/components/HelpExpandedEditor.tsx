import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHelpTheme } from '../helpTheme';
export type HelpTextSelection = {
  start: number;
  end: number;
};
export function HelpExpandedEditor({
  value,
  onChange,
  selection,
  onDone
}: {
  value: string;
  onChange: (text: string) => void;
  selection: HelpTextSelection;
  onDone: (selection: HelpTextSelection) => void;
}) {
  const c = useHelpTheme(),
    insets = useSafeAreaInsets();
  const [range, setRange] = useState(selection),
    current = useRef(selection);
  function done() {
    onDone(current.current);
  }
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
      <TextInput testID="help-expanded-input" accessibilityLabel="Текст сообщения на весь экран" autoFocus multiline value={value} onChangeText={onChange} selection={range} onSelectionChange={e => {
        current.current = e.nativeEvent.selection;
        setRange(current.current);
      }} textAlignVertical="top" placeholder="Сообщение…" placeholderTextColor={c.muted} style={{
        flex: 1,
        color: c.text,
        fontSize: 18,
        lineHeight: 24,
        padding: 20,
        includeFontPadding: false
      }} />
    </KeyboardAvoidingView>
  </Modal>;
}
