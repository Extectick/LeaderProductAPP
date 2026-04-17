import { useNotify } from '@/components/NotificationHost';
import {
  cancelClientOrder,
  createClientOrder,
  deleteClientOrder,
  getClientOrder,
  getClientOrderDefaults,
  getClientOrderSettings,
  getClientOrders,
  searchClientOrderAgreements,
  searchClientOrderContracts,
  searchClientOrderCounterparties,
  searchClientOrderDeliveryAddresses,
  searchClientOrderPriceTypes,
  searchClientOrderProducts,
  searchClientOrderWarehouses,
  submitClientOrder,
  updateClientOrder,
  updateClientOrderSettings,
  type ClientOrder,
  type ClientOrderAgreementOption,
  type ClientOrderContractOption,
  type ClientOrderCounterpartyOption,
  type ClientOrderDeliveryAddressOption,
  type ClientOrderOrganization,
  type ClientOrderProduct,
  type ClientOrderPriceTypeOption,
  type ClientOrderSettings,
  type ClientOrderWarehouseOption,
} from '@/utils/clientOrdersService';
import React from 'react';
import { Alert, Platform } from 'react-native';
import {
  buildNewItem,
  buildPayload,
  computeDraftTotal,
  DEFAULT_ORDER_CURRENCY,
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
type SaveOptions = { silent?: boolean; reason?: 'manual' | 'autosave' };
type DiscardConfirmContext = {
  draftMode: boolean;
  hasPersistedDraft: boolean;
  blockingMessage: string | null;
};
type UseClientOrdersWorkspaceOptions = {
  confirmDiscard?: (context: DiscardConfirmContext) => Promise<boolean>;
};
type DraftSelections = {
  organization: ClientOrderOrganization | null;
  counterparty: ClientOrderCounterpartyOption | null;
  agreement: ClientOrderAgreementOption | null;
  contract: ClientOrderContractOption | null;
  warehouse: ClientOrderWarehouseOption | null;
  deliveryAddress: ClientOrderDeliveryAddressOption | null;
};

function emptyFilters(): ClientOrdersFilters {
  return { search: '', status: '', counterpartyGuid: '' };
}

function emptySelections(): DraftSelections {
  return {
    organization: null,
    counterparty: null,
    agreement: null,
    contract: null,
    warehouse: null,
    deliveryAddress: null,
  };
}

function buildDraftBase(settings: ClientOrderSettings | null) {
  return {
    organizationGuid: settings?.preferredOrganization?.guid || '',
    deliveryDate: settings?.resolvedDeliveryDate || null,
    currency: DEFAULT_ORDER_CURRENCY,
    priceTypeGuid: null,
    priceTypeName: null,
  };
}

function includesSearchToken(value: string | null | undefined, search: string) {
  return (value || '').toLowerCase().includes(search);
}

function normalizeFilterSearch(search: string) {
  return search.trim().toLowerCase();
}

function orderMatchesFilters(order: ClientOrder, filters: ClientOrdersFilters) {
  if (filters.status && order.status !== filters.status) return false;
  if (filters.counterpartyGuid && order.counterparty?.guid !== filters.counterpartyGuid) return false;

  const search = normalizeFilterSearch(filters.search);
  if (!search) return true;

  return [
    order.guid,
    order.number1c,
    order.comment,
    order.counterparty?.name,
  ].some((value) => includesSearchToken(value, search));
}

function sortClientOrdersForWorkspace(items: ClientOrder[]) {
  return [...items].sort((a, b) => {
    if (a.status === 'DRAFT' && b.status !== 'DRAFT') return -1;
    if (a.status !== 'DRAFT' && b.status === 'DRAFT') return 1;
    return getOrderActivityAt(b).localeCompare(getOrderActivityAt(a));
  });
}

export function useClientOrdersWorkspace(options: UseClientOrdersWorkspaceOptions = {}) {
  const confirmDiscard = options.confirmDiscard;
  const notify = useNotify();
  const [orders, setOrders] = React.useState<ClientOrder[]>([]);
  const [ordersMeta, setOrdersMeta] = React.useState({ total: 0, limit: 20, offset: 0 });
  const [filters, setFilters] = React.useState<ClientOrdersFilters>(emptyFilters());
  const [selectedGuid, setSelectedGuid] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ClientOrder | null>(null);
  const [draft, setDraft] = React.useState<DraftOrder>(() => emptyDraft());
  const [selections, setSelections] = React.useState<DraftSelections>(emptySelections());
  const [settings, setSettings] = React.useState<ClientOrderSettings | null>(null);
  const [loadingOrders, setLoadingOrders] = React.useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [loadingDefaults, setLoadingDefaults] = React.useState(false);
  const [loadingSettings, setLoadingSettings] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [deletingDraft, setDeletingDraft] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [documentStarted, setDocumentStarted] = React.useState(false);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const settingsRef = React.useRef<ClientOrderSettings | null>(null);
  const ordersRef = React.useRef<ClientOrder[]>([]);
  const documentStartedRef = React.useRef(false);
  const selectedGuidRef = React.useRef<string | null>(null);
  const contextRefreshSignatureRef = React.useRef('');

  const draftMode = !draft.guid;
  const readOnly = !!selectedOrder?.isPostedIn1c || selectedOrder?.status === 'CANCELLED';
  const baseValidation = React.useMemo(() => validateDraft(draft), [draft]);
  const validation = React.useMemo(() => {
    if (draftMode && settings?.deliveryDateIssue) {
      return {
        ...baseValidation,
        canSave: false,
        canAutosave: false,
        blockingMessage: settings.deliveryDateIssueMessage || 'Проверьте настройки даты отгрузки.',
      };
    }
    return baseValidation;
  }, [baseValidation, draftMode, settings?.deliveryDateIssue, settings?.deliveryDateIssueMessage]);
  const localTotal = React.useMemo(() => computeDraftTotal(draft), [draft]);
  const sortedOrders = React.useMemo(() => sortClientOrdersForWorkspace(orders), [orders]);
  const latestDraftOrder = React.useMemo(() => sortedOrders.find((item) => item.status === 'DRAFT') || null, [sortedOrders]);
  const hasEditableDocument = documentStarted || !!draft.guid || !!selectedGuid || !!selectedOrder;
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

  const hasMoreOrders = orders.length < (ordersMeta.total || 0);

  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  React.useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  React.useEffect(() => {
    documentStartedRef.current = documentStarted;
  }, [documentStarted]);

  React.useEffect(() => {
    selectedGuidRef.current = selectedGuid;
  }, [selectedGuid]);

  const resetDraftToBase = React.useCallback((nextSettings?: ClientOrderSettings | null) => {
    const base = buildDraftBase(nextSettings ?? settings);
    selectedGuidRef.current = null;
    documentStartedRef.current = false;
    setDraft({ ...emptyDraft(), ...base });
    setSelections({
      ...emptySelections(),
      organization: (nextSettings ?? settings)?.preferredOrganization || null,
    });
    setSelectedGuid(null);
    setSelectedOrder(null);
    setDocumentStarted(false);
    setDirty(false);
    setAutosaveState('idle');
    setAutosaveError(null);
    setError(null);
  }, [settings]);

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

  const applySavedOrderToList = React.useCallback((order: ClientOrder) => {
    const matches = orderMatchesFilters(order, filters);
    setOrders((prev) => {
      const existingIndex = prev.findIndex((item) => item.guid === order.guid);
      if (matches) {
        const next = existingIndex >= 0
          ? prev.map((item) => (item.guid === order.guid ? order : item))
          : [order, ...prev];
        return sortClientOrdersForWorkspace(next);
      }
      if (existingIndex < 0) return prev;
      return prev.filter((item) => item.guid !== order.guid);
    });
    setOrdersMeta((prev) => {
      const existingVisible = ordersRef.current.some((item) => item.guid === order.guid);
      if (matches && !existingVisible) {
        return { ...prev, total: prev.total + 1 };
      }
      if (!matches && existingVisible) {
        return { ...prev, total: Math.max(0, prev.total - 1) };
      }
      return prev;
    });
  }, [filters]);

  const setItemPatch = React.useCallback((lineKey: string, patch: Partial<DraftItem>) => {
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.key === lineKey ? { ...item, ...patch } : item)),
    }));
  }, [patchDraft]);

  const mergeSavedOrderIntoDraft = React.useCallback((order: ClientOrder) => {
    setDraft((prev) => ({
      ...prev,
      guid: order.guid,
      revision: order.revision,
      deliveryDate: order.deliveryDate ?? prev.deliveryDate ?? null,
      comment: order.comment ?? prev.comment,
      organizationGuid: order.organization?.guid ?? prev.organizationGuid,
      counterpartyGuid: order.counterparty?.guid ?? prev.counterpartyGuid,
      agreementGuid: order.agreement?.guid ?? prev.agreementGuid,
      contractGuid: order.contract?.guid ?? prev.contractGuid,
      warehouseGuid: order.warehouse?.guid ?? prev.warehouseGuid,
      deliveryAddressGuid: order.deliveryAddress?.guid ?? prev.deliveryAddressGuid,
    }));
  }, []);

  const removeItem = React.useCallback((lineKey: string) => {
    patchDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.key !== lineKey) }));
  }, [patchDraft]);

  const clearItems = React.useCallback(() => {
    patchDraft((prev) => ({ ...prev, items: [] }));
  }, [patchDraft]);

  const loadSettings = React.useCallback(async () => {
    setLoadingSettings(true);
    try {
      const nextSettings = await getClientOrderSettings();
      setSettings(nextSettings);
      setDraft((prev) => {
        if (prev.guid || prev.organizationGuid || prev.counterpartyGuid || prev.items.length) return prev;
        return { ...prev, ...buildDraftBase(nextSettings) };
      });
      setSelections((prev) => ({
        ...prev,
        organization: prev.organization || nextSettings.preferredOrganization || null,
      }));
      return nextSettings;
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить настройки заказов клиентов.');
      return null;
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadOrders = React.useCallback(async (mode: 'reset' | 'append' = 'reset') => {
    const offset = mode === 'append' ? orders.length : 0;
    if (mode === 'append') {
      setLoadingMoreOrders(true);
    } else {
      setLoadingOrders(true);
      setError(null);
    }

    try {
      const result = await getClientOrders({
        limit: 20,
        offset,
        search: filters.search || undefined,
        status: filters.status || undefined,
        counterpartyGuid: filters.counterpartyGuid || undefined,
      });
      const list = Array.isArray(result.items) ? result.items : [];
      setOrders((prev) => (mode === 'append' ? [...prev, ...list] : list));
      setOrdersMeta({
        total: result.meta.total || 0,
        limit: result.meta.limit || 20,
        offset: result.meta.offset || offset,
      });
      if (mode === 'reset') {
        const nextSorted = sortClientOrdersForWorkspace(list);
        const latestDraft = nextSorted.find((item) => item.status === 'DRAFT') || null;
        setSelectedGuid((prev) => {
          if (prev && list.some((item) => item.guid === prev)) return prev;
          if (documentStartedRef.current) return prev;
          return latestDraft?.guid ?? null;
        });
        if (!latestDraft && !documentStartedRef.current && !selectedGuidRef.current) {
          setDocumentStarted(false);
          setSelectedOrder(null);
          setDraft((prev) => (prev.guid ? { ...emptyDraft(), ...buildDraftBase(settingsRef.current) } : prev));
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить список заказов.');
    } finally {
      setLoadingOrders(false);
      setLoadingMoreOrders(false);
    }
  }, [filters.counterpartyGuid, filters.search, filters.status, orders.length]);

  const loadDetail = React.useCallback(async (guid: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const order = await getClientOrder(guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDocumentStarted(true);
      setSelections({
        organization: order.organization || null,
        counterparty: order.counterparty || null,
        agreement: order.agreement || null,
        contract: order.contract || null,
        warehouse: order.warehouse || null,
        deliveryAddress: order.deliveryAddress || null,
      });
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

  const applyResolvedDefaults = React.useCallback(async (organizationGuid: string, counterpartyGuid: string) => {
    if (!organizationGuid || !counterpartyGuid) return;
    setLoadingDefaults(true);
    try {
      const defaults = await getClientOrderDefaults({ organizationGuid, counterpartyGuid });
      setDraft((prev) => ({
        ...prev,
        agreementGuid: defaults.agreement?.guid || '',
        contractGuid: defaults.contract?.guid || '',
        warehouseGuid: defaults.warehouse?.guid || '',
        deliveryAddressGuid: defaults.deliveryAddress?.guid || '',
        deliveryDate: defaults.deliveryDate ?? prev.deliveryDate ?? null,
        currency: DEFAULT_ORDER_CURRENCY,
        priceTypeGuid: defaults.agreement?.priceType?.guid ?? prev.priceTypeGuid ?? null,
        priceTypeName: defaults.agreement?.priceType?.name ?? prev.priceTypeName ?? null,
        items: prev.items.map((item) => ({
          ...item,
          priceTypeGuid: defaults.agreement?.priceType?.guid ?? item.priceTypeGuid ?? null,
          priceTypeName: defaults.agreement?.priceType?.name ?? item.priceTypeName ?? null,
          basePrice: item.manualPrice.trim() ? item.basePrice : item.basePrice,
        })),
      }));
      setSelections((prev) => ({
        organization: defaults.organization || prev.organization,
        counterparty: defaults.counterparty || prev.counterparty,
        agreement: defaults.agreement || null,
        contract: defaults.contract || null,
        warehouse: defaults.warehouse || null,
        deliveryAddress: defaults.deliveryAddress || null,
      }));
    } catch (e: any) {
      setError(e?.message || 'Не удалось подставить значения по умолчанию.');
    } finally {
      setLoadingDefaults(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void loadOrders('reset');
    }, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters, loadOrders]);

  React.useEffect(() => {
    if (!selectedGuid) return;
    void loadDetail(selectedGuid);
  }, [loadDetail, selectedGuid]);

  const saveUserSettings = React.useCallback(async (payload: Parameters<typeof updateClientOrderSettings>[0]) => {
    setSavingSettings(true);
    try {
      const nextSettings = await updateClientOrderSettings(payload);
      setSettings(nextSettings);
      if (payload.preferredOrganizationGuid !== undefined) {
        const organization = nextSettings.organizations.find((item) => item.guid === payload.preferredOrganizationGuid) || null;
        setSelections((prev) => ({ ...prev, organization }));
      }
      return nextSettings;
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить настройки.');
      return null;
    } finally {
      setSavingSettings(false);
    }
  }, []);

  const saveDraft = React.useCallback(async (options?: SaveOptions) => {
    if (readOnly) return null;
    try {
      setSaving(true);
      if (options?.reason === 'autosave') setAutosaveState('saving');
      setAutosaveError(null);

      const payload = buildPayload(draft, options?.reason || 'manual');
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
      mergeSavedOrderIntoDraft(order);
      setDocumentStarted(true);
      setSelections({
        organization: order.organization || selections.organization,
        counterparty: order.counterparty || selections.counterparty,
        agreement: order.agreement || selections.agreement,
        contract: order.contract || selections.contract,
        warehouse: order.warehouse || selections.warehouse,
        deliveryAddress: order.deliveryAddress || selections.deliveryAddress,
      });
      setError(null);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      setAutosaveState('saved');
      applySavedOrderToList(order);
      return order;
    } catch (e: any) {
      const message = e?.message || 'Не удалось сохранить заказ.';
      setError(message);
      setAutosaveError(message);
      if (options?.reason === 'autosave') setAutosaveState('error');
      if (!options?.silent) {
        notify({ type: 'error', title: 'Ошибка сохранения', message });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [applySavedOrderToList, draft, mergeSavedOrderIntoDraft, notify, readOnly, selections]);

  React.useEffect(() => {
    if (!dirty || readOnly) return;
    if (!validation.canAutosave) {
      setAutosaveState('paused-invalid');
      return;
    }
    setAutosaveState('scheduled');
    const timer = setTimeout(() => void saveDraft({ silent: true, reason: 'autosave' }), 1500);
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

  const confirmDiscardIfNeeded = React.useCallback(async () => {
    if (!dirty) return true;
    if (validation.canAutosave) {
      const result = await saveDraft({ silent: true, reason: 'autosave' });
      if (result) return true;
    }
    if (confirmDiscard) {
      return confirmDiscard({
        draftMode,
        hasPersistedDraft: !!draft.guid,
        blockingMessage: validation.blockingMessage,
      });
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm('Есть несохраненные изменения с ошибками. Перейти без сохранения?');
    }
    return new Promise<boolean>((resolve) => {
      Alert.alert('Несохраненные изменения', 'Есть несохраненные изменения с ошибками. Перейти без сохранения?', [
        { text: 'Остаться', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Перейти', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }, [confirmDiscard, dirty, draft.guid, draftMode, saveDraft, validation.blockingMessage, validation.canAutosave]);

  const selectOrder = React.useCallback(async (guid: string) => {
    if (guid === selectedGuid) return true;
    const canContinue = await confirmDiscardIfNeeded();
    if (!canContinue) return false;
    setDocumentStarted(true);
    setSelectedGuid(guid);
    return true;
  }, [confirmDiscardIfNeeded, selectedGuid]);

  const createNewOrder = React.useCallback(async () => {
    const canContinue = await confirmDiscardIfNeeded();
    if (!canContinue) return;
    resetDraftToBase();
    setDocumentStarted(true);
  }, [confirmDiscardIfNeeded, resetDraftToBase]);

  const setOrganization = React.useCallback(async (organization: ClientOrderOrganization | null) => {
    const counterpartyGuid = draft.counterpartyGuid;
    patchDraft((prev) => ({ ...prev, organizationGuid: organization?.guid || '' }));
    setSelections((prev) => ({ ...prev, organization }));
    void saveUserSettings({ preferredOrganizationGuid: organization?.guid || null });
    if (organization?.guid && counterpartyGuid) {
      await applyResolvedDefaults(organization.guid, counterpartyGuid);
    }
  }, [applyResolvedDefaults, draft.counterpartyGuid, patchDraft, saveUserSettings]);

  const setCounterparty = React.useCallback(async (counterparty: ClientOrderCounterpartyOption | null) => {
    patchDraft((prev) => ({
      ...prev,
      counterpartyGuid: counterparty?.guid || '',
      agreementGuid: '',
      contractGuid: '',
      warehouseGuid: '',
      deliveryAddressGuid: '',
    }));
    setSelections((prev) => ({
      ...prev,
      counterparty,
      agreement: null,
      contract: null,
      warehouse: null,
      deliveryAddress: null,
    }));
    if (counterparty?.guid && draft.organizationGuid) {
      await applyResolvedDefaults(draft.organizationGuid, counterparty.guid);
    }
  }, [applyResolvedDefaults, draft.organizationGuid, patchDraft]);

  const setAgreement = React.useCallback((agreement: ClientOrderAgreementOption | null) => {
    patchDraft((prev) => ({
      ...prev,
      agreementGuid: agreement?.guid || '',
      contractGuid: agreement?.contract?.guid || prev.contractGuid,
      warehouseGuid: agreement?.warehouse?.guid || prev.warehouseGuid,
      priceTypeGuid: agreement?.priceType?.guid || prev.priceTypeGuid || null,
      priceTypeName: agreement?.priceType?.name || prev.priceTypeName || null,
      items: prev.items.map((item) => ({
        ...item,
        priceTypeGuid: agreement?.priceType?.guid || item.priceTypeGuid || null,
        priceTypeName: agreement?.priceType?.name || item.priceTypeName || null,
      })),
    }));
    setSelections((prev) => ({
      ...prev,
      agreement,
      contract: agreement?.contract || prev.contract,
      warehouse: agreement?.warehouse || prev.warehouse,
    }));
  }, [patchDraft]);

  const setContract = React.useCallback((contract: ClientOrderContractOption | null) => {
    patchDraft({ contractGuid: contract?.guid || '' });
    setSelections((prev) => ({ ...prev, contract }));
  }, [patchDraft]);

  const setWarehouse = React.useCallback((warehouse: ClientOrderWarehouseOption | null) => {
    patchDraft({ warehouseGuid: warehouse?.guid || '' });
    setSelections((prev) => ({ ...prev, warehouse }));
  }, [patchDraft]);

  const setDeliveryAddress = React.useCallback((deliveryAddress: ClientOrderDeliveryAddressOption | null) => {
    patchDraft({ deliveryAddressGuid: deliveryAddress?.guid || '' });
    setSelections((prev) => ({ ...prev, deliveryAddress }));
  }, [patchDraft]);

  const refreshItemPricing = React.useCallback(async (item: DraftItem, priceType: ClientOrderPriceTypeOption | null) => {
    if (!draft.counterpartyGuid) return;
    try {
      const result = await searchClientOrderProducts({
        search: item.productGuid,
        counterpartyGuid: draft.counterpartyGuid,
        agreementGuid: draft.agreementGuid || undefined,
        warehouseGuid: draft.warehouseGuid || undefined,
        priceTypeGuid: priceType?.guid || undefined,
        limit: 25,
        offset: 0,
      });
      const product = result.items.find((next) => next.guid === item.productGuid);
      if (!product) return;
      const hasManualPrice = item.manualPrice.trim();
      setItemPatch(item.key, {
        basePrice: hasManualPrice ? item.basePrice ?? product.basePrice ?? null : product.basePrice ?? item.basePrice ?? null,
        receiptPrice: product.receiptPrice ?? product.basePrice ?? item.receiptPrice ?? item.basePrice ?? null,
        currency: DEFAULT_ORDER_CURRENCY,
        priceTypeGuid: hasManualPrice ? item.priceTypeGuid ?? null : product.priceType?.guid ?? priceType?.guid ?? null,
        priceTypeName: hasManualPrice ? item.priceTypeName ?? null : product.priceType?.name ?? priceType?.name ?? null,
        baseUnit: product.baseUnit ?? item.baseUnit ?? null,
        stock: product.stock ?? item.stock ?? null,
        packages: product.packages?.length ? product.packages : item.packages,
      });
    } catch {
      const hasManualPrice = item.manualPrice.trim();
      setItemPatch(item.key, {
        priceTypeGuid: hasManualPrice ? item.priceTypeGuid ?? null : priceType?.guid || null,
        priceTypeName: hasManualPrice ? item.priceTypeName ?? null : priceType?.name || null,
        basePrice: item.manualPrice.trim() ? item.basePrice : null,
      });
    }
  }, [draft.agreementGuid, draft.counterpartyGuid, draft.warehouseGuid, setItemPatch]);

  React.useEffect(() => {
    if (!draft.warehouseGuid || !draft.counterpartyGuid || !draft.items.length) {
      contextRefreshSignatureRef.current = '';
      return;
    }

    const refreshSignature = [
      draft.counterpartyGuid,
      draft.agreementGuid || '',
      draft.warehouseGuid,
    ].join('||');

    if (contextRefreshSignatureRef.current === refreshSignature) {
      return;
    }
    contextRefreshSignatureRef.current = refreshSignature;

    draft.items.forEach((item) => {
      const priceType = item.priceTypeGuid ? { guid: item.priceTypeGuid, name: item.priceTypeName || 'Вид цены' } : null;
      void refreshItemPricing(item, priceType);
    });
  }, [draft.agreementGuid, draft.counterpartyGuid, draft.warehouseGuid, refreshItemPricing]);

  const documentHeaderDefaultsState = React.useMemo(() => ({
    organization: selections.organization ? 'из настроек пользователя' : 'не найдено значение по умолчанию',
    counterparty: selections.counterparty ? 'выбрано вручную' : 'выберите контрагента',
    agreement: selections.agreement ? 'по умолчанию' : 'не найдено значение по умолчанию',
    contract: selections.contract ? 'по умолчанию' : 'не найдено значение по умолчанию',
    warehouse: selections.warehouse ? 'из соглашения / по умолчанию' : 'не найдено значение по умолчанию',
    deliveryAddress: selections.deliveryAddress ? 'по умолчанию' : 'не найдено значение по умолчанию',
    deliveryDate: draft.deliveryDate ? 'из настроек пользователя' : 'не найдено значение по умолчанию',
  }), [draft.deliveryDate, selections]);

  const addProduct = React.useCallback((product: ClientOrderProduct) => {
    patchDraft((prev) => {
      if (prev.items.some((item) => item.productGuid === product.guid)) return prev;
      return { ...prev, items: [...prev.items, buildNewItem(product)] };
    });
  }, [patchDraft]);

  const setItemPriceType = React.useCallback((lineKey: string, priceType: ClientOrderPriceTypeOption | null) => {
    const target = draft.items.find((item) => item.key === lineKey);
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.key === lineKey
          ? {
              ...item,
              priceTypeGuid: priceType?.guid || null,
              priceTypeName: priceType?.name || null,
              manualPrice: '',
              basePrice: null,
            }
          : item
      )),
    }));
    if (target) {
      void refreshItemPricing({ ...target, manualPrice: '' }, priceType);
    }
  }, [draft.items, patchDraft, refreshItemPricing]);

  const defaultHeaderPriceType = React.useMemo(() => selections.agreement?.priceType ?? null, [selections.agreement?.priceType]);

  const defaultLinePriceType = React.useMemo(() => (
    draft.priceTypeGuid
      ? { guid: draft.priceTypeGuid, name: draft.priceTypeName || selections.agreement?.priceType?.name || 'Вид цены' }
      : defaultHeaderPriceType
  ), [defaultHeaderPriceType, draft.priceTypeGuid, draft.priceTypeName, selections.agreement?.priceType?.name]);

  const isHeaderPriceTypeCustom = React.useMemo(() => {
    const defaultGuid = defaultHeaderPriceType?.guid || null;
    const currentGuid = draft.priceTypeGuid || null;
    return currentGuid !== defaultGuid;
  }, [defaultHeaderPriceType?.guid, draft.priceTypeGuid]);

  const isItemPriceTypeCustom = React.useCallback((lineKey: string) => {
    const item = draft.items.find((next) => next.key === lineKey);
    if (!item) return false;
    if (item.manualPrice.trim()) return true;
    const defaultGuid = defaultLinePriceType?.guid || null;
    if (!item.priceTypeGuid) return false;
    return item.priceTypeGuid !== defaultGuid;
  }, [defaultLinePriceType?.guid, draft.items]);

  const resetItemPriceType = React.useCallback((lineKey: string) => {
    const target = draft.items.find((item) => item.key === lineKey);
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.key === lineKey
          ? {
              ...item,
              manualPrice: '',
              priceTypeGuid: defaultLinePriceType?.guid || null,
              priceTypeName: defaultLinePriceType?.name || null,
              basePrice: null,
            }
          : item
      )),
    }));
    if (target) {
      void refreshItemPricing({ ...target, manualPrice: '' }, defaultLinePriceType);
    }
  }, [defaultLinePriceType, draft.items, patchDraft, refreshItemPricing]);

  const setHeaderPriceType = React.useCallback((priceType: ClientOrderPriceTypeOption | null) => {
    const refreshTargets = draft.items.filter((item) => !item.manualPrice.trim());
    patchDraft((prev) => ({
      ...prev,
      priceTypeGuid: priceType?.guid || null,
      priceTypeName: priceType?.name || null,
      items: prev.items.map((item) => item.manualPrice.trim()
        ? { ...item, priceTypeGuid: null, priceTypeName: 'Произвольный' }
        : {
            ...item,
            priceTypeGuid: priceType?.guid || null,
            priceTypeName: priceType?.name || null,
            basePrice: null,
          }),
    }));
    refreshTargets.forEach((item) => {
      void refreshItemPricing(item, priceType);
    });
  }, [draft.items, patchDraft, refreshItemPricing]);

  const resetHeaderPriceTypeToDefault = React.useCallback(() => {
    const priceType = defaultHeaderPriceType;
    const refreshTargets = draft.items;
    patchDraft((prev) => ({
      ...prev,
      priceTypeGuid: priceType?.guid || null,
      priceTypeName: priceType?.name || null,
      items: prev.items.map((item) => ({
        ...item,
        manualPrice: '',
        priceTypeGuid: priceType?.guid || null,
        priceTypeName: priceType?.name || null,
        basePrice: null,
      })),
    }));
    refreshTargets.forEach((item) => {
      void refreshItemPricing({ ...item, manualPrice: '' }, priceType);
    });
  }, [defaultHeaderPriceType, draft.items, patchDraft, refreshItemPricing]);

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSettings(), loadOrders('reset'), selectedGuid ? loadDetail(selectedGuid) : Promise.resolve(null)]);
    setRefreshing(false);
  }, [loadDetail, loadOrders, loadSettings, selectedGuid]);

  const submitOrder = React.useCallback(async () => {
    let targetGuid = draft.guid || selectedGuid;
    let revision = draft.revision;
    if (!targetGuid || dirty) {
      const saved = await saveDraft({ silent: true, reason: 'manual' });
      if (!saved) return;
      targetGuid = saved.guid;
      revision = saved.revision;
    }
    try {
      setSubmitting(true);
      const order = await submitClientOrder(targetGuid, revision);
      notify({ type: 'success', title: 'Заказ отправлен', message: 'Документ передан в очередь 1С.' });
      await loadOrders('reset');
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDocumentStarted(true);
      setDirty(false);
    } catch (e: any) {
      const message = e?.message || 'Не удалось отправить заказ.';
      setError(message);
      notify({ type: 'error', title: 'Ошибка отправки', message });
    } finally {
      setSubmitting(false);
    }
  }, [dirty, draft.guid, draft.revision, loadOrders, notify, saveDraft, selectedGuid]);

  const runCancel = React.useCallback(async (target?: { guid: string; revision: number }) => {
    const targetGuid = target?.guid || draft.guid;
    const targetRevision = target?.revision ?? draft.revision;
    if (!targetGuid) {
      resetDraftToBase();
      return;
    }
    try {
      setCancelling(true);
      const order = await cancelClientOrder(targetGuid, targetRevision, 'Отменено менеджером из приложения');
      notify({ type: 'warning', title: 'Заказ отменен', message: 'Статус заказа обновлен.' });
      await loadOrders('reset');
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отменить заказ.');
    } finally {
      setCancelling(false);
    }
  }, [draft.guid, draft.revision, loadOrders, notify, resetDraftToBase]);

  const deleteDraft = React.useCallback(async (guid?: string) => {
    const targetGuid = guid || draft.guid || selectedGuid;
    if (!targetGuid) {
      resetDraftToBase();
      return;
    }

    try {
      setDeletingDraft(true);
      await deleteClientOrder(targetGuid);
      notify({ type: 'warning', title: 'Черновик удален', message: 'Черновик заказа удален.' });
      const deletingCurrent = targetGuid === draft.guid || targetGuid === selectedGuid;
      if (deletingCurrent) {
        resetDraftToBase();
      }
      await loadOrders('reset');
    } catch (e: any) {
      const message = e?.message || 'Не удалось удалить черновик заказа.';
      setError(message);
      notify({ type: 'error', title: 'Ошибка удаления', message });
      await loadOrders('reset');
    } finally {
      setDeletingDraft(false);
    }
  }, [draft.guid, loadOrders, notify, resetDraftToBase, selectedGuid]);

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
    ordersMeta,
    latestDraftOrder,
    hasEditableDocument,
    documentHeaderDefaultsState,
    openLatestDraftIfAny: () => latestDraftOrder ? selectOrder(latestDraftOrder.guid) : Promise.resolve(),
    createDocument: createNewOrder,
    hasMoreOrders,
    loadMoreOrders: () => loadOrders('append'),
    filters,
    setFilters,
    clearFilters: () => setFilters(emptyFilters()),
    selectedGuid,
    selectedOrder,
    selectOrder,
    createNewOrder,
    draft,
    selections,
    settings,
    saveUserSettings,
    patchDraft,
    setOrganization,
    setCounterparty,
    setAgreement,
    setContract,
    setWarehouse,
    setDeliveryAddress,
    setItemPatch,
    setItemPriceType,
    setHeaderPriceType,
    defaultHeaderPriceType,
    defaultLinePriceType,
    isHeaderPriceTypeCustom,
    isItemPriceTypeCustom,
    resetItemPriceType,
    resetHeaderPriceTypeToDefault,
    removeItem,
    clearItems,
    addProduct,
    searchCounterparties: searchClientOrderCounterparties,
    searchAgreements: searchClientOrderAgreements,
    searchContracts: searchClientOrderContracts,
    searchWarehouses: searchClientOrderWarehouses,
    searchDeliveryAddresses: searchClientOrderDeliveryAddresses,
    searchProducts: searchClientOrderProducts,
    searchPriceTypes: searchClientOrderPriceTypes,
    loadingOrders,
    loadingMoreOrders,
    loadingDetail,
    loadingDefaults,
    loadingSettings,
    savingSettings,
    saving,
    submitting,
    cancelling,
    deletingDraft,
    refreshing,
    refreshAll,
    saveDraft,
    submitOrder,
    cancelOrder,
    cancelOrderConfirmed: runCancel,
    deleteDraft,
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
