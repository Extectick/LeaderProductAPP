import { useNotify } from '@/components/NotificationHost';
import {
  cancelClientOrder,
  createClientOrder,
  getClientOrder,
  getClientOrders,
  getClientOrdersReferenceData,
  searchClientOrderProducts,
  submitClientOrder,
  updateClientOrder,
  type ClientOrder,
  type ClientOrderProduct,
  type ClientOrdersReferenceData,
} from '@/utils/clientOrdersService';
import React from 'react';
import { Alert, Platform } from 'react-native';
import {
  applyReferenceDefaults,
  buildNewItem,
  buildPayload,
  computeDraftTotal,
  createEmptyRefs,
  emptyDraft,
  getOrderActivityAt,
  orderToDraft,
  STATUS_LABELS,
  SYNC_LABELS,
  validateDraft,
  type ClientOrdersFilters,
  type DraftItem,
  type DraftOrder,
} from './clientOrdersShared';

type AutosaveState = 'idle' | 'scheduled' | 'saving' | 'saved' | 'error' | 'paused-invalid';

type SaveOptions = {
  silent?: boolean;
  reason?: 'manual' | 'autosave';
};

function emptyFilters(): ClientOrdersFilters {
  return { search: '', status: '', counterpartyGuid: '' };
}

export function useClientOrdersWorkspace() {
  const notify = useNotify();
  const [orders, setOrders] = React.useState<ClientOrder[]>([]);
  const [filters, setFilters] = React.useState<ClientOrdersFilters>(emptyFilters());
  const [selectedGuid, setSelectedGuid] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ClientOrder | null>(null);
  const [draft, setDraft] = React.useState<DraftOrder>(emptyDraft());
  const [refs, setRefs] = React.useState<ClientOrdersReferenceData>(createEmptyRefs());
  const [allCounterparties, setAllCounterparties] = React.useState<ClientOrdersReferenceData['counterparties']>([]);
  const [products, setProducts] = React.useState<ClientOrderProduct[]>([]);
  const [productSearch, setProductSearch] = React.useState('');
  const [loadingOrders, setLoadingOrders] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [loadingRefs, setLoadingRefs] = React.useState(false);
  const [loadingProducts, setLoadingProducts] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);

  const draftMode = !selectedGuid;
  const readOnly = !!selectedOrder?.isPostedIn1c || selectedOrder?.status === 'CANCELLED';
  const validation = React.useMemo(() => validateDraft(draft), [draft]);
  const localTotal = React.useMemo(() => computeDraftTotal(draft), [draft]);
  const sortedOrders = React.useMemo(
    () => [...orders].sort((a, b) => getOrderActivityAt(b).localeCompare(getOrderActivityAt(a))),
    [orders]
  );
  const statusCounts = React.useMemo(() => {
    const counts = sortedOrders.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    return {
      all: sortedOrders.length,
      draft: counts.DRAFT || 0,
      queued: counts.QUEUED || 0,
      sent: counts.SENT_TO_1C || 0,
      cancelled: counts.CANCELLED || 0,
    };
  }, [sortedOrders]);

  const loadOrders = React.useCallback(async () => {
    setLoadingOrders(true);
    setError(null);
    try {
      const list = await getClientOrders({
        limit: 50,
        offset: 0,
        search: filters.search || undefined,
        status: filters.status || undefined,
        counterpartyGuid: filters.counterpartyGuid || undefined,
      });
      const safeList = Array.isArray(list) ? list : [];
      setOrders(safeList);
      setSelectedGuid((prev) => {
        if (prev && safeList.some((item) => item.guid === prev)) return prev;
        return prev ?? safeList[0]?.guid ?? null;
      });
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить список заказов.');
    } finally {
      setLoadingOrders(false);
    }
  }, [filters.counterpartyGuid, filters.search, filters.status]);

  const loadDetail = React.useCallback(async (guid: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const order = await getClientOrder(guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDirty(false);
      setAutosaveState('idle');
      setAutosaveError(null);
      return order;
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить карточку заказа.');
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadRefs = React.useCallback(async (counterpartyGuid?: string) => {
    setLoadingRefs(true);
    try {
      const data = await getClientOrdersReferenceData(counterpartyGuid || undefined);
      setRefs(data);
      setAllCounterparties((prev) => (data.counterparties.length ? data.counterparties : prev));
      setDraft((prev) => applyReferenceDefaults(prev, data));
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить справочники.');
    } finally {
      setLoadingRefs(false);
    }
  }, []);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  React.useEffect(() => {
    void getClientOrdersReferenceData()
      .then((data) => setAllCounterparties(data.counterparties))
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    void loadRefs(draft.counterpartyGuid || undefined);
  }, [draft.counterpartyGuid, loadRefs]);

  React.useEffect(() => {
    if (!selectedGuid) {
      setSelectedOrder(null);
      return;
    }
    void loadDetail(selectedGuid);
  }, [loadDetail, selectedGuid]);

  const saveDraft = React.useCallback(async (options?: SaveOptions) => {
    if (readOnly) return null;
    try {
      setSaving(true);
      if (options?.reason === 'autosave') {
        setAutosaveState('saving');
      }
      setAutosaveError(null);

      const payload = buildPayload(draft);
      const order = draft.guid
        ? await updateClientOrder(draft.guid, { ...payload, revision: draft.revision })
        : await createClientOrder(payload);

      if (!options?.silent) {
        notify({
          type: 'success',
          title: draft.guid ? 'Заказ обновлен' : 'Заказ создан',
          message: draft.guid ? 'Изменения сохранены.' : 'Черновик сохранен.',
        });
      }

      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      setAutosaveState('saved');
      await loadOrders();
      return order;
    } catch (e: any) {
      const message = e?.message || 'Не удалось сохранить заказ.';
      setError(message);
      setAutosaveError(message);
      if (options?.reason === 'autosave') {
        setAutosaveState('error');
      }
      if (!options?.silent) {
        notify({
          type: 'error',
          title: 'Ошибка сохранения',
          message,
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, loadOrders, notify, readOnly]);

  React.useEffect(() => {
    if (!dirty || readOnly) return;
    if (!validation.canAutosave) {
      setAutosaveState('paused-invalid');
      return;
    }
    setAutosaveState('scheduled');
    const timer = setTimeout(() => {
      void saveDraft({ silent: true, reason: 'autosave' });
    }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, draft, readOnly, saveDraft, validation.canAutosave]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const markDirty = React.useCallback(() => {
    setDirty(true);
    if (autosaveState !== 'saving') {
      setAutosaveError(null);
    }
  }, [autosaveState]);

  const patchDraft = React.useCallback((patch: Partial<DraftOrder> | ((prev: DraftOrder) => DraftOrder)) => {
    setDraft((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
    markDirty();
  }, [markDirty]);

  const setItemPatch = React.useCallback((lineKey: string, patch: Partial<DraftItem>) => {
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.key === lineKey ? { ...item, ...patch } : item)),
    }));
  }, [patchDraft]);

  const removeItem = React.useCallback((lineKey: string) => {
    patchDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.key !== lineKey) }));
  }, [patchDraft]);

  const setCounterparty = React.useCallback((counterpartyGuid: string) => {
    patchDraft((prev) => ({
      ...prev,
      counterpartyGuid,
      agreementGuid: '',
      contractGuid: '',
      warehouseGuid: '',
      deliveryAddressGuid: '',
      currency: '',
    }));
  }, [patchDraft]);

  const setAgreement = React.useCallback((agreementGuid: string) => {
    patchDraft((prev) => {
      const agreement = refs.agreements.find((item) => item.guid === agreementGuid);
      return applyReferenceDefaults(
        {
          ...prev,
          agreementGuid,
          contractGuid: '',
          warehouseGuid: '',
          currency: agreement?.currency ?? prev.currency,
        },
        refs
      );
    });
  }, [patchDraft, refs]);

  const addProduct = React.useCallback((product: ClientOrderProduct) => {
    patchDraft((prev) => ({
      ...prev,
      currency: prev.currency || product.currency || '',
      items: [...prev.items, buildNewItem(product)],
    }));
  }, [patchDraft]);

  const loadProducts = React.useCallback(async () => {
    if (!draft.counterpartyGuid) {
      setError('Сначала выберите контрагента.');
      return;
    }
    setLoadingProducts(true);
    try {
      const items = await searchClientOrderProducts({
        search: productSearch || undefined,
        counterpartyGuid: draft.counterpartyGuid,
        agreementGuid: draft.agreementGuid || undefined,
        limit: 30,
        offset: 0,
      });
      setProducts(items);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить товары.');
    } finally {
      setLoadingProducts(false);
    }
  }, [draft.agreementGuid, draft.counterpartyGuid, productSearch]);

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
    if (selectedGuid) {
      await loadDetail(selectedGuid);
    }
    setRefreshing(false);
  }, [loadDetail, loadOrders, selectedGuid]);

  const submitOrder = React.useCallback(async () => {
    let targetGuid = draft.guid || selectedGuid;
    let revision = draft.revision;
    if (!targetGuid) {
      const created = await saveDraft({ reason: 'manual' });
      if (!created) return;
      targetGuid = created.guid;
      revision = created.revision;
    }
    try {
      setSubmitting(true);
      const order = await submitClientOrder(targetGuid, revision);
      notify({
        type: 'success',
        title: 'Заказ отправлен',
        message: 'Документ передан в очередь 1С.',
      });
      await loadOrders();
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDirty(false);
    } catch (e: any) {
      const message = e?.message || 'Не удалось отправить заказ.';
      setError(message);
      notify({
        type: 'error',
        title: 'Ошибка отправки',
        message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [draft.guid, draft.revision, loadOrders, notify, saveDraft, selectedGuid]);

  const runCancel = React.useCallback(async () => {
    if (!draft.guid) {
      setSelectedGuid(null);
      setSelectedOrder(null);
      setDraft(emptyDraft());
      setDirty(false);
      setProducts([]);
      setProductSearch('');
      setAutosaveState('idle');
      return;
    }
    try {
      setCancelling(true);
      const order = await cancelClientOrder(draft.guid, draft.revision, 'Отменено менеджером из приложения');
      notify({
        type: 'warning',
        title: 'Заказ отменен',
        message: 'Статус заказа обновлен.',
      });
      await loadOrders();
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отменить заказ.');
    } finally {
      setCancelling(false);
    }
  }, [draft.guid, draft.revision, loadOrders, notify]);

  const cancelOrder = React.useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Отменить этот заказ?')) void runCancel();
      return;
    }
    Alert.alert('Отменить заказ', 'Заказ будет переведен в статус "Отменен". Продолжить?', [
      { text: 'Нет', style: 'cancel' },
      { text: 'Да', style: 'destructive', onPress: () => void runCancel() },
    ]);
  }, [runCancel]);

  const confirmDiscardIfNeeded = React.useCallback(async () => {
    if (!dirty) return true;
    if (validation.canAutosave) {
      const result = await saveDraft({ silent: true, reason: 'autosave' });
      return !!result;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm('Есть несохраненные изменения с ошибками. Переключиться без сохранения?');
    }

    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Несохраненные изменения',
        'Есть несохраненные изменения с ошибками. Переключиться без сохранения?',
        [
          { text: 'Остаться', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Переключиться', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });
  }, [dirty, saveDraft, validation.canAutosave]);

  const selectOrder = React.useCallback(async (guid: string) => {
    if (guid === selectedGuid) return;
    const canContinue = await confirmDiscardIfNeeded();
    if (!canContinue) return;
    setSelectedGuid(guid);
  }, [confirmDiscardIfNeeded, selectedGuid]);

  const createNewOrder = React.useCallback(async () => {
    const canContinue = await confirmDiscardIfNeeded();
    if (!canContinue) return;
    setSelectedGuid(null);
    setSelectedOrder(null);
    setDraft(emptyDraft());
    setProducts([]);
    setProductSearch('');
    setError(null);
    setDirty(false);
    setAutosaveError(null);
    setAutosaveState('idle');
  }, [confirmDiscardIfNeeded]);

  const clearFilters = React.useCallback(() => {
    setFilters(emptyFilters());
  }, []);

  const autosaveLabel = React.useMemo(() => {
    switch (autosaveState) {
      case 'scheduled':
        return 'Автосохранение через секунду';
      case 'saving':
        return 'Автосохранение...';
      case 'saved':
        return lastSavedAt
          ? `Сохранено ${new Date(lastSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
          : 'Сохранено';
      case 'error':
        return autosaveError || 'Ошибка автосохранения';
      case 'paused-invalid':
        return validation.blockingMessage || 'Автосохранение остановлено';
      default:
        return dirty ? 'Есть изменения' : 'Без изменений';
    }
  }, [autosaveError, autosaveState, dirty, lastSavedAt, validation.blockingMessage]);

  return {
    orders: sortedOrders,
    filters,
    setFilters,
    clearFilters,
    selectedGuid,
    selectedOrder,
    selectOrder,
    createNewOrder,
    draft,
    patchDraft,
    setCounterparty,
    setAgreement,
    setItemPatch,
    removeItem,
    refs,
    allCounterparties,
    products,
    productSearch,
    setProductSearch,
    addProduct,
    loadProducts,
    loadingOrders,
    loadingDetail,
    loadingRefs,
    loadingProducts,
    saving,
    submitting,
    cancelling,
    refreshing,
    refreshAll,
    saveDraft,
    submitOrder,
    cancelOrder,
    error,
    setError,
    draftMode,
    readOnly,
    dirty,
    validation,
    localTotal,
    statusCounts,
    autosaveState,
    autosaveLabel,
    autosaveError,
    statusLabels: STATUS_LABELS,
    syncLabels: SYNC_LABELS,
  };
}
