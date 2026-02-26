import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export type AppealParticipantUser = {
  id?: number | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  department?: { id: number; name: string } | null;
  isAdmin?: boolean;
  isDepartmentManager?: boolean;
};

type ParticipantChipTone = 'gray';

export function getAppealParticipantInitials(user: AppealParticipantUser) {
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (first || last) {
    return `${first[0] || ''}${last[0] || first[1] || ''}`.toUpperCase();
  }
  const local = (user.email || '').split('@')[0];
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local.length === 1) return `${local}${local}`.toUpperCase();
  return 'U';
}

function getParticipantRoleChip(user: AppealParticipantUser): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ParticipantChipTone;
} {
  if (user.isAdmin) {
    return {
      label: 'Администратор',
      icon: 'shield-checkmark-outline',
      tone: 'gray',
    };
  }
  if (user.isDepartmentManager) {
    return {
      label: 'Руководитель отдела',
      icon: 'ribbon-outline',
      tone: 'gray',
    };
  }
  return {
    label: 'Сотрудник',
    icon: 'person-outline',
    tone: 'gray',
  };
}

function getParticipantRoleGradient(user: AppealParticipantUser): [string, string] {
  if (user.isAdmin) return ['#FDE68A', '#FCA5A5'];
  if (user.isDepartmentManager) return ['#FFEDD5', '#FED7AA'];
  return ['#E0E7FF', '#E9D5FF'];
}

function ParticipantChip({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: ParticipantChipTone;
}) {
  const palette = {
    gray: { bg: '#F3F4F6', bd: '#E5E7EB', text: '#374151' },
  }[tone];

  return (
    <View style={[styles.participantChip, { backgroundColor: palette.bg, borderColor: palette.bd }]}>
      <Ionicons name={icon} size={13} color={palette.text} />
      <Text style={[styles.participantChipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

type AppealParticipantCardProps = {
  user: AppealParticipantUser;
  displayName: string;
  presenceText: string;
  isOnline?: boolean;
  isCreator?: boolean;
  isAssignee?: boolean;
  showRoleTags?: boolean;
  rightSlot?: React.ReactNode;
  gradientColors?: [string, string];
  style?: StyleProp<ViewStyle>;
};

export function AppealParticipantCard({
  user,
  displayName,
  presenceText,
  isOnline = false,
  isCreator = false,
  isAssignee = false,
  showRoleTags = true,
  rightSlot,
  gradientColors,
  style,
}: AppealParticipantCardProps) {
  const initials = getAppealParticipantInitials(user);
  const roleChip = getParticipantRoleChip(user);
  const roleGradient = gradientColors || getParticipantRoleGradient(user);
  const departmentLabel = user.department?.name || 'Без отдела';

  return (
    <LinearGradient
      colors={roleGradient}
      start={{ x: 0, y: 0.35 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, style]}
    >
      <View style={styles.memberAvatarWrap}>
        <View style={styles.memberAvatar}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.memberAvatarImage} />
          ) : (
            <Text style={styles.memberInitials}>{initials}</Text>
          )}
        </View>
        <View
          style={[
            styles.memberAvatarPresence,
            { backgroundColor: isOnline ? '#22C55E' : '#94A3B8' },
          ]}
        />
      </View>

      <View style={styles.memberInfo}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>{displayName}</Text>
          {showRoleTags && (isCreator || isAssignee) ? (
            <View style={styles.memberTagRow}>
              {isCreator ? (
                <View style={[styles.memberTag, styles.memberTagCreator]}>
                  <Text style={[styles.memberTagText, styles.memberTagCreatorText]}>Создатель</Text>
                </View>
              ) : null}
              {isAssignee ? (
                <View style={[styles.memberTag, styles.memberTagAssignee]}>
                  <Text style={[styles.memberTagText, styles.memberTagAssigneeText]}>Исполнитель</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={styles.memberPresenceText}>{presenceText}</Text>

        <View style={styles.memberChipRow}>
          <ParticipantChip icon={roleChip.icon} label={roleChip.label} tone={roleChip.tone} />
          <ParticipantChip icon="business-outline" label={departmentLabel} tone="gray" />
        </View>
      </View>

      {rightSlot}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  memberAvatarWrap: {
    width: 42,
    height: 42,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  memberAvatarPresence: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInitials: {
    fontWeight: '700',
    color: '#1F2937',
    fontSize: 13,
  },
  memberInfo: {
    flex: 1,
    gap: 5,
  },
  memberNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 14,
    flexShrink: 1,
  },
  memberPresenceText: {
    fontSize: 12,
    color: '#64748B',
  },
  memberTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberTag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  memberTagCreator: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  memberTagAssignee: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  memberTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  memberTagCreatorText: {
    color: '#1E40AF',
  },
  memberTagAssigneeText: {
    color: '#166534',
  },
  memberChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  participantChipText: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 180,
  },
});

