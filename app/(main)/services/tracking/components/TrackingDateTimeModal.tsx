import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { formatDateOnly } from '../helpers';
import { trackingStyles as styles } from '../styles';
import TrackingModalShell from './TrackingModalShell';

type Props = {
  visible: boolean;
  fieldLabel: string;
  calendarDate: Date | null;
  timeInput: string;
  dateError: string | null;
  calendarComponent: React.ComponentType<any> | null;
  onClose: () => void;
  onChangeDate: (value: Date) => void;
  onChangeTimeInput: (value: string) => void;
  onApply: () => void;
  onOpenNativePicker: () => void;
};

export default function TrackingDateTimeModal({
  visible,
  fieldLabel,
  calendarDate,
  timeInput,
  dateError,
  calendarComponent: CalendarComponent,
  onClose,
  onChangeDate,
  onChangeTimeInput,
  onApply,
  onOpenNativePicker,
}: Props) {
  const footer = (
    <>
      <Pressable
        onPress={onClose}
        style={(state: any) => [
          styles.secondaryBtn,
          state?.hovered && styles.secondaryBtnHover,
          state?.pressed && styles.secondaryBtnPressed,
          { flex: 1 },
        ]}
      >
        <Text style={styles.secondaryBtnText}>Отмена</Text>
      </Pressable>
      <Pressable
        onPress={onApply}
        style={(state: any) => [
          styles.primaryBtn,
          state?.hovered && styles.primaryBtnHover,
          state?.pressed && styles.primaryBtnPressed,
          { flex: 1 },
        ]}
      >
        <Text style={styles.primaryBtnText}>Применить</Text>
      </Pressable>
    </>
  );

  return (
    <TrackingModalShell
      visible={visible}
      title={`Выбор даты и времени (${fieldLabel})`}
      onClose={onClose}
      footer={footer}
      compact
      bodyScroll
    >
      {Platform.OS === 'web' && CalendarComponent ? (
        <View style={styles.calendarContainer}>
          <CalendarComponent
            value={calendarDate || new Date()}
            onChange={(val: Date) => onChangeDate(val)}
          />
        </View>
      ) : Platform.OS === 'ios' ? (
        <View style={styles.calendarContainer}>
          <DateTimePicker
            value={calendarDate || new Date()}
            mode="datetime"
            display="inline"
            onChange={(_, date?: Date) => {
              if (!date) return;
              onChangeDate(date);
            }}
          />
        </View>
      ) : null}

      <Text style={styles.fieldLabel}>Дата</Text>
      <Pressable
        onPress={onOpenNativePicker}
        disabled={Platform.OS === 'web'}
        style={(state: any) => [
          styles.inputShell,
          state?.hovered && { borderColor: '#93C5FD' },
          state?.pressed && { opacity: 0.96 },
          Platform.OS === 'web' && styles.webDefaultCursor,
        ]}
      >
        <Ionicons name="calendar-outline" size={16} color="#64748B" />
        <Text style={styles.inputValue}>{formatDateOnly(calendarDate || new Date())}</Text>
      </Pressable>

      <Text style={styles.fieldLabel}>Время (чч:мм)</Text>
      <View style={styles.inputShell}>
        <Ionicons name="time-outline" size={16} color="#64748B" />
        <TextInput
          value={timeInput}
          onChangeText={(value) => onChangeTimeInput(value.replace(/[^\d:]/g, '').slice(0, 5))}
          keyboardType="numeric"
          placeholder="00:00"
          placeholderTextColor="#94A3B8"
          style={styles.textInput}
        />
      </View>

      {dateError ? <Text style={styles.errorText}>{dateError}</Text> : null}
    </TrackingModalShell>
  );
}
