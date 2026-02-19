import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AdminStyles } from '@/components/admin/adminStyles';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { Department, getDepartments, getRoles, RoleItem } from '@/utils/userService';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import {
  createAdminService,
  deleteServiceDepartmentAccess,
  deleteServiceRoleAccess,
  getAdminServices,
  ServiceAdminItem,
  ServiceDepartmentRule,
  ServiceKind,
  ServiceRoleRule,
  updateService,
  upsertServiceDepartmentAccess,
  upsertServiceRoleAccess,
} from '@/utils/servicesService';

type ServicesTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
};

type RuleType = 'role' | 'department';

const SERVICE_PERMISSION_ACTION_OPTIONS = [
  { key: 'view', label: 'Просмотр' },
  { key: 'create', label: 'Создание' },
  { key: 'update', label: 'Изменение' },
  { key: 'delete', label: 'Удаление' },
  { key: 'export', label: 'Экспорт' },
];

const SERVICE_KIND_OPTIONS: Array<{ value: ServiceKind; label: string }> = [
  { value: 'CLOUD', label: 'Cloud' },
  { value: 'LOCAL', label: 'Local' },
];

export default function ServicesTab({ active, styles, colors }: ServicesTabProps) {
  const tabBarSpacer = useTabBarSpacerHeight();
  const [services, setServices] = useState<ServiceAdminItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);

  const [ruleModal, setRuleModal] = useState<ServiceAdminItem | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>('role');
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [ruleVisible, setRuleVisible] = useState(true);
  const [ruleEnabled, setRuleEnabled] = useState(true);

  const [newServiceKey, setNewServiceKey] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceRoute, setNewServiceRoute] = useState('');
  const [newServiceIcon, setNewServiceIcon] = useState('');
  const [newServiceDescription, setNewServiceDescription] = useState('');
  const [newServiceKind, setNewServiceKind] = useState<ServiceKind>('CLOUD');
  const [newServiceIsActive, setNewServiceIsActive] = useState(true);
  const [newServiceDefaultVisible, setNewServiceDefaultVisible] = useState(true);
  const [newServiceDefaultEnabled, setNewServiceDefaultEnabled] = useState(true);
  const [generatePermissionTemplate, setGeneratePermissionTemplate] = useState(true);
  const [selectedPermissionActions, setSelectedPermissionActions] = useState<string[]>(
    SERVICE_PERMISSION_ACTION_OPTIONS.map((x) => x.key)
  );

  const localStyles = useMemo(() => makeLocalStyles(colors), [colors]);

  const roleMap = useMemo(
    () => new Map(roles.map((r) => [r.id, getRoleDisplayName(r)])),
    [roles]
  );
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [svc, r, d] = await Promise.all([getAdminServices(), getRoles(), getDepartments()]);
      setServices(svc);
      setRoles(r);
      setDepartments(d);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить сервисы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadData();
  }, [active, loadData]);

  const handleUpdateService = async (serviceId: number, patch: Partial<ServiceAdminItem>) => {
    try {
      const updated = await updateService(serviceId, patch);
      if (!updated) return;
      setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, ...updated } : s)));
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить сервис');
    }
  };

  const handleCreateService = async () => {
    const key = newServiceKey.trim().toLowerCase();
    const name = newServiceName.trim();
    if (!key || !/^[a-z0-9_]+$/.test(key)) {
      Alert.alert('Ошибка', 'Ключ сервиса должен быть в формате lowercase snake_case');
      return;
    }
    if (!name) {
      Alert.alert('Ошибка', 'Название сервиса обязательно');
      return;
    }
    if (generatePermissionTemplate && !selectedPermissionActions.length) {
      Alert.alert('Ошибка', 'Выберите хотя бы одно действие для шаблона прав');
      return;
    }

    try {
      const created = await createAdminService({
        key,
        name,
        kind: newServiceKind,
        route: newServiceRoute.trim() || null,
        icon: newServiceIcon.trim() || null,
        description: newServiceDescription.trim() || null,
        isActive: newServiceIsActive,
        defaultVisible: newServiceDefaultVisible,
        defaultEnabled: newServiceDefaultEnabled,
        generatePermissionTemplate,
        permissionActions: selectedPermissionActions,
      });
      setNewServiceKey('');
      setNewServiceName('');
      setNewServiceRoute('');
      setNewServiceIcon('');
      setNewServiceDescription('');
      setNewServiceKind('CLOUD');
      setGeneratePermissionTemplate(true);
      setSelectedPermissionActions(SERVICE_PERMISSION_ACTION_OPTIONS.map((x) => x.key));
      await loadData();

      const createdPermNames = (created?.createdPermissions || []).map((p) => p.name);
      Alert.alert(
        'Сервис создан',
        createdPermNames.length
          ? `Созданы права: ${createdPermNames.join(', ')}`
          : 'Сервис создан без шаблона прав'
      );
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось создать сервис');
    }
  };

  const syncRuleFromSelection = useCallback(
    (service: ServiceAdminItem | null, type: RuleType, roleId: number | null, deptId: number | null) => {
      if (!service) return;
      if (type === 'role' && roleId) {
        const rule = service.roleAccess.find((r) => r.roleId === roleId) || null;
        setRuleVisible(rule?.visible ?? true);
        setRuleEnabled(rule?.enabled ?? true);
        return;
      }
      if (type === 'department' && deptId) {
        const rule = service.departmentAccess.find((r) => r.departmentId === deptId) || null;
        setRuleVisible(rule?.visible ?? true);
        setRuleEnabled(rule?.enabled ?? true);
      }
    },
    []
  );

  const openRuleModal = (service: ServiceAdminItem) => {
    setRuleModal(service);
    setRuleType('role');
    const firstRole = roles[0]?.id ?? null;
    const firstDept = departments[0]?.id ?? null;
    setSelectedRoleId(firstRole);
    setSelectedDepartmentId(firstDept);
    setRuleVisible(true);
    setRuleEnabled(true);
    syncRuleFromSelection(service, 'role', firstRole, firstDept);
  };

  const handleSaveRule = async () => {
    if (!ruleModal) return;
    try {
      if (ruleType === 'role') {
        if (!selectedRoleId) return;
        const rule = await upsertServiceRoleAccess(ruleModal.id, {
          roleId: selectedRoleId,
          visible: ruleVisible,
          enabled: ruleEnabled,
        });
        if (rule) {
          setServices((prev) =>
            {
              const next = prev.map((s) =>
                s.id === ruleModal.id
                  ? {
                      ...s,
                      roleAccess: mergeRule(s.roleAccess, rule, (r) => r.roleId === rule.roleId),
                    }
                  : s
              );
              const updated = next.find((s) => s.id === ruleModal.id) || null;
              if (updated) setRuleModal(updated);
              return next;
            }
          );
        }
      } else {
        if (!selectedDepartmentId) return;
        const rule = await upsertServiceDepartmentAccess(ruleModal.id, {
          departmentId: selectedDepartmentId,
          visible: ruleVisible,
          enabled: ruleEnabled,
        });
        if (rule) {
          setServices((prev) =>
            {
              const next = prev.map((s) =>
                s.id === ruleModal.id
                  ? {
                      ...s,
                      departmentAccess: mergeRule(
                        s.departmentAccess,
                        rule,
                        (r) => r.departmentId === rule.departmentId
                      ),
                    }
                  : s
              );
              const updated = next.find((s) => s.id === ruleModal.id) || null;
              if (updated) setRuleModal(updated);
              return next;
            }
          );
        }
      }
      Alert.alert('Готово', 'Правило сохранено');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось сохранить правило');
    }
  };

  const handleDeleteRule = async (serviceId: number, rule: ServiceRoleRule | ServiceDepartmentRule, type: RuleType) => {
    try {
      if (type === 'role') {
        await deleteServiceRoleAccess(serviceId, (rule as ServiceRoleRule).roleId);
        setServices((prev) =>
          {
            const next = prev.map((s) =>
              s.id === serviceId
                ? { ...s, roleAccess: s.roleAccess.filter((r) => r.roleId !== (rule as ServiceRoleRule).roleId) }
                : s
            );
            const updated = next.find((s) => s.id === serviceId) || null;
            if (updated) setRuleModal(updated);
            return next;
          }
        );
      } else {
        await deleteServiceDepartmentAccess(serviceId, (rule as ServiceDepartmentRule).departmentId);
        setServices((prev) =>
          {
            const next = prev.map((s) =>
              s.id === serviceId
                ? {
                    ...s,
                    departmentAccess: s.departmentAccess.filter(
                      (r) => r.departmentId !== (rule as ServiceDepartmentRule).departmentId
                    ),
                  }
                : s
            );
            const updated = next.find((s) => s.id === serviceId) || null;
            if (updated) setRuleModal(updated);
            return next;
          }
        );
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось удалить правило');
    }
  };

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: tabBarSpacer + 12 }}>
        <View style={styles.toolbarCard}>
          <View style={{ gap: 8 }}>
            <TextInput
              placeholder="Ключ сервиса (например, orders)"
              value={newServiceKey}
              onChangeText={setNewServiceKey}
              style={styles.input}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Название сервиса"
              value={newServiceName}
              onChangeText={setNewServiceName}
              style={styles.input}
            />
            <TextInput
              placeholder="Маршрут (например, /services/orders)"
              value={newServiceRoute}
              onChangeText={setNewServiceRoute}
              style={styles.input}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Иконка Ionicons (например, cube-outline)"
              value={newServiceIcon}
              onChangeText={setNewServiceIcon}
              style={styles.input}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Описание"
              value={newServiceDescription}
              onChangeText={setNewServiceDescription}
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.secondaryText }}>Тип сервиса</Text>
              {SERVICE_KIND_OPTIONS.map((option) => {
                const activeKind = newServiceKind === option.value;
                return (
                  <Pressable
                    key={`service-kind-new-${option.value}`}
                    onPress={() => setNewServiceKind(option.value)}
                    style={[styles.optionChip, activeKind && styles.optionChipActive]}
                  >
                    <Text style={[styles.optionText, activeKind && styles.optionTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <ToggleRow label="Активен" value={newServiceIsActive} onChange={setNewServiceIsActive} colors={colors} />
              <ToggleRow label="Видим по умолчанию" value={newServiceDefaultVisible} onChange={setNewServiceDefaultVisible} colors={colors} />
              <ToggleRow label="Доступен по умолчанию" value={newServiceDefaultEnabled} onChange={setNewServiceDefaultEnabled} colors={colors} />
            </View>
            <ToggleRow
              label="Создать шаблон прав"
              value={generatePermissionTemplate}
              onChange={setGeneratePermissionTemplate}
              colors={colors}
            />
            {generatePermissionTemplate ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SERVICE_PERMISSION_ACTION_OPTIONS.map((option) => {
                  const activeOption = selectedPermissionActions.includes(option.key);
                  return (
                    <Pressable
                      key={`service-action-${option.key}`}
                      onPress={() =>
                        setSelectedPermissionActions((prev) =>
                          prev.includes(option.key)
                            ? prev.filter((x) => x !== option.key)
                            : [...prev, option.key]
                        )
                      }
                      style={[styles.optionChip, activeOption && styles.optionChipActive]}
                    >
                      <Text style={[styles.optionText, activeOption && styles.optionTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.tint }]} onPress={handleCreateService}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Создать сервис</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator />
        ) : (
          services.map((service) => (
            <View key={service.id} style={styles.itemRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.nameText} numberOfLines={2}>
                  {service.name}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Tag text={service.key} colors={colors} />
                  <Tag text={`Тип: ${service.kind}`} colors={colors} />
                  {service.route ? <Tag text={service.route} colors={colors} /> : null}
                </View>
              </View>

              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {SERVICE_KIND_OPTIONS.map((option) => {
                    const activeKind = service.kind === option.value;
                    return (
                      <Pressable
                        key={`service-kind-${service.id}-${option.value}`}
                        onPress={() => handleUpdateService(service.id, { kind: option.value })}
                        style={[styles.optionChip, activeKind && styles.optionChipActive]}
                      >
                        <Text style={[styles.optionText, activeKind && styles.optionTextActive]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <ToggleRow
                  label="Видим"
                  value={service.defaultVisible}
                  onChange={(value) => handleUpdateService(service.id, { defaultVisible: value })}
                  colors={colors}
                />
                <ToggleRow
                  label="Доступен"
                  value={service.defaultEnabled}
                  onChange={(value) => handleUpdateService(service.id, { defaultEnabled: value })}
                  colors={colors}
                />
                <ToggleRow
                  label="Активен"
                  value={service.isActive}
                  onChange={(value) => handleUpdateService(service.id, { isActive: value })}
                  colors={colors}
                />
                <TouchableOpacity
                  style={[styles.iconBtn, { alignSelf: 'flex-end' }]}
                  onPress={() => openRuleModal(service)}
                >
                  <Ionicons name="options-outline" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={active && !!ruleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRuleModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setRuleModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View
            style={[
              styles.modalCard,
              { maxHeight: '85%', width: '90%', maxWidth: 720, backgroundColor: colors.cardBackground },
            ]}
          >
            <Text style={styles.title}>Правила сервиса {ruleModal?.name}</Text>

            <View style={styles.segmentGroup}>
              <Pressable
                onPress={() => {
                  setRuleType('role');
                  syncRuleFromSelection(ruleModal, 'role', selectedRoleId, selectedDepartmentId);
                }}
                style={[styles.segment, ruleType === 'role' && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, ruleType === 'role' && styles.segmentTextActive]}>Роли</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setRuleType('department');
                  syncRuleFromSelection(ruleModal, 'department', selectedRoleId, selectedDepartmentId);
                }}
                style={[styles.segment, ruleType === 'department' && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, ruleType === 'department' && styles.segmentTextActive]}>Отделы</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Выбор {ruleType === 'role' ? 'роли' : 'отдела'}</Text>
            <View style={localStyles.modalList}>
              <ScrollView style={{ maxHeight: 180 }}>
                {(ruleType === 'role' ? roles : departments).map((item) => {
                  const id = ruleType === 'role' ? (item as RoleItem).id : (item as Department).id;
                  const label =
                    ruleType === 'role'
                      ? getRoleDisplayName(item as RoleItem)
                      : (item as Department).name;
                  const activeItem =
                    ruleType === 'role' ? selectedRoleId === id : selectedDepartmentId === id;
                  return (
                    <Pressable
                      key={`${ruleType}-${id}`}
                      onPress={() => {
                        if (ruleType === 'role') setSelectedRoleId(id);
                        else setSelectedDepartmentId(id);
                        syncRuleFromSelection(ruleModal, ruleType, ruleType === 'role' ? id : selectedRoleId, ruleType === 'department' ? id : selectedDepartmentId);
                      }}
                      style={[localStyles.modalListItem, activeItem && localStyles.modalListItemActive]}
                    >
                      <Text style={[localStyles.modalListText, activeItem && localStyles.modalListTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
                {!roles.length && ruleType === 'role' ? <Text style={styles.subtitle}>Нет ролей</Text> : null}
                {!departments.length && ruleType === 'department' ? <Text style={styles.subtitle}>Нет отделов</Text> : null}
              </ScrollView>
            </View>

            <View style={{ gap: 8 }}>
              <ToggleRow label="Видим" value={ruleVisible} onChange={setRuleVisible} colors={colors} />
              <ToggleRow label="Доступен" value={ruleEnabled} onChange={setRuleEnabled} colors={colors} />
            </View>

            <TouchableOpacity style={[styles.modalClose, { backgroundColor: colors.tint }]} onPress={handleSaveRule}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Сохранить правило</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Текущие правила</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {(ruleType === 'role' ? ruleModal?.roleAccess : ruleModal?.departmentAccess)?.map((rule) => {
                const label =
                  ruleType === 'role'
                    ? roleMap.get((rule as ServiceRoleRule).roleId) || `Роль #${(rule as ServiceRoleRule).roleId}`
                    : deptMap.get((rule as ServiceDepartmentRule).departmentId) ||
                      `Отдел #${(rule as ServiceDepartmentRule).departmentId}`;
                return (
                  <View key={`${ruleType}-rule-${rule.id}`} style={localStyles.ruleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={localStyles.ruleTitle} numberOfLines={2}>
                        {label}
                      </Text>
                      <View style={localStyles.ruleTags}>
                        <Tag text={`Видим: ${formatRuleFlag(rule.visible)}`} colors={colors} />
                        <Tag text={`Доступен: ${formatRuleFlag(rule.enabled)}`} colors={colors} />
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.iconBtnDanger}
                      onPress={() => handleDeleteRule(ruleModal!.id, rule as any, ruleType)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                );
              })}
              {!((ruleType === 'role' ? ruleModal?.roleAccess : ruleModal?.departmentAccess) || []).length ? (
                <Text style={styles.subtitle}>Нет правил</Text>
              ) : null}
            </ScrollView>

            <TouchableOpacity style={styles.modalClose} onPress={() => setRuleModal(null)}>
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  colors: any;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.secondaryText }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function Tag({ text, colors }: { text: string; colors: any }) {
  return (
    <View style={[stylesLocalStatic.tag, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
      <Text style={[stylesLocalStatic.tagText, { color: colors.secondaryText }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function formatRuleFlag(value: boolean | null) {
  if (value === true) return 'да';
  if (value === false) return 'нет';
  return 'по умолчанию';
}

function mergeRule<T>(list: T[], rule: T, match: (item: T) => boolean) {
  const idx = list.findIndex(match);
  if (idx === -1) return [...list, rule];
  return list.map((item, i) => (i === idx ? rule : item));
}

const stylesLocalStatic = StyleSheet.create({
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  tagText: { fontSize: 11, fontWeight: '700', color: '#374151' },
});

const makeLocalStyles = (colors: any) =>
  StyleSheet.create({
    modalList: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      backgroundColor: colors.inputBackground,
      padding: 6,
      marginBottom: 10,
    },
    modalListItem: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    modalListItemActive: {
      backgroundColor: colors.tint + '22',
    },
    modalListText: {
      fontWeight: '700',
      color: colors.text,
    },
    modalListTextActive: {
      color: colors.tint,
    },
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      marginBottom: 8,
    },
    ruleTitle: { fontWeight: '700', color: colors.text },
    ruleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  });
