import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View, type TextInputProps} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useHelpTheme, type HelpTheme} from '../helpTheme';
import {HelpPrimaryButton} from '../components/HelpPrimitives';

const makeStyles = (c: HelpTheme) => StyleSheet.create({
  page: {flex: 1, backgroundColor: c.background},
  header: {backgroundColor: c.headerSurface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line},
  caption: {color: c.muted, fontSize: 13, lineHeight: 19},
  title: {color: c.text, fontSize: 16, lineHeight: 22, fontWeight: '600'},
  body: {color: c.text, fontSize: 15, lineHeight: 21},
  label: {color: c.text, fontSize: 14, fontWeight: '600'},
  card: {backgroundColor: c.incoming, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 11},
  row: {flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:8},
  column: {gap:12},
  button: {minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', alignItems:'center', borderRadius: 12},
  input: {backgroundColor:c.panel, borderRadius:12, paddingVertical:10, paddingHorizontal:12, fontSize:15, color:c.text, minHeight:44},
  divider: {borderTopColor:c.line, borderTopWidth:StyleSheet.hairlineWidth, paddingTop:12},
  taskRow: {minHeight:76, flexDirection:'row', alignItems:'center', paddingVertical:12, paddingHorizontal:14, gap:12},
  avatar: {height:42, width:42, borderRadius:21, alignItems:'center', justifyContent:'center', backgroundColor:c.soft},
});
export function useTaskStyles() {
  const c = useHelpTheme();
  return {c, s: useMemo(() => makeStyles(c), [c])};
}
type ButtonProps = {
  label:string; onPress:()=>void; disabled?:boolean;
  kind?:'primary'|'secondary'|'quiet'|'danger'; icon?:React.ComponentProps<typeof Ionicons>['name'];
};
export function Button({label,onPress,disabled,kind='secondary',icon='checkmark-outline'}:ButtonProps) {
  const {c,s}=useTaskStyles();
  if (kind==='primary') return <HelpPrimaryButton text={label} icon={icon} onPress={onPress} disabled={disabled} variant="sheet"/>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
    accessibilityState={{disabled:!!disabled}} onPress={onPress}
    style={({pressed})=>[s.button,{backgroundColor:kind==='secondary'?c.panel:'transparent',opacity:disabled?0.45:pressed?0.7:1}]}>
    <Text style={{fontSize:14,fontWeight:'500',color:kind==='danger'?c.danger:c.accentText}}>{label}</Text>
  </Pressable>;
}
export function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}) {
  const {c,s}=useTaskStyles();
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:selected}} onPress={onPress}
    style={({pressed})=>[s.button,{backgroundColor:selected?c.soft:c.panel,opacity:pressed?0.7:1,flexDirection:'row',gap:6}]}>
    {selected && <Ionicons name="checkmark" size={16} color={c.accentText}/>}
    <Text style={{color:selected?c.accentText:c.text,fontSize:14}}>{label}</Text>
  </Pressable>;
}
export function Field({label,...props}:TextInputProps & {label:string}) {
  const {c,s}=useTaskStyles();
  return <View style={{flexGrow:1,minWidth:125,gap:6}}><Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={c.muted} {...props} style={[s.input,props.style]}/></View>;
}
