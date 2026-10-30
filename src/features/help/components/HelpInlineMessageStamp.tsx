import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const timeStyle: TextStyle = { fontSize: 10, lineHeight: 12, fontVariant: ['tabular-nums'] };
const label = (time: string, edited = false) => `${edited ? 'изменено ' : ''}${time}`;

/** Reserve actual timestamp glyphs in the native text layout, before first
 * paint. The nonbreaking suffix wraps as one unit and the receipt slot fits
 * both delivery icons and the sending/error indicator. */
export function HelpMessageStampReserve({ time, edited }: { time: string; edited?: boolean }) {
  return <Text testID="help-message-stamp-reserve" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[timeStyle, { color: 'transparent' }]}>
    {'\u2002\u2002'}{label(time, edited).replace(/ /g, '\u00a0')}{'\u00a0'}
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={{ fontSize: 15, lineHeight: 21 }}>{'\u2003\u2060\u2009\u2060'}</Text>
  </Text>;
}

export function HelpInlineMessageStamp({ time, edited, status, reduced, muted, receiptColor, danger, onRetry }: {
  time: string; edited?: boolean; status: 'queued' | 'sending' | 'failed' | 'sent' | 'read'; reduced: boolean;
  muted: string; receiptColor: string; danger: string; onRetry?: () => void;
}) {
  const pending = status === 'queued' || status === 'sending';
  return <View testID="help-message-time" pointerEvents={status === 'failed' ? 'auto' : 'none'} style={{ position: 'absolute', right: 11, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
    {pending || status === 'failed' ? <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'failed' ? <Pressable accessibilityRole="button" accessibilityLabel="Не удалось отправить. Отправить снова" onPress={onRetry} hitSlop={12} style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="alert-circle-outline" size={16} color={danger}/></Pressable>
        : reduced ? <Ionicons accessibilityLabel="Отправляется" name="ellipse-outline" size={12} color={muted}/>
          : <ActivityIndicator accessibilityLabel="Отправляется" size={12} color={muted}/>}
    </View> : null}
    <Text style={[timeStyle, { color: muted }]}>{label(time, edited)}</Text>
    {!pending && status !== 'failed' ? <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}><Ionicons testID="help-message-receipt" allowFontScaling={false} accessibilityLabel={status === 'read' ? 'Прочитано' : 'Отправлено'} name={status === 'read' ? 'checkmark-done' : 'checkmark'} size={15} color={receiptColor}/></View> : null}
  </View>;
}
