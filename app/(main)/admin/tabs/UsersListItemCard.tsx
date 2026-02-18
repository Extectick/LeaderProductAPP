import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import type { AdminUsersListItem } from '@/utils/userService';
import {
  channelLabel,
  formatLastSeen,
  formatPhone,
  initialsOf,
  moderationLabel,
  moderationTone,
  nameOf,
  onlineTone,
  shortTime,
} from './usersTab.helpers';
import { UsersModerationActions } from './UsersModerationActions';

type Props = {
  item: AdminUsersListItem;
  styles: any;
  selectable?: boolean;
  isSelected?: boolean;
  actionBusy: boolean;
  onSelect?: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
};

export function UsersListItemCard({
  item,
  styles,
  selectable = true,
  isSelected = false,
  actionBusy,
  onSelect,
  onApprove,
  onReject,
  onEdit,
}: Props) {
  const moderation = moderationTone(item.moderationState);
  const online = onlineTone(item.isOnline);
  const displayName = nameOf(item);
  const roleName = getRoleDisplayName(item.role);
  const departmentName = item.departmentName || 'Без отдела';
  const emailOrPhone = item.email || formatPhone(item.phone) || 'Нет контактов';
  const activityText = item.isOnline ? 'Онлайн сейчас' : formatLastSeen(item.lastSeenAt);
  return (
    <Pressable onPress={selectable ? onSelect : undefined}>
      <View style={styles.rowWrap}>
        <View style={[styles.row, selectable && isSelected ? styles.rowSelected : null]}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowId}>#{item.id}</Text>
            <Text style={styles.rowTime}>{shortTime(item.lastSeenAt)}</Text>
          </View>

          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: moderation.bg, borderColor: moderation.border }]}>
              <Text style={[styles.tagText, { color: moderation.text }]}>{moderationLabel(item.moderationState)}</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}>
              <Text style={[styles.tagText, { color: '#9A3412' }]}>{roleName}</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: online.bg, borderColor: online.border }]}>
              <Text style={[styles.tagText, { color: online.text }]}>{online.textValue}</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.avatarWrap}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initialsOf(item)}</Text>
                </View>
              )}
              <View style={[styles.onlineDot, { backgroundColor: item.isOnline ? '#22C55E' : '#94A3B8' }]} />
            </View>

            <View style={styles.rowMainTextWrap}>
              <Text numberOfLines={1} style={styles.rowName}>
                {displayName} <Text style={styles.rowNameMeta}>• {departmentName}</Text>
              </Text>
              <Text numberOfLines={1} style={styles.rowMetaLine}>
                {emailOrPhone}
              </Text>
              <Text numberOfLines={1} style={styles.rowMetaLine}>
                {activityText}
              </Text>
            </View>
          </View>

          <Text style={styles.channelsText}>Каналы: {channelLabel(item)}</Text>

          <UsersModerationActions
            item={item}
            styles={styles}
            actionBusy={actionBusy}
            onApprove={onApprove}
            onReject={onReject}
            onEdit={onEdit}
          />
        </View>
      </View>
    </Pressable>
  );
}
