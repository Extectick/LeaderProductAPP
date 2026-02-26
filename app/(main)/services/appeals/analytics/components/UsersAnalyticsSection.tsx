import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { UsersListItemCard } from '@/app/(main)/admin/tabs/UsersListItemCard';
import { getServiceGridMetrics } from '@/src/features/services/lib/grid';
import type { AdminUsersListItem } from '@/utils/userService';
import type {
  AppealsAnalyticsAppealItem,
  AppealsAnalyticsMeta,
  AppealsAnalyticsUsersSummaryItem,
} from '@/src/entities/appeal/types';
import { analyticsStyles as styles } from '../styles';
import { appealStatusLabel, formatHoursValue, formatRub } from '../helpers';

type Props = {
  usersAsAdminItems: AdminUsersListItem[];
  users: AppealsAnalyticsUsersSummaryItem[];
  selectedUserId: number | null;
  selectedUserAppeals: AppealsAnalyticsAppealItem[];
  loadingUsers: boolean;
  loadingSelectedUserAppeals: boolean;
  usersCardStyles: any;
  meta: AppealsAnalyticsMeta | null;
  onSelectUser: (userId: number) => void;
  onSaveHourlyRate: (userId: number, hourlyRateRub: number) => Promise<void>;
  onRefresh: () => void;
};

export function UsersAnalyticsSection({
  usersAsAdminItems,
  users,
  selectedUserId,
  selectedUserAppeals,
  loadingUsers,
  loadingSelectedUserAppeals,
  usersCardStyles,
  meta,
  onSelectUser,
  onSaveHourlyRate,
  onRefresh,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [listWidth, setListWidth] = React.useState(0);
  const [rateDrafts, setRateDrafts] = React.useState<Record<number, string>>({});
  const [rateSaving, setRateSaving] = React.useState<Record<number, boolean>>({});
  const [rateError, setRateError] = React.useState<Record<number, string | null>>({});
  const [rateSuccess, setRateSuccess] = React.useState<Record<number, boolean>>({});

  const resolvedListWidth = listWidth > 0 ? listWidth : windowWidth;
  const isMobileWeb = Platform.OS === 'web' && windowWidth < 920;
  const isMobileWidth = windowWidth <= 820;
  const gridMetrics = React.useMemo(
    () =>
      getServiceGridMetrics({
        width: isMobileWidth ? windowWidth : resolvedListWidth,
        platform: Platform.OS === 'web' ? 'web' : 'native',
        isMobileLayout: isMobileWidth,
      }),
    [isMobileWidth, resolvedListWidth, windowWidth]
  );
  const columns = React.useMemo(
    () => (isMobileWeb ? 1 : Math.max(1, Math.min(3, gridMetrics.columns))),
    [gridMetrics.columns, isMobileWeb]
  );
  const contentMaxWidth = isMobileWidth ? undefined : gridMetrics.maxContentWidth;
  const cardWidth = React.useMemo(() => {
    const baseWidth = contentMaxWidth ? Math.min(resolvedListWidth, contentMaxWidth) : resolvedListWidth;
    const inner = Math.max(0, baseWidth - gridMetrics.horizontalPadding * 2);
    const raw = Math.floor((inner - gridMetrics.gap * (columns - 1)) / columns);
    const min = columns === 1 ? 280 : 180;
    const max = columns === 1 ? 760 : columns === 2 ? 540 : 460;
    const preferred = Math.max(min, Math.min(max, raw));
    return Math.min(raw, preferred);
  }, [columns, contentMaxWidth, gridMetrics.gap, gridMetrics.horizontalPadding, resolvedListWidth]);

  const inputModeProps = React.useMemo(() => {
    if (Platform.OS !== 'web') return {};
    return {
      inputMode: 'numeric' as const,
      autoComplete: 'off' as const,
    };
  }, []);

  React.useEffect(() => {
    setRateDrafts((prev) => {
      const next = { ...prev };
      for (const row of users) {
        if (next[row.user.id] == null) {
          const raw = row.user.hourlyRateRub == null ? '0' : String(Math.max(0, Math.trunc(Number(row.user.hourlyRateRub))));
          next[row.user.id] = raw;
        }
      }
      return next;
    });
  }, [users]);

  const manageableDepartmentIds = React.useMemo(
    () => new Set((meta?.availableDepartments || []).map((dep) => dep.id)),
    [meta?.availableDepartments]
  );

  const parseRateValue = React.useCallback((value: string | number | null | undefined) => {
    const digits = String(value ?? '0').replace(/[^\d]/g, '');
    if (!digits) return 0;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }, []);

  const getCurrentRate = React.useCallback(
    (userId: number) => {
      const current = users.find((row) => row.user.id === userId)?.user.hourlyRateRub ?? 0;
      return Math.max(0, Math.trunc(Number(current)));
    },
    [users]
  );

  const isRateDirty = React.useCallback(
    (userId: number) => {
      const parsed = parseRateValue(rateDrafts[userId]);
      if (parsed == null) return true;
      return parsed !== getCurrentRate(userId);
    },
    [getCurrentRate, parseRateValue, rateDrafts]
  );

  const canEditHourlyRate = React.useCallback(
    (userId: number) => {
      const row = users.find((u) => u.user.id === userId);
      if (!row) return false;
      if (meta?.role?.isAdmin) return true;
      if (!meta?.role?.isDepartmentManager) return false;
      const depId = row.user.department?.id;
      if (!depId) return false;
      return manageableDepartmentIds.has(depId);
    },
    [manageableDepartmentIds, meta?.role?.isAdmin, meta?.role?.isDepartmentManager, users]
  );

  const saveRate = React.useCallback(
    async (userId: number) => {
      const parsed = parseRateValue(rateDrafts[userId]);
      if (parsed == null) {
        setRateError((prev) => ({ ...prev, [userId]: 'Укажите ставку >= 0' }));
        setRateSuccess((prev) => ({ ...prev, [userId]: false }));
        return;
      }
      setRateSaving((prev) => ({ ...prev, [userId]: true }));
      setRateError((prev) => ({ ...prev, [userId]: null }));
      setRateSuccess((prev) => ({ ...prev, [userId]: false }));
      try {
        await onSaveHourlyRate(userId, parsed);
        setRateSuccess((prev) => ({ ...prev, [userId]: true }));
      } catch (error: any) {
        setRateError((prev) => ({ ...prev, [userId]: error?.message || 'Ошибка сохранения' }));
      } finally {
        setRateSaving((prev) => ({ ...prev, [userId]: false }));
      }
    },
    [onSaveHourlyRate, parseRateValue, rateDrafts]
  );

  return (
    <View
      style={styles.usersGridContainer}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (Math.abs(nextWidth - listWidth) > 1) {
          setListWidth(nextWidth);
        }
      }}
    >
      <FlatList
        key={`users-grid-${columns}`}
        data={usersAsAdminItems}
        keyExtractor={(item) => String(item.id)}
        numColumns={columns}
        columnWrapperStyle={
          columns > 1 ? [styles.usersGridColumn, { columnGap: gridMetrics.gap, justifyContent: 'flex-start' }] : undefined
        }
        contentContainerStyle={[
          styles.usersGridContent,
          {
            maxWidth: contentMaxWidth,
            paddingHorizontal: gridMetrics.horizontalPadding,
            rowGap: gridMetrics.gap,
          },
        ]}
        refreshControl={<RefreshControl refreshing={loadingUsers} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const row = users.find((u) => u.user.id === item.id);
          const stats = row?.stats;
          const canEditRate = canEditHourlyRate(item.id);
          const isSavingRate = !!rateSaving[item.id];
          const showSaveButton = canEditRate && isRateDirty(item.id);
          return (
            <View
              style={[
                styles.usersGridItem,
                { width: cardWidth },
                columns === 1 ? styles.usersGridItemSingle : null,
              ]}
            >
              <UsersListItemCard
                item={item}
                styles={usersCardStyles}
                selectable
                isSelected={selectedUserId === item.id}
                actionBusy={false}
                onSelect={() => onSelectUser(item.id)}
                showAdminBadges={false}
                showChannels={false}
                showActions={false}
                footerSlot={
                  <View>
                    <Text style={styles.cardSub}>Обращений: {stats?.appealsCount ?? 0} | Часы: {formatHoursValue(stats?.accruedHours ?? 0)}</Text>
                    <Text style={styles.cardSub}>
                      Оплачено: {stats?.paidAppealsCount ?? 0} | Частично: {stats?.partialAppealsCount ?? 0} | Не оплачено: {stats?.unpaidAppealsCount ?? 0} | Не требуется: {stats?.notRequiredAppealsCount ?? 0}
                    </Text>
                    <Text style={styles.cardSub}>
                      Начислено: {formatHoursValue(stats?.accruedHours ?? 0)} / {formatRub(stats?.accruedAmountRub ?? 0)}
                    </Text>
                    <Text style={styles.cardSub}>
                      Выплачено: {formatHoursValue(stats?.paidHours ?? 0)} / {formatRub(stats?.paidAmountRub ?? 0)}
                    </Text>
                    <Text style={styles.cardSub}>
                      Остаток: {formatHoursValue(stats?.remainingHours ?? 0)} / {formatRub(stats?.remainingAmountRub ?? 0)}
                    </Text>
                    <View style={styles.userRateRow}>
                      <View style={styles.userRateInputBlock}>
                        <Text style={styles.filterLabel}>Ставка сотрудника (₽/ч)</Text>
                        <View style={styles.userRateInputRow}>
                          <TextInput
                            value={rateDrafts[item.id] ?? '0'}
                            onChangeText={(value) => {
                              const numericOnly = value.replace(/[^\d]/g, '');
                              setRateDrafts((prev) => ({ ...prev, [item.id]: numericOnly }));
                              setRateSuccess((prev) => ({ ...prev, [item.id]: false }));
                              setRateError((prev) => ({ ...prev, [item.id]: null }));
                            }}
                            style={[styles.input, styles.userRateInput, !canEditRate && styles.inputDisabled]}
                            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                            editable={canEditRate && !isSavingRate}
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                            {...(inputModeProps as any)}
                          />
                          {showSaveButton ? (
                            <Pressable
                              onPress={() => {
                                void saveRate(item.id);
                              }}
                              disabled={isSavingRate}
                              style={(state: any) => [
                                styles.rateSaveBtn,
                                state?.hovered && styles.rateSaveBtnHover,
                                state?.pressed && styles.rateSaveBtnPressed,
                                isSavingRate && styles.rateSaveBtnDisabled,
                              ]}
                            >
                              {isSavingRate ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                              )}
                            </Pressable>
                          ) : null}
                        </View>
                        <Text style={styles.userRateHint}>
                          Эффективная ставка: {formatRub(row?.user.effectiveHourlyRateRub ?? 0)} /ч
                        </Text>
                        {rateError[item.id] ? <Text style={styles.rateErrorText}>{rateError[item.id]}</Text> : null}
                        {rateSuccess[item.id] ? <Text style={styles.rateSuccessText}>Сохранено</Text> : null}
                      </View>
                    </View>
                  </View>
                }
              />
            </View>
          );
        }}
        ListFooterComponent={
          selectedUserId ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Обращения исполнителя</Text>
              {loadingSelectedUserAppeals ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                (selectedUserAppeals || []).map((appeal) => (
                  <Text key={appeal.id} style={styles.cardSub}>
                    #{appeal.number} • {appeal.title || 'Без названия'} • {appealStatusLabel(appeal.status)}
                  </Text>
                ))
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}
