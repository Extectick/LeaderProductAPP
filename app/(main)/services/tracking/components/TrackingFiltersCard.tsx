import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { DateField, Filters } from '../types';
import { trackingStyles as styles } from '../styles';

type Props = {
  filters: Filters;
  loadingRoutes: boolean;
  isMobileWeb: boolean;
  error?: string | null;
  formatDateTime: (value?: string | null) => string;
  onOpenPeriodCalendar: () => void;
  onOpenDatePicker: (field: DateField) => void;
  onChangeMaxAccuracy: (value: string) => void;
  onChangeMaxPoints: (value: string) => void;
  onResetFilters: () => void;
  onLoad: () => void;
};

export default function TrackingFiltersCard({
  filters,
  loadingRoutes,
  isMobileWeb,
  error,
  formatDateTime,
  onOpenPeriodCalendar,
  onOpenDatePicker,
  onChangeMaxAccuracy,
  onChangeMaxPoints,
  onResetFilters,
  onLoad,
}: Props) {
  const secondaryBtnStyle = (state: any) => [
    styles.secondaryBtn,
    state?.hovered && styles.secondaryBtnHover,
    state?.pressed && styles.secondaryBtnPressed,
  ];

  const primaryBtnStyle = (state: any) => [
    styles.primaryBtn,
    state?.hovered && styles.primaryBtnHover,
    state?.pressed && styles.primaryBtnPressed,
  ];

  return (
    <View style={styles.card}>
      <View style={styles.rowSpaceBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Параметры загрузки</Text>
          <Text style={styles.cardSubtitle}>
            Выберите период и ограничения точек. Логика фильтрации остается прежней.
          </Text>
        </View>
        <Pressable onPress={onOpenPeriodCalendar} style={secondaryBtnStyle}>
          <Ionicons name="calendar-outline" size={16} color="#1D4ED8" />
          <Text style={styles.secondaryBtnText}>Диапазон</Text>
        </Pressable>
      </View>

      <View style={styles.formGrid}>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>От</Text>
          <Pressable
            onPress={() => onOpenDatePicker('from')}
            style={(state: any) => [
              styles.inputShell,
              state?.hovered && { borderColor: '#93C5FD' },
              state?.pressed && { opacity: 0.96 },
            ]}
          >
            <Ionicons name="calendar-outline" size={16} color="#64748B" />
            <Text style={styles.inputValue} numberOfLines={1}>
              {filters.from ? formatDateTime(filters.from) : 'Выбрать дату и время'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>До</Text>
          <Pressable
            onPress={() => onOpenDatePicker('to')}
            style={(state: any) => [
              styles.inputShell,
              state?.hovered && { borderColor: '#93C5FD' },
              state?.pressed && { opacity: 0.96 },
            ]}
          >
            <Ionicons name="calendar-outline" size={16} color="#64748B" />
            <Text style={styles.inputValue} numberOfLines={1}>
              {filters.to ? formatDateTime(filters.to) : 'Выбрать дату и время'}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.formGrid}>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>Макс. точность (м)</Text>
          <View style={styles.inputShell}>
            <Ionicons name="locate-outline" size={16} color="#64748B" />
            <TextInput
              value={filters.maxAccuracy}
              onChangeText={onChangeMaxAccuracy}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor="#94A3B8"
              style={styles.textInput}
            />
          </View>
        </View>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>Макс. точек</Text>
          <View style={styles.inputShell}>
            <Ionicons name="list-outline" size={16} color="#64748B" />
            <TextInput
              value={filters.maxPoints}
              onChangeText={onChangeMaxPoints}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor="#94A3B8"
              style={styles.textInput}
            />
          </View>
        </View>
      </View>

      <View style={[styles.actionRow, isMobileWeb && { flexDirection: 'column' }]}>
        <Pressable onPress={onResetFilters} style={secondaryBtnStyle}>
          <Ionicons name="refresh-outline" size={16} color="#1D4ED8" />
          <Text style={styles.secondaryBtnText}>Сбросить</Text>
        </Pressable>
        <Pressable onPress={onLoad} style={primaryBtnStyle}>
          {loadingRoutes ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Загрузить</Text>
            </>
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
