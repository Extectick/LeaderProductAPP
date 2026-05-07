import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  IconButton,
  List,
  Portal,
  SegmentedButtons,
  Snackbar,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';

import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import type { AdminStyles } from '@/components/admin/adminStyles';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import {
  type Department,
  getDepartments,
  getRoles,
  type RoleItem,
} from '@/utils/userService';
import {
  createAdminService,
  deleteServiceDepartmentAccess,
  deleteServiceRoleAccess,
  getAdminServices,
  type ServiceAdminItem,
  type ServiceAdminCreateResult,
  type ServiceDepartmentRule,
  type ServiceDepartmentRoleRule,
  type ServiceKind,
  type ServiceRoleRule,
  updateService,
  upsertServiceDepartmentAccess,
  upsertServiceDepartmentRoleAccess,
  upsertServiceRoleAccess,
  deleteServiceDepartmentRoleAccess,
} from '@/utils/servicesService';

type ServicesTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
};

type ServiceFilter = 'all' | 'active' | 'inactive';
type RuleType = 'role' | 'department' | 'departmentRole';
type NullableRuleFlag = boolean | null;

type ServiceDraft = {
  name: string;
  kind: ServiceKind;
  route: string;
  icon: string;
  description: string;
  gradientStart: string;
  gradientEnd: string;
  isActive: boolean;
  defaultVisible: boolean;
  defaultEnabled: boolean;
};

type CreateDraft = ServiceDraft & {
  key: string;
  generatePermissionTemplate: boolean;
  permissionActions: string[];
};

type RulesDialogState = {
  serviceId: number;
  type: RuleType;
};

const SERVICE_PERMISSION_ACTION_OPTIONS = [
  { key: 'view', label: 'Просмотр' },
  { key: 'create', label: 'Создание' },
  { key: 'update', label: 'Изменение' },
  { key: 'delete', label: 'Удаление' },
  { key: 'export', label: 'Экспорт' },
];

const KIND_OPTIONS = [
  { value: 'CLOUD', label: 'Cloud' },
  { value: 'LOCAL', label: 'Local' },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'inactive', label: 'Отключенные' },
];

const EMPTY_DRAFT: ServiceDraft = {
  name: '',
  kind: 'CLOUD',
  route: '',
  icon: '',
  description: '',
  gradientStart: '',
  gradientEnd: '',
  isActive: true,
  defaultVisible: true,
  defaultEnabled: true,
};

const EMPTY_CREATE_DRAFT: CreateDraft = {
  ...EMPTY_DRAFT,
  key: '',
  generatePermissionTemplate: true,
  permissionActions: SERVICE_PERMISSION_ACTION_OPTIONS.map((option) => option.key),
};

export default function ServicesTab({ active, colors }: ServicesTabProps) {
  const { width } = useWindowDimensions();
  const tabBarSpacer = useTabBarSpacerHeight();
  const isDesktop = width >= 980;
  const localStyles = useMemo(() => makeLocalStyles(colors, isDesktop), [colors, isDesktop]);

  const [services, setServices] = useState<ServiceAdminItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ServiceFilter>('all');
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(EMPTY_DRAFT);
  const [detailDialogVisible, setDetailDialogVisible] = useState(false);
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(EMPTY_CREATE_DRAFT);
  const [rulesDialogState, setRulesDialogState] = useState<RulesDialogState | null>(null);
  const [ruleTargetId, setRuleTargetId] = useState<number | null>(null);
  const [ruleRoleTargetId, setRuleRoleTargetId] = useState<number | null>(null);
  const [ruleVisible, setRuleVisible] = useState<NullableRuleFlag>(null);
  const [ruleEnabled, setRuleEnabled] = useState<NullableRuleFlag>(null);
  const [snackbar, setSnackbar] = useState('');

  const roleNameById = useMemo(() => new Map(roles.map((role) => [role.id, getRoleDisplayName(role)])), [roles]);
  const departmentNameById = useMemo(() => new Map(departments.map((department) => [department.id, department.name])), [departments]);
  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) || null,
    [selectedServiceId, services]
  );
  const rulesService = useMemo(
    () => services.find((service) => service.id === rulesDialogState?.serviceId) || null,
    [rulesDialogState?.serviceId, services]
  );

  const filteredServices = useMemo(() => {
    const text = search.trim().toLowerCase();
    return services.filter((service) => {
      if (filter === 'active' && !service.isActive) return false;
      if (filter === 'inactive' && service.isActive) return false;
      if (!text) return true;
      return [service.name, service.key, service.route, service.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(text);
    });
  }, [filter, search, services]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [serviceList, roleList, departmentList] = await Promise.all([
        getAdminServices(),
        getRoles(),
        getDepartments(),
      ]);
      setServices(serviceList);
      setRoles(roleList);
      setDepartments(departmentList);
      setSelectedServiceId((current) => {
        if (current && serviceList.some((service) => service.id === current)) return current;
        return serviceList[0]?.id ?? null;
      });
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить сервисы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadData();
  }, [active, loadData]);

  useEffect(() => {
    if (!selectedService) return;
    setServiceDraft(serviceToDraft(selectedService));
  }, [selectedService]);

  const updateServiceInState = useCallback((updated: ServiceAdminItem) => {
    setServices((previous) => previous.map((service) => (service.id === updated.id ? updated : service)));
  }, []);

  const handleSelectService = useCallback(
    (service: ServiceAdminItem) => {
      setSelectedServiceId(service.id);
      setServiceDraft(serviceToDraft(service));
      if (!isDesktop) setDetailDialogVisible(true);
    },
    [isDesktop]
  );

  const handleSaveService = useCallback(async () => {
    if (!selectedService) return;
    setSaving(true);
    try {
      const updated = await updateService(selectedService.id, draftToPatch(serviceDraft));
      if (updated) {
        updateServiceInState(updated);
        setSnackbar('Сервис сохранен');
        if (!isDesktop) setDetailDialogVisible(false);
      }
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить сервис');
    } finally {
      setSaving(false);
    }
  }, [isDesktop, selectedService, serviceDraft, updateServiceInState]);

  const handleQuickPatch = useCallback(
    async (service: ServiceAdminItem, patch: Partial<ServiceDraft>) => {
      setSaving(true);
      try {
        const updated = await updateService(service.id, draftToPatch({ ...serviceToDraft(service), ...patch }));
        if (updated) {
          updateServiceInState(updated);
          setSnackbar('Сервис обновлен');
        }
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось обновить сервис');
      } finally {
        setSaving(false);
      }
    },
    [updateServiceInState]
  );

  const resetCreateDialog = useCallback(() => {
    setCreateDraft(EMPTY_CREATE_DRAFT);
    setCreateDialogVisible(false);
  }, []);

  const handleCreateService = useCallback(async () => {
    const key = createDraft.key.trim().toLowerCase();
    if (!key || !/^[a-z0-9_]+$/.test(key)) {
      Alert.alert('Ошибка', 'Ключ сервиса должен быть в формате lowercase snake_case');
      return;
    }
    if (!createDraft.name.trim()) {
      Alert.alert('Ошибка', 'Название сервиса обязательно');
      return;
    }
    if (createDraft.generatePermissionTemplate && !createDraft.permissionActions.length) {
      Alert.alert('Ошибка', 'Выберите хотя бы одно действие для шаблона прав');
      return;
    }

    setSaving(true);
    try {
      const result = await createAdminService({
        key,
        ...draftToPatch(createDraft),
        generatePermissionTemplate: createDraft.generatePermissionTemplate,
        permissionActions: createDraft.permissionActions,
      });
      await loadData();
      setSelectedServiceId(result.service.id);
      resetCreateDialog();
      setSnackbar(formatCreateResult(result));
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось создать сервис');
    } finally {
      setSaving(false);
    }
  }, [createDraft, loadData, resetCreateDialog]);

  const openRulesDialog = useCallback((service: ServiceAdminItem, type: RuleType = 'role') => {
    setRulesDialogState({ serviceId: service.id, type });
    const firstTargetId = type === 'role' ? roles[0]?.id ?? null : departments[0]?.id ?? null;
    const firstRoleTargetId = roles[0]?.id ?? null;
    setRuleTargetId(firstTargetId);
    setRuleRoleTargetId(type === 'departmentRole' ? firstRoleTargetId : null);
    const rule = getExistingRule(service, type, firstTargetId, firstRoleTargetId);
    setRuleVisible(rule?.visible ?? null);
    setRuleEnabled(rule?.enabled ?? null);
  }, [departments, roles]);

  const handleRuleTypeChange = useCallback(
    (type: RuleType) => {
      if (!rulesService) return;
      setRulesDialogState((previous) => previous ? { ...previous, type } : previous);
      const firstTargetId = type === 'role' ? roles[0]?.id ?? null : departments[0]?.id ?? null;
      const firstRoleTargetId = roles[0]?.id ?? null;
      setRuleTargetId(firstTargetId);
      setRuleRoleTargetId(type === 'departmentRole' ? firstRoleTargetId : null);
      const rule = getExistingRule(rulesService, type, firstTargetId, firstRoleTargetId);
      setRuleVisible(rule?.visible ?? null);
      setRuleEnabled(rule?.enabled ?? null);
    },
    [departments, roles, rulesService]
  );

  const handleRuleTargetChange = useCallback(
    (targetId: number) => {
      if (!rulesService || !rulesDialogState) return;
      setRuleTargetId(targetId);
      const rule = getExistingRule(rulesService, rulesDialogState.type, targetId, ruleRoleTargetId);
      setRuleVisible(rule?.visible ?? null);
      setRuleEnabled(rule?.enabled ?? null);
    },
    [ruleRoleTargetId, rulesDialogState, rulesService]
  );

  const handleRuleRoleTargetChange = useCallback(
    (roleId: number) => {
      if (!rulesService || !rulesDialogState) return;
      setRuleRoleTargetId(roleId);
      const rule = getExistingRule(rulesService, rulesDialogState.type, ruleTargetId, roleId);
      setRuleVisible(rule?.visible ?? null);
      setRuleEnabled(rule?.enabled ?? null);
    },
    [ruleTargetId, rulesDialogState, rulesService]
  );

  const updateRuleInState = useCallback((serviceId: number, type: RuleType, rule: ServiceRoleRule | ServiceDepartmentRule | ServiceDepartmentRoleRule) => {
    setServices((previous) => previous.map((service) => (
      service.id === serviceId ? mergeRuleIntoService(service, type, rule) : service
    )));
  }, []);

  const removeRuleFromState = useCallback((serviceId: number, type: RuleType, targetId: number, roleId?: number) => {
    setServices((previous) => previous.map((service) => {
      if (service.id !== serviceId) return service;
      if (type === 'role') {
        return { ...service, roleAccess: service.roleAccess.filter((rule) => rule.roleId !== targetId) };
      }
      if (type === 'departmentRole') {
        return {
          ...service,
          departmentRoleAccess: service.departmentRoleAccess.filter(
            (rule) => !(rule.departmentId === targetId && rule.roleId === roleId)
          ),
        };
      }
      return { ...service, departmentAccess: service.departmentAccess.filter((rule) => rule.departmentId !== targetId) };
    }));
  }, []);

  const handleSaveRule = useCallback(async () => {
    if (!rulesService || !rulesDialogState || !ruleTargetId) return;
    if (rulesDialogState.type === 'departmentRole' && !ruleRoleTargetId) return;
    setSaving(true);
    try {
      if (rulesDialogState.type === 'role') {
        const rule = await upsertServiceRoleAccess(rulesService.id, {
          roleId: ruleTargetId,
          visible: ruleVisible,
          enabled: ruleEnabled,
        });
        if (rule) updateRuleInState(rulesService.id, 'role', rule);
      } else if (rulesDialogState.type === 'department') {
        const rule = await upsertServiceDepartmentAccess(rulesService.id, {
          departmentId: ruleTargetId,
          visible: ruleVisible,
          enabled: ruleEnabled,
        });
        if (rule) updateRuleInState(rulesService.id, 'department', rule);
      } else {
        const rule = await upsertServiceDepartmentRoleAccess(rulesService.id, {
          departmentId: ruleTargetId,
          roleId: ruleRoleTargetId!,
          visible: ruleVisible,
          enabled: ruleEnabled,
        });
        if (rule) updateRuleInState(rulesService.id, 'departmentRole', rule);
      }
      setSnackbar('Правило доступа сохранено');
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить правило');
    } finally {
      setSaving(false);
    }
  }, [ruleEnabled, ruleRoleTargetId, ruleTargetId, ruleVisible, rulesDialogState, rulesService, updateRuleInState]);

  const handleDeleteRule = useCallback(
    async (targetId: number, type: RuleType = rulesDialogState?.type || 'role', roleId?: number) => {
      if (!rulesService) return;
      setSaving(true);
      try {
        if (type === 'role') {
          await deleteServiceRoleAccess(rulesService.id, targetId);
        } else if (type === 'departmentRole') {
          if (!roleId) return;
          await deleteServiceDepartmentRoleAccess(rulesService.id, targetId, roleId);
        } else {
          await deleteServiceDepartmentAccess(rulesService.id, targetId);
        }
        removeRuleFromState(rulesService.id, type, targetId, roleId);
        if (
          ruleTargetId === targetId &&
          rulesDialogState?.type === type &&
          (type !== 'departmentRole' || ruleRoleTargetId === roleId)
        ) {
          setRuleVisible(null);
          setRuleEnabled(null);
        }
        setSnackbar('Правило удалено');
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось удалить правило');
      } finally {
        setSaving(false);
      }
    },
    [removeRuleFromState, ruleRoleTargetId, ruleTargetId, rulesDialogState?.type, rulesService]
  );

  if (!active) return <View style={{ display: 'none' }} />;

  return (
    <View style={localStyles.root}>
      <View style={localStyles.toolbar}>
        <TextInput
          mode="outlined"
          dense
          value={search}
          onChangeText={setSearch}
          label="Поиск"
          placeholder="Название, key, route"
          left={<TextInput.Icon icon="magnify" />}
          style={localStyles.searchInput}
        />
        <SegmentedButtons
          value={filter}
          onValueChange={(value) => setFilter(value as ServiceFilter)}
          buttons={FILTER_OPTIONS}
          style={localStyles.filterSegment}
        />
        <View style={localStyles.toolbarActions}>
          <Button mode="outlined" icon="refresh" loading={loading} onPress={() => void loadData()}>
            Обновить
          </Button>
          <Button mode="contained" icon="plus" onPress={() => setCreateDialogVisible(true)}>
            Создать
          </Button>
        </View>
      </View>

      <View style={localStyles.content}>
        <ScrollView
          style={localStyles.list}
          contentContainerStyle={[localStyles.listContent, { paddingBottom: tabBarSpacer + 12 }]}
        >
          {loading ? <ActivityIndicator style={localStyles.loading} /> : null}
          {!loading && !filteredServices.length ? (
            <Card mode="outlined">
              <Card.Content>
                <Text variant="bodyMedium">Сервисы не найдены</Text>
              </Card.Content>
            </Card>
          ) : null}
          {filteredServices.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              selected={selectedServiceId === service.id}
              saving={saving}
              styles={localStyles}
              onPress={() => handleSelectService(service)}
              onOpenRules={() => openRulesDialog(service)}
              onToggleActive={(value) => void handleQuickPatch(service, { isActive: value })}
            />
          ))}
        </ScrollView>

        {isDesktop ? (
          <View style={localStyles.details}>
            {selectedService ? (
              <ServiceDetailsCard
                service={selectedService}
                draft={serviceDraft}
                saving={saving}
                styles={localStyles}
                onChange={setServiceDraft}
                onSave={() => void handleSaveService()}
                onOpenRules={() => openRulesDialog(selectedService)}
              />
            ) : (
              <Card mode="outlined">
                <Card.Content>
                  <Text variant="titleMedium">Выберите сервис</Text>
                  <Text variant="bodyMedium">Карточка редактирования появится справа.</Text>
                </Card.Content>
              </Card>
            )}
          </View>
        ) : null}
      </View>

      <CreateServiceDialog
        visible={createDialogVisible}
        draft={createDraft}
        saving={saving}
        styles={localStyles}
        onDismiss={resetCreateDialog}
        onChange={setCreateDraft}
        onCreate={() => void handleCreateService()}
      />

      <Portal>
        <Dialog visible={!isDesktop && detailDialogVisible} onDismiss={() => setDetailDialogVisible(false)} style={localStyles.dialog}>
          <Dialog.Title>Редактирование сервиса</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={localStyles.dialogContent}>
              {selectedService ? (
                <ServiceDetailsCard
                  service={selectedService}
                  draft={serviceDraft}
                  saving={saving}
                  styles={localStyles}
                  embedded
                  onChange={setServiceDraft}
                  onSave={() => void handleSaveService()}
                  onOpenRules={() => openRulesDialog(selectedService)}
                />
              ) : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDetailDialogVisible(false)}>Закрыть</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <RulesDialog
        state={rulesDialogState}
        service={rulesService}
        roles={roles}
        departments={departments}
        roleNameById={roleNameById}
        departmentNameById={departmentNameById}
        targetId={ruleTargetId}
        roleTargetId={ruleRoleTargetId}
        visibleFlag={ruleVisible}
        enabledFlag={ruleEnabled}
        saving={saving}
        styles={localStyles}
        onDismiss={() => setRulesDialogState(null)}
        onTypeChange={handleRuleTypeChange}
        onTargetChange={handleRuleTargetChange}
        onRoleTargetChange={handleRuleRoleTargetChange}
        onVisibleChange={setRuleVisible}
        onEnabledChange={setRuleEnabled}
        onSave={() => void handleSaveRule()}
        onDelete={(targetId, type, roleId) => void handleDeleteRule(targetId, type, roleId)}
      />

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar('')} duration={3500}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

function ServiceCard({
  service,
  selected,
  saving,
  styles,
  onPress,
  onOpenRules,
  onToggleActive,
}: {
  service: ServiceAdminItem;
  selected: boolean;
  saving: boolean;
  styles: ReturnType<typeof makeLocalStyles>;
  onPress: () => void;
  onOpenRules: () => void;
  onToggleActive: (value: boolean) => void;
}) {
  return (
    <Card mode="outlined" onPress={onPress} style={[styles.serviceCard, selected && styles.serviceCardSelected]}>
      <Card.Title
        title={service.name}
        subtitle={service.key}
        left={(props) => <List.Icon {...props} icon={service.icon || 'apps'} />}
        right={() => <IconButton icon="shield-key-outline" onPress={onOpenRules} />}
      />
      <Card.Content style={styles.serviceCardContent}>
        <View style={styles.chips}>
          <Chip compact mode="outlined">{service.kind}</Chip>
          <Chip compact mode={service.isActive ? 'flat' : 'outlined'}>
            {service.isActive ? 'Активен' : 'Отключен'}
          </Chip>
          <Chip compact mode="outlined">Роли: {service.roleAccess.length}</Chip>
          <Chip compact mode="outlined">Отделы: {service.departmentAccess.length}</Chip>
          <Chip compact mode="outlined">Отдел+роль: {service.departmentRoleAccess.length}</Chip>
        </View>
        {service.route ? <Text variant="bodySmall" numberOfLines={1}>{service.route}</Text> : null}
        {service.description ? <Text variant="bodySmall" numberOfLines={2}>{service.description}</Text> : null}
        <View style={styles.inlineSwitchRow}>
          <Text variant="bodyMedium">Активен</Text>
          <Switch disabled={saving} value={service.isActive} onValueChange={onToggleActive} />
        </View>
      </Card.Content>
    </Card>
  );
}

function ServiceDetailsCard({
  service,
  draft,
  saving,
  styles,
  embedded,
  onChange,
  onSave,
  onOpenRules,
}: {
  service: ServiceAdminItem;
  draft: ServiceDraft;
  saving: boolean;
  styles: ReturnType<typeof makeLocalStyles>;
  embedded?: boolean;
  onChange: React.Dispatch<React.SetStateAction<ServiceDraft>>;
  onSave: () => void;
  onOpenRules: () => void;
}) {
  const content = (
    <>
      <View style={styles.detailsHeader}>
        <View style={styles.detailsTitle}>
          <Text variant="titleMedium">{service.name}</Text>
          <Text variant="bodySmall">ID {service.id} | {service.key}</Text>
        </View>
        <Button mode="outlined" icon="shield-key-outline" onPress={onOpenRules}>
          Правила
        </Button>
      </View>
      <ServiceDraftForm draft={draft} saving={saving} styles={styles} onChange={onChange} />
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedDetails}>{content}</View>;
  }

  return (
    <Card mode="outlined" style={styles.detailsCard}>
      <Card.Content style={styles.detailsContent}>{content}</Card.Content>
      <Card.Actions>
        <Button mode="contained" icon="content-save" loading={saving} disabled={saving} onPress={onSave}>
          Сохранить
        </Button>
      </Card.Actions>
    </Card>
  );
}

function ServiceDraftForm({
  draft,
  saving,
  styles,
  onChange,
}: {
  draft: ServiceDraft;
  saving: boolean;
  styles: ReturnType<typeof makeLocalStyles>;
  onChange: React.Dispatch<React.SetStateAction<ServiceDraft>>;
}) {
  return (
    <View style={styles.form}>
      <TextInput
        mode="outlined"
        label="Название"
        value={draft.name}
        disabled={saving}
        onChangeText={(value) => onChange((state) => ({ ...state, name: value }))}
      />
      <SegmentedButtons
        value={draft.kind}
        onValueChange={(value) => onChange((state) => ({ ...state, kind: value as ServiceKind }))}
        buttons={KIND_OPTIONS}
      />
      <TextInput
        mode="outlined"
        label="Маршрут"
        value={draft.route}
        disabled={saving}
        autoCapitalize="none"
        onChangeText={(value) => onChange((state) => ({ ...state, route: value }))}
      />
      <TextInput
        mode="outlined"
        label="Иконка"
        value={draft.icon}
        disabled={saving}
        autoCapitalize="none"
        onChangeText={(value) => onChange((state) => ({ ...state, icon: value }))}
      />
      <TextInput
        mode="outlined"
        label="Описание"
        value={draft.description}
        disabled={saving}
        multiline
        onChangeText={(value) => onChange((state) => ({ ...state, description: value }))}
      />
      <View style={styles.twoColumns}>
        <TextInput
          mode="outlined"
          label="Gradient start"
          value={draft.gradientStart}
          disabled={saving}
          autoCapitalize="none"
          onChangeText={(value) => onChange((state) => ({ ...state, gradientStart: value }))}
          style={styles.flexField}
        />
        <TextInput
          mode="outlined"
          label="Gradient end"
          value={draft.gradientEnd}
          disabled={saving}
          autoCapitalize="none"
          onChangeText={(value) => onChange((state) => ({ ...state, gradientEnd: value }))}
          style={styles.flexField}
        />
      </View>
      <View style={styles.switchGrid}>
        <SwitchRow label="Активен" value={draft.isActive} disabled={saving} onChange={(value) => onChange((state) => ({ ...state, isActive: value }))} />
        <SwitchRow label="Видим по умолчанию" value={draft.defaultVisible} disabled={saving} onChange={(value) => onChange((state) => ({ ...state, defaultVisible: value }))} />
        <SwitchRow label="Доступен по умолчанию" value={draft.defaultEnabled} disabled={saving} onChange={(value) => onChange((state) => ({ ...state, defaultEnabled: value }))} />
      </View>
    </View>
  );
}

function CreateServiceDialog({
  visible,
  draft,
  saving,
  styles,
  onDismiss,
  onChange,
  onCreate,
}: {
  visible: boolean;
  draft: CreateDraft;
  saving: boolean;
  styles: ReturnType<typeof makeLocalStyles>;
  onDismiss: () => void;
  onChange: React.Dispatch<React.SetStateAction<CreateDraft>>;
  onCreate: () => void;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={saving ? undefined : onDismiss} style={styles.dialog}>
        <Dialog.Title>Создать сервис</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.dialogContent}>
            <TextInput
              mode="outlined"
              label="Ключ сервиса"
              value={draft.key}
              disabled={saving}
              autoCapitalize="none"
              onChangeText={(value) => onChange((state) => ({ ...state, key: value }))}
            />
            <ServiceDraftForm draft={draft} saving={saving} styles={styles} onChange={onChange as any} />
            <Divider />
            <SwitchRow
              label="Создать шаблон прав"
              value={draft.generatePermissionTemplate}
              disabled={saving}
              onChange={(value) => onChange((state) => ({ ...state, generatePermissionTemplate: value }))}
            />
            {draft.generatePermissionTemplate ? (
              <View style={styles.chips}>
                {SERVICE_PERMISSION_ACTION_OPTIONS.map((option) => {
                  const selected = draft.permissionActions.includes(option.key);
                  return (
                    <Chip
                      key={option.key}
                      selected={selected}
                      mode={selected ? 'flat' : 'outlined'}
                      onPress={() =>
                        onChange((state) => ({
                          ...state,
                          permissionActions: selected
                            ? state.permissionActions.filter((item) => item !== option.key)
                            : [...state.permissionActions, option.key],
                        }))
                      }
                    >
                      {option.label}
                    </Chip>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button disabled={saving} onPress={onDismiss}>Отмена</Button>
          <Button mode="contained" loading={saving} disabled={saving} onPress={onCreate}>Создать</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function RulesDialog({
  state,
  service,
  roles,
  departments,
  roleNameById,
  departmentNameById,
  targetId,
  roleTargetId,
  visibleFlag,
  enabledFlag,
  saving,
  styles,
  onDismiss,
  onTypeChange,
  onTargetChange,
  onRoleTargetChange,
  onVisibleChange,
  onEnabledChange,
  onSave,
  onDelete,
}: {
  state: RulesDialogState | null;
  service: ServiceAdminItem | null;
  roles: RoleItem[];
  departments: Department[];
  roleNameById: Map<number, string>;
  departmentNameById: Map<number, string>;
  targetId: number | null;
  roleTargetId: number | null;
  visibleFlag: NullableRuleFlag;
  enabledFlag: NullableRuleFlag;
  saving: boolean;
  styles: ReturnType<typeof makeLocalStyles>;
  onDismiss: () => void;
  onTypeChange: (type: RuleType) => void;
  onTargetChange: (targetId: number) => void;
  onRoleTargetChange: (roleId: number) => void;
  onVisibleChange: (value: NullableRuleFlag) => void;
  onEnabledChange: (value: NullableRuleFlag) => void;
  onSave: () => void;
  onDelete: (targetId: number, type: RuleType, roleId?: number) => void;
}) {
  const type = state?.type || 'role';
  const targets = type === 'role' ? roles : departments;
  const rules =
    type === 'role'
      ? service?.roleAccess || []
      : type === 'departmentRole'
        ? service?.departmentRoleAccess || []
        : service?.departmentAccess || [];

  return (
    <Portal>
      <Dialog visible={Boolean(state && service)} onDismiss={saving ? undefined : onDismiss} style={styles.dialog}>
        <Dialog.Title>Правила доступа</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView contentContainerStyle={styles.dialogContent}>
            <Text variant="titleSmall">{service?.name}</Text>
            <SegmentedButtons
              value={type}
              onValueChange={(value) => onTypeChange(value as RuleType)}
              buttons={[
                { value: 'role', label: 'Роли' },
                { value: 'department', label: 'Отделы' },
                { value: 'departmentRole', label: 'Отдел+роль' },
              ]}
            />
            <Text variant="titleSmall">Выберите {type === 'role' ? 'роль' : 'отдел'}</Text>
            <View style={styles.targetList}>
              {targets.map((target) => (
                <List.Item
                  key={target.id}
                  title={type === 'role' ? getRoleDisplayName(target as RoleItem) : (target as Department).name}
                  onPress={() => onTargetChange(target.id)}
                  left={(props) => <List.Icon {...props} icon={targetId === target.id ? 'radiobox-marked' : 'radiobox-blank'} />}
                />
              ))}
              {!targets.length ? <Text variant="bodyMedium">Нет доступных значений</Text> : null}
            </View>
            {type === 'departmentRole' ? (
              <>
                <Text variant="titleSmall">Выберите роль в отделе</Text>
                <View style={styles.targetList}>
                  {roles.map((role) => (
                    <List.Item
                      key={role.id}
                      title={getRoleDisplayName(role)}
                      onPress={() => onRoleTargetChange(role.id)}
                      left={(props) => <List.Icon {...props} icon={roleTargetId === role.id ? 'radiobox-marked' : 'radiobox-blank'} />}
                    />
                  ))}
                  {!roles.length ? <Text variant="bodyMedium">Нет доступных ролей</Text> : null}
                </View>
              </>
            ) : null}
            <Divider />
            <TriStateRow label="Видимость" value={visibleFlag} onChange={onVisibleChange} />
            <TriStateRow label="Доступность" value={enabledFlag} onChange={onEnabledChange} />
            <Button mode="contained" icon="content-save" loading={saving} disabled={!targetId || (type === 'departmentRole' && !roleTargetId) || saving} onPress={onSave}>
              Сохранить правило
            </Button>
            <Divider />
            <Text variant="titleSmall">Текущие правила</Text>
            {rules.map((rule) => {
              const id =
                type === 'role'
                  ? (rule as ServiceRoleRule).roleId
                  : type === 'departmentRole'
                    ? (rule as ServiceDepartmentRoleRule).departmentId
                    : (rule as ServiceDepartmentRule).departmentId;
              const roleId = type === 'departmentRole' ? (rule as ServiceDepartmentRoleRule).roleId : undefined;
              const title = type === 'role'
                ? roleNameById.get(id) || `Роль #${id}`
                : type === 'departmentRole'
                  ? `${departmentNameById.get(id) || `Отдел #${id}`} / ${roleNameById.get(roleId || 0) || `Роль #${roleId}`}`
                  : departmentNameById.get(id) || `Отдел #${id}`;
              return (
                <List.Item
                  key={rule.id}
                  title={title}
                  description={`Видимость: ${formatRuleFlag(rule.visible)} | Доступность: ${formatRuleFlag(rule.enabled)}`}
                  right={() => <IconButton icon="delete-outline" disabled={saving} onPress={() => onDelete(id, type, roleId)} />}
                />
              );
            })}
            {!rules.length ? <Text variant="bodyMedium">Правил пока нет</Text> : null}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button disabled={saving} onPress={onDismiss}>Закрыть</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function SwitchRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={staticStyles.switchRow}>
      <Text variant="bodyMedium">{label}</Text>
      <Switch disabled={disabled} value={value} onValueChange={onChange} />
    </View>
  );
}

function TriStateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: NullableRuleFlag;
  onChange: (value: NullableRuleFlag) => void;
}) {
  return (
    <View style={staticStyles.triStateRow}>
      <Text variant="bodyMedium">{label}</Text>
      <SegmentedButtons
        value={String(value)}
        onValueChange={(next) => onChange(parseRuleFlag(next))}
        buttons={[
          { value: 'null', label: 'По умолчанию' },
          { value: 'true', label: 'Да' },
          { value: 'false', label: 'Нет' },
        ]}
        style={staticStyles.triStateSegment}
      />
    </View>
  );
}

function serviceToDraft(service: ServiceAdminItem): ServiceDraft {
  return {
    name: service.name || '',
    kind: service.kind,
    route: service.route || '',
    icon: service.icon || '',
    description: service.description || '',
    gradientStart: service.gradientStart || '',
    gradientEnd: service.gradientEnd || '',
    isActive: service.isActive,
    defaultVisible: service.defaultVisible,
    defaultEnabled: service.defaultEnabled,
  };
}

function draftToPatch(draft: ServiceDraft) {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    route: nullableText(draft.route),
    icon: nullableText(draft.icon),
    description: nullableText(draft.description),
    gradientStart: nullableText(draft.gradientStart),
    gradientEnd: nullableText(draft.gradientEnd),
    isActive: draft.isActive,
    defaultVisible: draft.defaultVisible,
    defaultEnabled: draft.defaultEnabled,
  };
}

function nullableText(value: string) {
  const text = value.trim();
  return text || null;
}

function getExistingRule(service: ServiceAdminItem, type: RuleType, targetId: number | null, roleId?: number | null) {
  if (!targetId) return null;
  if (type === 'role') {
    return service.roleAccess.find((rule) => rule.roleId === targetId) || null;
  }
  if (type === 'departmentRole') {
    if (!roleId) return null;
    return service.departmentRoleAccess.find((rule) => rule.departmentId === targetId && rule.roleId === roleId) || null;
  }
  return service.departmentAccess.find((rule) => rule.departmentId === targetId) || null;
}

function mergeRuleIntoService(
  service: ServiceAdminItem,
  type: RuleType,
  rule: ServiceRoleRule | ServiceDepartmentRule | ServiceDepartmentRoleRule
): ServiceAdminItem {
  if (type === 'role') {
    const nextRule = rule as ServiceRoleRule;
    return {
      ...service,
      roleAccess: mergeRule(service.roleAccess, nextRule, (item) => item.roleId === nextRule.roleId),
    };
  }
  if (type === 'departmentRole') {
    const nextRule = rule as ServiceDepartmentRoleRule;
    return {
      ...service,
      departmentRoleAccess: mergeRule(
        service.departmentRoleAccess,
        nextRule,
        (item) => item.departmentId === nextRule.departmentId && item.roleId === nextRule.roleId
      ),
    };
  }
  const nextRule = rule as ServiceDepartmentRule;
  return {
    ...service,
    departmentAccess: mergeRule(service.departmentAccess, nextRule, (item) => item.departmentId === nextRule.departmentId),
  };
}

function mergeRule<T>(items: T[], nextItem: T, match: (item: T) => boolean) {
  const index = items.findIndex(match);
  if (index === -1) return [...items, nextItem];
  return items.map((item, currentIndex) => (currentIndex === index ? nextItem : item));
}

function parseRuleFlag(value: string): NullableRuleFlag {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function formatRuleFlag(value: NullableRuleFlag) {
  if (value === true) return 'да';
  if (value === false) return 'нет';
  return 'по умолчанию';
}

function formatCreateResult(result: ServiceAdminCreateResult) {
  const permissions = result.createdPermissions || [];
  if (!permissions.length) return 'Сервис создан без шаблона прав';
  return `Сервис создан. Права: ${permissions.map((permission) => permission.name).join(', ')}`;
}

const staticStyles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triStateRow: {
    gap: 6,
  },
  triStateSegment: {
    flexWrap: 'wrap',
  },
});

function makeLocalStyles(colors: any, isDesktop: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      minHeight: 0,
      gap: 8,
    },
    toolbar: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 3,
      backgroundColor: colors.cardBackground,
      padding: 8,
      gap: 8,
    },
    searchInput: {
      backgroundColor: colors.inputBackground,
    },
    filterSegment: {
      maxWidth: isDesktop ? 520 : undefined,
    },
    toolbarActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-end',
    },
    content: {
      flex: 1,
      minHeight: 0,
      flexDirection: isDesktop ? 'row' : 'column',
      gap: 8,
    },
    list: {
      flex: 1,
      minHeight: 0,
    },
    listContent: {
      gap: 6,
    },
    details: {
      width: 430,
      minHeight: 0,
    },
    detailsCard: {
      flex: 1,
      backgroundColor: colors.cardBackground,
      borderRadius: 3,
    },
    detailsContent: {
      gap: 8,
    },
    detailsHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    detailsTitle: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    embeddedDetails: {
      gap: 8,
    },
    serviceCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 3,
    },
    serviceCardSelected: {
      borderColor: colors.tint,
      backgroundColor: `${colors.tint}08`,
    },
    serviceCardContent: {
      gap: 6,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    inlineSwitchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    form: {
      gap: 8,
    },
    twoColumns: {
      flexDirection: isDesktop ? 'row' : 'column',
      gap: 8,
    },
    flexField: {
      flex: 1,
    },
    switchGrid: {
      gap: 4,
    },
    dialog: {
      width: '92%',
      maxWidth: 780,
      maxHeight: '88%' as any,
      alignSelf: 'center',
      backgroundColor: colors.cardBackground,
      borderRadius: 3,
    },
    dialogContent: {
      gap: 8,
      paddingVertical: 6,
    },
    targetList: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 3,
      overflow: 'hidden',
    },
    loading: {
      marginVertical: 20,
    },
  });
}
