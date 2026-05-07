import React from 'react';
import { View } from 'react-native';
import { Avatar, Card, Chip, Text, TouchableRipple } from 'react-native-paper';
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
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onAvatarPress?: () => void;
  showAdminBadges?: boolean;
  showChannels?: boolean;
  showActions?: boolean;
  footerSlot?: React.ReactNode;
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
  onAvatarPress,
  showAdminBadges = true,
  showChannels = true,
  showActions = true,
  footerSlot,
}: Props) {
  const moderation = moderationTone(item.moderationState);
  const online = onlineTone(item.isOnline);
  const displayName = nameOf(item);
  const roleName = getRoleDisplayName(item.role);
  const departmentName = item.departmentName || 'Без отдела';
  const emailOrPhone = item.email || formatPhone(item.phone) || 'Нет контактов';
  const activityText = item.isOnline ? 'Онлайн сейчас' : formatLastSeen(item.lastSeenAt);

  return (
    <View style={styles.rowWrap}>
      <Card
        mode="outlined"
        onPress={selectable ? onSelect : undefined}
        style={[styles.paperUserCard, selectable && isSelected ? styles.paperUserCardSelected : null]}
        contentStyle={styles.paperUserCardInner}
      >
        <Card.Content style={styles.paperUserCardInner}>
          <View style={styles.rowHeader}>
            <Text variant="labelMedium" style={styles.rowId}>#{item.id}</Text>
            <Text variant="labelSmall" style={styles.rowTime}>{shortTime(item.lastSeenAt)}</Text>
          </View>

          {showAdminBadges ? (
            <View style={styles.tagRow}>
              <Chip compact mode="outlined" textStyle={[styles.tagText, { color: moderation.text }]} style={[styles.paperChip, { backgroundColor: moderation.bg, borderColor: moderation.border }]}>
                {moderationLabel(item.moderationState)}
              </Chip>
              <Chip compact mode="outlined" textStyle={[styles.tagText, { color: '#9A3412' }]} style={[styles.paperChip, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}>
                {roleName}
              </Chip>
              <Chip compact mode="outlined" textStyle={[styles.tagText, { color: online.text }]} style={[styles.paperChip, { backgroundColor: online.bg, borderColor: online.border }]}>
                {online.textValue}
              </Chip>
            </View>
          ) : null}

          <View style={styles.summaryRow}>
            <TouchableRipple
              borderless
              style={styles.avatarWrap}
              onPress={(event) => {
                event.stopPropagation?.();
                onAvatarPress?.();
              }}
            >
              <View>
                {item.avatarUrl ? (
                  <Avatar.Image source={{ uri: item.avatarUrl }} size={44} />
                ) : (
                  <Avatar.Text label={initialsOf(item)} size={44} />
                )}
                <View style={[styles.onlineDot, { backgroundColor: item.isOnline ? '#22C55E' : '#94A3B8' }]} />
              </View>
            </TouchableRipple>

            <View style={styles.rowMainTextWrap}>
              <Text numberOfLines={1} variant="titleSmall" style={styles.rowName}>
                {displayName} <Text style={styles.rowNameMeta}>• {departmentName}</Text>
              </Text>
              <Text numberOfLines={1} variant="bodySmall" style={styles.rowMetaLine}>
                {emailOrPhone}
              </Text>
              <Text numberOfLines={1} variant="bodySmall" style={styles.rowMetaLine}>
                {activityText}
              </Text>
            </View>
          </View>

          {showChannels ? <Text variant="bodySmall" style={styles.channelsText}>Каналы: {channelLabel(item)}</Text> : null}
          {footerSlot}
          {showActions && onApprove && onReject && onEdit ? (
            <UsersModerationActions
              item={item}
              styles={styles}
              actionBusy={actionBusy}
              onApprove={onApprove}
              onReject={onReject}
              onEdit={onEdit}
            />
          ) : null}
        </Card.Content>
      </Card>
    </View>
  );
}
