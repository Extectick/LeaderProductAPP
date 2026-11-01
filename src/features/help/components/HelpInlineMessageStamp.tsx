import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Android's default font padding shifts short glyphs below the inline time.
// Pending and accepted messages must keep the same line metrics on first paint.
export const HELP_MESSAGE_TEXT_STYLE: TextStyle = { fontSize: 15, lineHeight: 21, includeFontPadding: false };
const timeStyle: TextStyle = { fontSize: 10, lineHeight: 12, includeFontPadding: false, fontVariant: ['tabular-nums'] };
// Keep reserve runs non-painting even if Fabric drops an inherited foreground.
const reserveStyle: TextStyle = { color: 'rgba(0,0,0,0)', opacity: 0 };
const label = (time: string, edited = false) => `${edited ? 'изменено ' : ''}${time}`;
const reserveLabel = (time: string, edited = false) => {
  // U+2007 has a tabular digit's advance; U+2008 has punctuation's advance.
  // These glyphs cannot paint duplicate clock digits at any Text opacity.
  // Word joiners keep the suffix together in Android's first native layout.
  const clock = Array.from(time, char => /[0-9]/.test(char) ? '\u2007' : /[:.]/.test(char) ? '\u2008' : '\u00a0').join('\u2060');
  return `${edited ? '\u2007\u2060'.repeat(10) + '\u00a0\u2060' : ''}${clock}`;
};

/** Reserve clock/receipt advance in native text layout before first paint.
 * The suffix contains only non-painting spaces and wraps as one unit. */
export function HelpMessageStampReserve({ time, edited }: { time: string; edited?: boolean }) {
  return <Text testID="help-message-stamp-reserve" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[timeStyle, reserveStyle]}>
    {'\u2002\u2002'}{reserveLabel(time, edited)}{'\u2060\u00a0\u2060'}
    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={[HELP_MESSAGE_TEXT_STYLE, reserveStyle]}>{'\u2003\u2060\u2009\u2060'}</Text>
  </Text>;
}

export function HelpInlineMessageStamp({ time, edited, status, reduced, muted, receiptColor, danger, onRetry }: {
  time: string; edited?: boolean; status: 'queued' | 'sending' | 'failed' | 'sent' | 'read'; reduced: boolean;
  muted: string; receiptColor: string; danger: string; onRetry?: () => void;
}) {
  const pending = status === 'queued' || status === 'sending';
  return <View testID="help-message-time" pointerEvents={status === 'failed' ? 'auto' : 'none'} style={{ position: 'absolute', right: 11, bottom: 5, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
    {pending || status === 'failed' ? <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'failed' ? <Pressable accessibilityRole="button" accessibilityLabel="Не удалось отправить. Отправить снова" onPress={onRetry} hitSlop={12} style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="alert-circle-outline" size={16} color={danger}/></Pressable>
        : reduced ? <Ionicons accessibilityLabel="Отправляется" name="ellipse-outline" size={12} color={muted}/>
          : <ActivityIndicator accessibilityLabel="Отправляется" size={12} color={muted}/>}
    </View> : null}
    <Text style={[timeStyle, { color: muted }]}>{label(time, edited)}</Text>
    {!pending && status !== 'failed' ? <View style={{ width: 18, height: 12, alignItems: 'center', justifyContent: 'center' }}><Ionicons testID="help-message-receipt" allowFontScaling={false} accessibilityLabel={status === 'read' ? 'Прочитано' : 'Отправлено'} name={status === 'read' ? 'checkmark-done' : 'checkmark'} size={15} color={receiptColor}/></View> : null}
  </View>;
}
