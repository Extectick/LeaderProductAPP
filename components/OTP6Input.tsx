// components/OTP6Input.tsx
import { useTheme } from '@/context/ThemeContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard,
    LayoutChangeEvent,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
} from 'react-native';

type Props = {
  value?: string;
  onChange?: (code: string) => void;
  onFilled?: (code: string) => void;  // авто-вызов при длине 6
  disabled?: boolean;
  error?: boolean;
  /** если не задан — размер ячеек рассчитывается адаптивно от ширины контейнера */
  cellSize?: number;
  secure?: boolean;
};

const CELLS = 6;
const GAP = 10;               // интервал между ячейками
const MIN_CELL = 40;
const MAX_CELL = 56;

export default function OTP6Input({
  value = '',
  onChange,
  onFilled,
  disabled = false,
  error = false,
  cellSize,
  secure = false,
}: Props) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];

  const [code, setCode] = useState<string>(value.slice(0, CELLS).replace(/\D/g, ''));
  const [cursor, setCursor] = useState<number>(code.length); // позиция курсора 0..6
  const [containerW, setContainerW] = useState(0);
  const hiddenRef = useRef<TextInput>(null);

  // адаптивный размер ячейки
  const computedCell = useMemo(() => {
    if (cellSize) return cellSize;
    if (!containerW) return MIN_CELL;
    const avail = containerW - GAP * (CELLS - 1);
    const size = Math.floor(avail / CELLS);
    return Math.max(MIN_CELL, Math.min(MAX_CELL, size));
  }, [cellSize, containerW]);

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerW(Math.round(e.nativeEvent.layout.width));
  };

  useEffect(() => {
    // синхронизация при внешнем сбросе
    const c = (value || '').slice(0, CELLS).replace(/\D/g, '');
    if (c !== code) {
      setCode(c);
      setCursor(Math.min(CELLS, c.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // отдаём изменения и автосабмит
  useEffect(() => {
    onChange?.(code);
    if (code.length === CELLS) {
      onFilled?.(code);
      Keyboard.dismiss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { width: '100%' },
        row: {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: GAP,
        },
        cell: {
          width: computedCell,
          height: computedCell,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: error ? colors.error : colors.inputBorder,
          backgroundColor: colors.inputBackground,
          alignItems: 'center',
          justifyContent: 'center',
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 4,
            },
            android: { elevation: 1 },
          }),
        },
        cellActive: { borderColor: error ? colors.error : colors.border },
        digit: { fontSize: Math.min(24, Math.round(computedCell * 0.48)), fontWeight: '700', color: colors.text },
        dot: { fontSize: Math.min(28, Math.round(computedCell * 0.54)), fontWeight: '800', color: colors.text },
        hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
        help: { marginTop: 8, color: colors.secondaryText, fontSize: 12, textAlign: 'center' },
      }),
    [computedCell, colors, error]
  );

  const focusHidden = (pos: number) => {
    const p = Math.max(0, Math.min(CELLS, pos));
    setCursor(p);
    requestAnimationFrame(() => {
      hiddenRef.current?.focus();
      hiddenRef.current?.setNativeProps?.({ selection: { start: p, end: p } } as any);
    });
  };

  const handleChange: TextInputProps['onChangeText'] = (txt) => {
    // принимаем любые цифры, включая вставку
    const only = (txt || '').replace(/\D/g, '').slice(0, CELLS);
    setCode(only);
    setCursor(Math.min(only.length, CELLS));
  };

  const handleKeyPress: TextInputProps['onKeyPress'] = (e) => {
    if (e.nativeEvent.key !== 'Backspace') return;
    if (!code.length) return;
    const next = code.slice(0, -1);
    setCode(next);
    setCursor(next.length);
  };

  const digits = Array.from({ length: CELLS }).map((_, i) => code[i] ?? '');

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Невидимый master-input: принимает ввод/вставку целиком */}
      <TextInput
        ref={hiddenRef}
        value={code}
        onChangeText={handleChange}
        onKeyPress={handleKeyPress}
        editable={!disabled}
        keyboardType="number-pad"
        // для некоторых Android помогает:
        // @ts-ignore
        inputMode="numeric"
        maxLength={CELLS}
        selection={{ start: cursor, end: cursor }}
        style={styles.hidden}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        importantForAutofill="yes"
      />

      {/* 6 адаптивных ячеек */}
      <View style={styles.row}>
        {digits.map((d, idx) => {
          const active = cursor === idx || (cursor === CELLS && idx === CELLS - 1 && d);
          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.85}
              onPress={() => focusHidden(d ? idx + 1 : idx)}
              onLongPress={() => focusHidden(idx)}
              accessibilityLabel={`Цифра ${idx + 1}`}
              style={[styles.cell, active && styles.cellActive]}
            >
              {secure ? <Text style={styles.dot}>{d ? '•' : ''}</Text> : <Text style={styles.digit}>{d}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.help}>
        {Platform.OS === 'ios' ? 'Код можно вставить или придёт из СМС' : 'Можно вставить весь код сразу'}
      </Text>
    </View>
  );
}
