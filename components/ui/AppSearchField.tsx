import React from 'react';
import {Platform, Pressable, TextInput} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {appWebControlProps, appWebControlContentProps} from './appWebInteraction';
import {AppSearchGlyph} from './AppSearchGlyph';

/** Search contents for AppWorkspaceHeader; services own the query and results. */
export function AppSearchField({value, onChangeText, label, colors, disabled=false, autoFocus=false, clearControl}: {
  value: string; onChangeText: (value: string) => void; label: string;
  colors: {text: string; muted: string; accentText: string};
  disabled?: boolean; autoFocus?: boolean; clearControl?: React.ReactNode;
}) {
  return <>
    <AppSearchGlyph color={colors.muted}/>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder="Поиск"
      placeholderTextColor={colors.muted} editable={!disabled} autoFocus={autoFocus} returnKeyType="search"
      autoCorrect={false} underlineColorAndroid="transparent"
      style={{flex: 1, minWidth: 0, height: 44, padding: 0, color: colors.text, fontSize: 16,
        includeFontPadding: false, textAlignVertical: 'center', ...(Platform.OS==='web'?{outlineStyle:'none'} as any:{})}}/>
    {value ? clearControl ?? <Pressable {...appWebControlProps()} accessibilityRole="button" accessibilityLabel="Очистить поиск"
      disabled={disabled} onPress={()=>onChangeText('')} hitSlop={8} style={({pressed})=>({width:28,height:28,borderRadius:14,flexShrink:0,
        alignItems:'center',justifyContent:'center',opacity:disabled ? .38 : pressed ? .65 : 1})}>
      <Ionicons {...appWebControlContentProps()} name="close" size={17} color={colors.accentText}/>
    </Pressable> : null}
  </>;
}
