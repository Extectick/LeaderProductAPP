import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { trackingStyles as styles } from '../styles';

type Props = {
  selectedUserLabel: string;
  canViewOthers: boolean;
  onOpenPicker: () => void;
};

export default function TrackingUserCard({ selectedUserLabel, canViewOthers, onOpenPicker }: Props) {
  const pickerBtnStyle = (state: any) => [
    styles.inputShell,
    state?.pressed && { opacity: 0.96 },
    state?.hovered && { borderColor: '#93C5FD', backgroundColor: '#F8FAFF' },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Пользователь</Text>
      <Pressable
        onPress={onOpenPicker}
        disabled={!canViewOthers}
        style={(state: any) => [pickerBtnStyle(state), !canViewOthers && { opacity: 0.65 }]}
      >
        <Ionicons name="person-circle-outline" size={18} color="#475569" />
        <Text style={styles.inputValue} numberOfLines={1}>
          {selectedUserLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#64748B" />
      </Pressable>
      {!canViewOthers ? (
        <Text style={styles.mutedText}>Вы можете просматривать только собственные треки.</Text>
      ) : null}
    </View>
  );
}
