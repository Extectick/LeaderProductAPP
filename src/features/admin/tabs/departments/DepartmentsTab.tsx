import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import {
  DepartmentAccessCatalogItem,
  getDepartmentAccessCatalog,
  replaceDepartmentAccessCatalog,
} from '@/utils/servicesService';
import {
  AdminUserItem,
  createDepartment,
  deleteDepartment,
  Department,
  getDepartmentUsers,
  getDepartments,
  getRoles,
  RoleItem,
  updateDepartment,
} from '@/utils/userService';
import { formatPhoneDisplay } from '@/utils/phone';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Dialog,
  Divider,
  IconButton,
  Chip,
  List,
  Portal,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';

type DepartmentsTabProps = {
  active: boolean;
  styles: any;
  colors: any;
  onOpenUser: (userId: number) => void;
};

type ConfirmDelete = {
  id: number;
  name: string;
} | null;

export default function DepartmentsTab({ active, colors, onOpenUser }: DepartmentsTabProps) {
  const tabBarSpacer = useTabBarSpacerHeight();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [deptUsersModal, setDeptUsersModal] = useState<{ id: number; name: string } | null>(null);
  const [deptUsers, setDeptUsers] = useState<AdminUserItem[]>([]);
  const [deptAccessModal, setDeptAccessModal] = useState<{ id: number; name: string } | null>(null);
  const [deptAccessRoleId, setDeptAccessRoleId] = useState<number | null>(null);
  const [deptAccessServices, setDeptAccessServices] = useState<DepartmentAccessCatalogItem[]>([]);
  const [deptAccessLoading, setDeptAccessLoading] = useState(false);
  const [deptAccessSaving, setDeptAccessSaving] = useState(false);
  const [deptUsersLoading, setDeptUsersLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete>(null);

  const paperStyles = useMemo(
    () => ({
      scrollContent: { gap: 12, paddingBottom: tabBarSpacer + 12 },
      formCard: { borderRadius: 14 },
      formContent: { gap: 10 },
      row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
      list: { gap: 8 },
      deptCard: { borderRadius: 14 },
      deptContent: { gap: 8 },
      userCard: { borderRadius: 12, marginBottom: 8 },
      muted: { color: colors.secondaryText },
      error: { color: '#B91C1C' },
      empty: { alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 24 },
    }),
    [colors.secondaryText, tabBarSpacer]
  );

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDepartments(await getDepartments());
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить отделы');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      setRoles(await getRoles());
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить роли');
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadDepartments();
    void loadRoles();
  }, [active, loadDepartments, loadRoles]);

  useEffect(() => {
    if (!deptUsersModal) {
      setDeptUsers([]);
      return;
    }

    setDeptUsersLoading(true);
    getDepartmentUsers(deptUsersModal.id)
      .then(setDeptUsers)
      .catch((err: any) => setError(err?.message || 'Не удалось загрузить пользователей отдела'))
      .finally(() => setDeptUsersLoading(false));
  }, [deptUsersModal]);

  useEffect(() => {
    if (!deptAccessModal) {
      setDeptAccessServices([]);
      setDeptAccessRoleId(null);
      return;
    }

    setDeptAccessLoading(true);
    getDepartmentAccessCatalog(deptAccessModal.id, deptAccessRoleId)
      .then((result) => setDeptAccessServices(result.services || []))
      .catch((err: any) =>
        setError(err?.message || 'Не удалось загрузить настройки доступа сервисов')
      )
      .finally(() => setDeptAccessLoading(false));
  }, [deptAccessModal, deptAccessRoleId]);

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  const applyDepartmentsResult = (result: Department[] | unknown, fallback: () => Department[]) => {
    if (Array.isArray(result) && result.length > 1) {
      setDepartments(result);
      return;
    }
    setDepartments(fallback());
  };

  const handleCreateDepartment = async () => {
    const name = newDeptName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await createDepartment(name);
      applyDepartmentsResult(updated, () => [
        ...departments,
        ...(Array.isArray(updated) && updated.length === 1 ? updated : [{ id: Date.now(), name } as Department]),
      ]);
      setNewDeptName('');
    } catch (err: any) {
      setError(err?.message || 'Не удалось создать отдел');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDepartment = async () => {
    if (!editDeptId || saving) return;
    const name = editDeptName.trim();
    if (!name || departments.find((item) => item.id === editDeptId)?.name === name) {
      setEditDeptId(null);
      setEditDeptName('');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateDepartment(editDeptId, name);
      applyDepartmentsResult(updated, () =>
        departments.map((department) => (department.id === editDeptId ? { ...department, name } : department))
      );
      setEditDeptId(null);
      setEditDeptName('');
    } catch (err: any) {
      setError(err?.message || 'Не удалось обновить отдел');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDepartment = async () => {
    if (!confirmDelete || saving) return;
    const target = confirmDelete;
    setSaving(true);
    setError(null);
    try {
      const updated = await deleteDepartment(target.id);
      applyDepartmentsResult(updated, () => departments.filter((department) => department.id !== target.id));
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err?.message || 'Не удалось удалить отдел');
    } finally {
      setSaving(false);
    }
  };

  const updateDeptAccessRule = (
    serviceId: number,
    field: 'visible' | 'enabled',
    value: boolean | null
  ) => {
    setDeptAccessServices((previous) =>
      previous.map((service) => {
        if (service.id !== serviceId) return service;
        if (deptAccessRoleId == null) {
          const nextVisible =
            field === 'visible' ? value : service.departmentRule?.visible ?? null;
          const nextEnabledRaw =
            field === 'enabled' ? value : service.departmentRule?.enabled ?? null;
          return {
            ...service,
            departmentRule: {
              id: service.departmentRule?.id || 0,
              departmentId: service.departmentRule?.departmentId || deptAccessModal?.id || 0,
              visible: nextVisible,
              enabled: nextVisible === false && nextEnabledRaw === true ? false : nextEnabledRaw,
            },
          };
        }
        const nextVisible = field === 'visible' ? value : service.departmentRoleRule?.visible ?? null;
        const nextEnabledRaw =
          field === 'enabled' ? value : service.departmentRoleRule?.enabled ?? null;
        return {
          ...service,
          departmentRoleRule: {
            id: service.departmentRoleRule?.id || 0,
            departmentId:
              service.departmentRoleRule?.departmentId || deptAccessModal?.id || 0,
            roleId: service.departmentRoleRule?.roleId || deptAccessRoleId,
            visible: nextVisible,
            enabled: nextVisible === false && nextEnabledRaw === true ? false : nextEnabledRaw,
          },
        };
      })
    );
  };

  const handleSaveDepartmentAccess = async () => {
    if (!deptAccessModal || deptAccessSaving) return;
    setDeptAccessSaving(true);
    setError(null);
    try {
      const result = await replaceDepartmentAccessCatalog(deptAccessModal.id, {
        roleId: deptAccessRoleId,
        rules: deptAccessServices
          .map((service) => {
            const rule = deptAccessRoleId == null ? service.departmentRule : service.departmentRoleRule;
            const visible = rule?.visible ?? null;
            const enabled =
              visible === false && rule?.enabled === true ? false : (rule?.enabled ?? null);
            return {
              serviceId: service.id,
              visible,
              enabled,
            };
          })
          .filter((rule) => rule.visible !== null || rule.enabled !== null),
      });
      setDeptAccessServices(result.services || []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить настройки доступа сервисов');
    } finally {
      setDeptAccessSaving(false);
    }
  };

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={paperStyles.scrollContent}>
        <Card mode="outlined" style={paperStyles.formCard}>
          <Card.Content style={paperStyles.formContent}>
            <Text variant="titleMedium">Отделы</Text>
            {error ? <Text style={paperStyles.error}>{error}</Text> : null}
            <View style={paperStyles.row}>
              <TextInput
                mode="outlined"
                label="Новый отдел"
                value={newDeptName}
                onChangeText={setNewDeptName}
                style={{ flex: 1 }}
                onSubmitEditing={handleCreateDepartment}
              />
              <Button
                mode="contained"
                icon="plus"
                loading={saving}
                disabled={saving || !newDeptName.trim()}
                onPress={handleCreateDepartment}
              >
                Добавить
              </Button>
            </View>
          </Card.Content>
        </Card>

        {loading ? (
          <Surface mode="flat" style={paperStyles.empty}>
            <ActivityIndicator />
            <Text style={paperStyles.muted}>Загружаем отделы</Text>
          </Surface>
        ) : departments.length ? (
          <View style={paperStyles.list}>
            {departments.map((department) => {
              const editing = editDeptId === department.id;
              return (
                <Card key={department.id} mode="outlined" style={paperStyles.deptCard}>
                  <Card.Content style={paperStyles.deptContent}>
                    <View style={paperStyles.row}>
                      {editing ? (
                        <TextInput
                          mode="outlined"
                          label="Название отдела"
                          value={editDeptName}
                          onChangeText={setEditDeptName}
                          style={{ flex: 1 }}
                          autoFocus
                          onSubmitEditing={handleUpdateDepartment}
                        />
                      ) : (
                        <List.Item
                          title={department.name}
                          description="Нажмите, чтобы открыть пользователей отдела"
                          left={(props) => <List.Icon {...props} icon="domain" />}
                          onPress={() => setDeptUsersModal({ id: department.id, name: department.name })}
                          style={{ flex: 1 }}
                        />
                      )}
                      {editing ? (
                        <IconButton icon="check" mode="contained-tonal" disabled={saving} onPress={handleUpdateDepartment} />
                      ) : (
                        <IconButton
                          icon="apps"
                          mode="contained-tonal"
                          onPress={() => {
                            setDeptAccessRoleId(null);
                            setDeptAccessModal({ id: department.id, name: department.name });
                          }}
                        />
                      )}
                      {editing ? null : (
                        <IconButton
                          icon="pencil-outline"
                          mode="contained-tonal"
                          onPress={() => {
                            setEditDeptId(department.id);
                            setEditDeptName(department.name);
                          }}
                        />
                      )}
                      <IconButton
                        icon="trash-can-outline"
                        mode="contained-tonal"
                        iconColor="#DC2626"
                        onPress={() => setConfirmDelete({ id: department.id, name: department.name })}
                      />
                    </View>
                  </Card.Content>
                </Card>
              );
            })}
          </View>
        ) : (
          <Surface mode="flat" style={paperStyles.empty}>
            <List.Icon icon="domain-off" />
            <Text>Отделы не найдены</Text>
          </Surface>
        )}
      </ScrollView>

      <Portal>
        <Dialog visible={Boolean(deptUsersModal)} onDismiss={() => setDeptUsersModal(null)}>
          <Dialog.Title>{deptUsersModal?.name || 'Пользователи отдела'}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              {deptUsersLoading ? (
                <View style={paperStyles.empty}>
                  <ActivityIndicator />
                  <Text style={paperStyles.muted}>Загружаем пользователей</Text>
                </View>
              ) : deptUsers.length ? (
                deptUsers.map((user) => (
                  <Card key={user.id} mode="outlined" style={paperStyles.userCard}>
                    <List.Item
                      title={`${user.lastName || ''} ${user.firstName || ''}`.trim() || user.email || `ID ${user.id}`}
                      description={[
                        user.phone ? formatPhoneDisplay(user.phone) : null,
                        user.role ? getRoleDisplayName(user.role as any) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      left={(props) => <List.Icon {...props} icon="account-outline" />}
                      right={(props) => (
                        <IconButton
                          {...props}
                          icon="open-in-new"
                          onPress={() => {
                            setDeptUsersModal(null);
                            onOpenUser(user.id);
                          }}
                        />
                      )}
                    />
                  </Card>
                ))
              ) : (
                <View style={paperStyles.empty}>
                  <List.Icon icon="account-off-outline" />
                  <Text style={paperStyles.muted}>В отделе нет пользователей</Text>
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDeptUsersModal(null)}>Закрыть</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={Boolean(deptAccessModal)}
          onDismiss={() => (deptAccessSaving ? undefined : setDeptAccessModal(null))}
          style={{ maxHeight: '90%' }}
        >
          <Dialog.Title>
            {deptAccessModal ? `Сервисы отдела: ${deptAccessModal.name}` : 'Сервисы отдела'}
          </Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 12 }}>
              <View style={{ gap: 8 }}>
                <Text variant="bodyMedium">
                  Общие правила отдела настраиваются отдельно от правил для роли внутри отдела.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Chip
                    selected={deptAccessRoleId == null}
                    onPress={() => setDeptAccessRoleId(null)}
                    icon="account-group-outline"
                  >
                    Все сотрудники
                  </Chip>
                  {roles.map((role) => (
                    <Chip
                      key={role.id}
                      selected={deptAccessRoleId === role.id}
                      onPress={() => setDeptAccessRoleId(role.id)}
                      icon="shield-account-outline"
                    >
                      {getRoleDisplayName(role)}
                    </Chip>
                  ))}
                </ScrollView>
              </View>

              {deptAccessLoading ? (
                <View style={paperStyles.empty}>
                  <ActivityIndicator />
                  <Text style={paperStyles.muted}>Загружаем сервисы</Text>
                </View>
              ) : deptAccessServices.length ? (
                deptAccessServices.map((service) => {
                  const activeRule =
                    deptAccessRoleId == null ? service.departmentRule : service.departmentRoleRule;
                  return (
                    <Card key={`dept-service-${service.id}`} mode="outlined" style={paperStyles.userCard}>
                      <Card.Content style={{ gap: 10 }}>
                        <View style={{ gap: 4 }}>
                          <Text variant="titleSmall">{service.name}</Text>
                          <Text style={paperStyles.muted}>
                            {service.key} • База: видимость {formatRuleFlag(service.defaultVisible)}, доступ {formatRuleFlag(service.defaultEnabled)}
                          </Text>
                          {deptAccessRoleId != null ? (
                            <Text style={paperStyles.muted}>
                              Правило отдела: видимость {formatRuleFlag(service.departmentRule?.visible)}, доступ {formatRuleFlag(service.departmentRule?.enabled)}
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ gap: 8 }}>
                          <Text variant="bodyMedium">Видимость</Text>
                          <RuleFlagSelector
                            value={activeRule?.visible ?? null}
                            onChange={(value) => updateDeptAccessRule(service.id, 'visible', value)}
                          />
                        </View>

                        <View style={{ gap: 8 }}>
                          <Text variant="bodyMedium">Доступность</Text>
                          <RuleFlagSelector
                            value={activeRule?.enabled ?? null}
                            onChange={(value) => updateDeptAccessRule(service.id, 'enabled', value)}
                          />
                        </View>
                      </Card.Content>
                    </Card>
                  );
                })
              ) : (
                <View style={paperStyles.empty}>
                  <Text style={paperStyles.muted}>Сервисы не найдены</Text>
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button disabled={deptAccessSaving} onPress={() => setDeptAccessModal(null)}>
              Закрыть
            </Button>
            <Button
              mode="contained"
              loading={deptAccessSaving}
              disabled={deptAccessSaving || deptAccessLoading}
              onPress={handleSaveDepartmentAccess}
            >
              Сохранить
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={Boolean(confirmDelete)} onDismiss={() => (saving ? undefined : setConfirmDelete(null))}>
          <Dialog.Title>Удалить отдел?</Dialog.Title>
          <Dialog.Content>
            <Text>Отдел "{confirmDelete?.name}" будет удален. Действие необратимо.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={saving} onPress={() => setConfirmDelete(null)}>Отмена</Button>
            <Button
              mode="contained"
              buttonColor="#DC2626"
              loading={saving}
              disabled={saving}
              onPress={handleDeleteDepartment}
            >
              Удалить
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function formatRuleFlag(value: boolean | null | undefined) {
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  return 'Наследовать';
}

function RuleFlagSelector({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      <Chip selected={value === null} onPress={() => onChange(null)}>
        Наследовать
      </Chip>
      <Chip selected={value === true} onPress={() => onChange(true)}>
        Да
      </Chip>
      <Chip selected={value === false} onPress={() => onChange(false)}>
        Нет
      </Chip>
    </ScrollView>
  );
}
