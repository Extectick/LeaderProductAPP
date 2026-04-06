import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useNotify } from '@/components/NotificationHost';
import DateTimeInput from '@/components/ui/DateTimeInput';
import Dropdown, { type DropdownItem } from '@/components/ui/Dropdown';
import { useThemeColor } from '@/hooks/useThemeColor';
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
  type ClientOrderItem,
  type ClientOrderProduct,
  type ClientOrdersReferenceData,
} from '@/utils/clientOrdersService';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

type DraftItem = {
  key: string;
  productGuid: string;
  productName: string;
  productCode?: string | null;
  quantity: string;
  packageGuid?: string | null;
  manualPrice: string;
  discountPercent: string;
  comment: string;
  basePrice?: number | null;
  currency?: string | null;
  priceSource?: string | null;
  packages: ClientOrderProduct['packages'];
};

type DraftOrder = {
  guid?: string | null;
  revision: number;
  counterpartyGuid: string;
  agreementGuid: string;
  contractGuid: string;
  warehouseGuid: string;
  deliveryAddressGuid: string;
  deliveryDate?: string | null;
  comment: string;
  currency: string;
  generalDiscountPercent: string;
  items: DraftItem[];
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  QUEUED: 'В очереди',
  SENT_TO_1C: 'Создан в 1С',
  CONFIRMED: 'Подтвержден',
  PARTIAL: 'Частично выполнен',
  REJECTED: 'Отклонен',
  CANCELLED: 'Отменен',
};

const SYNC_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  QUEUED: 'Ожидает 1С',
  SENT_TO_1C: 'Отправлен в 1С',
  SYNCED: 'Синхронизирован',
  CONFLICT: 'Конфликт',
  ERROR: 'Ошибка',
  CANCEL_REQUESTED: 'Ожидает отмены',
};

function makeKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDraft(): DraftOrder {
  return {
    revision: 0,
    counterpartyGuid: '',
    agreementGuid: '',
    contractGuid: '',
    warehouseGuid: '',
    deliveryAddressGuid: '',
    deliveryDate: null,
    comment: '',
    currency: '',
    generalDiscountPercent: '',
    items: [],
  };
}

function asString(value?: number | null) {
  return value === null || value === undefined ? '' : String(value);
}

function asNumber(value: string) {
  const parsed = Number(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatMoney(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) return '—';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ru-RU');
}

function orderToDraft(order: ClientOrder): DraftOrder {
  return {
    guid: order.guid,
    revision: order.revision,
    counterpartyGuid: order.counterparty?.guid ?? '',
    agreementGuid: order.agreement?.guid ?? '',
    contractGuid: order.contract?.guid ?? '',
    warehouseGuid: order.warehouse?.guid ?? '',
    deliveryAddressGuid: order.deliveryAddress?.guid ?? '',
    deliveryDate: order.deliveryDate ?? null,
    comment: order.comment ?? '',
    currency: order.currency ?? '',
    generalDiscountPercent: asString(order.generalDiscountPercent),
    items: order.items.map((item: ClientOrderItem) => ({
      key: makeKey(),
      productGuid: item.product.guid,
      productName: item.product.name,
      productCode: item.product.code ?? null,
      quantity: asString(item.quantity),
      packageGuid: item.package?.guid ?? null,
      manualPrice: asString(item.manualPrice),
      discountPercent: asString(item.discountPercent),
      comment: item.comment ?? '',
      basePrice: item.basePrice ?? null,
      currency: order.currency ?? null,
      priceSource: item.priceSource ?? null,
      packages: item.package?.guid
        ? [{
            guid: item.package.guid,
            name: item.package.name ?? 'Упаковка',
            multiplier: item.package.multiplier ?? null,
            isDefault: true,
            unit: item.unit ?? null,
          }]
        : [],
    })),
  };
}

export default function ClientOrdersScreen() {
  const notify = useNotify();
  const topInset = useHeaderContentTopInset({ hasSubtitle: true });
  const { width } = useWindowDimensions();
  const split = width >= 1100;
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');

  const [orders, setOrders] = React.useState<ClientOrder[]>([]);
  const [selectedGuid, setSelectedGuid] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ClientOrder | null>(null);
  const [draft, setDraft] = React.useState<DraftOrder>(emptyDraft());
  const [refs, setRefs] = React.useState<ClientOrdersReferenceData>({
    counterparties: [],
    agreements: [],
    contracts: [],
    deliveryAddresses: [],
    warehouses: [],
  });
  const [products, setProducts] = React.useState<ClientOrderProduct[]>([]);
  const [ordersSearch, setOrdersSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
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

  const draftMode = !selectedGuid;
  const readOnly = !!selectedOrder?.isPostedIn1c || selectedOrder?.status === 'CANCELLED';

  const loadOrders = React.useCallback(async () => {
    setLoadingOrders(true);
    setError(null);
    try {
      const list = await getClientOrders({
        limit: 50,
        offset: 0,
        search: ordersSearch || undefined,
        status: statusFilter || undefined,
      });
      const safeList = Array.isArray(list) ? list : [];
      setOrders(safeList);
      setSelectedGuid((prev) => (prev && safeList.some((item) => item.guid === prev) ? prev : prev ?? safeList[0]?.guid ?? null));
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить список заказов');
    } finally {
      setLoadingOrders(false);
    }
  }, [ordersSearch, statusFilter]);

  const loadDetail = React.useCallback(async (guid: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const order = await getClientOrder(guid);
      setSelectedOrder(order);
      setDraft(orderToDraft(order));
      return order;
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить карточку заказа');
      return null;
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadRefs = React.useCallback(async (counterpartyGuid?: string) => {
    setLoadingRefs(true);
    try {
      setRefs(await getClientOrdersReferenceData(counterpartyGuid || undefined));
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить справочники');
    } finally {
      setLoadingRefs(false);
    }
  }, []);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

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

  const setPatch = (patch: Partial<DraftOrder>) => setDraft((prev) => ({ ...prev, ...patch }));
  const setItemPatch = (lineKey: string, patch: Partial<DraftItem>) =>
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.key === lineKey ? { ...item, ...patch } : item)),
    }));

  const statusItems: DropdownItem<string>[] = React.useMemo(
    () => [{ label: 'Все статусы', value: '' }, ...Object.keys(STATUS_LABELS).map((code) => ({ label: STATUS_LABELS[code], value: code }))],
    []
  );
  const counterpartyItems: DropdownItem<string>[] = refs.counterparties.map((item) => ({ label: item.name, value: item.guid }));
  const agreementItems: DropdownItem<string>[] = refs.agreements.map((item) => ({ label: item.name, value: item.guid }));
  const contractItems: DropdownItem<string>[] = refs.contracts.map((item) => ({ label: item.number, value: item.guid }));
  const warehouseItems: DropdownItem<string>[] = refs.warehouses.map((item) => ({ label: item.name, value: item.guid }));
  const addressItems: DropdownItem<string>[] = refs.deliveryAddresses
    .filter((item) => item.guid)
    .map((item) => ({ label: item.fullAddress, value: item.guid as string }));

  const localTotal = draft.items.reduce((sum, item) => {
    const quantity = asNumber(item.quantity);
    const basePrice = item.manualPrice.trim() ? asNumber(item.manualPrice) : item.basePrice ?? 0;
    const discount = item.discountPercent.trim()
      ? asNumber(item.discountPercent)
      : draft.generalDiscountPercent.trim()
        ? asNumber(draft.generalDiscountPercent)
        : 0;
    if (Number.isNaN(quantity)) return sum;
    return sum + quantity * basePrice * (1 - (Number.isNaN(discount) ? 0 : discount) / 100);
  }, 0);

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
    if (selectedGuid) {
      await loadDetail(selectedGuid);
    }
    setRefreshing(false);
  }, [loadDetail, loadOrders, selectedGuid]);

  const addProduct = (product: ClientOrderProduct) => {
    const packages = Array.isArray(product.packages) ? product.packages : [];
    const pack = packages.find((item) => item.isDefault) ?? packages[0];
    setDraft((prev) => ({
      ...prev,
      currency: prev.currency || product.currency || '',
      items: [
        ...prev.items,
        {
          key: makeKey(),
          productGuid: product.guid,
          productName: product.name,
          productCode: product.code ?? null,
          quantity: '1',
          packageGuid: pack?.guid ?? null,
          manualPrice: '',
          discountPercent: '',
          comment: '',
          basePrice: product.basePrice ?? null,
          currency: product.currency ?? null,
          priceSource: product.priceMatch?.source ? `${product.priceMatch.source}:${product.priceMatch.level ?? ''}` : null,
          packages,
        },
      ],
    }));
  };

  const loadProducts = async () => {
    if (!draft.counterpartyGuid) {
      setError('Сначала выберите контрагента');
      return;
    }
    setLoadingProducts(true);
    try {
      setProducts(
        await searchClientOrderProducts({
          search: productSearch || undefined,
          counterpartyGuid: draft.counterpartyGuid,
          agreementGuid: draft.agreementGuid || undefined,
          limit: 30,
          offset: 0,
        })
      );
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить товары');
    } finally {
      setLoadingProducts(false);
    }
  };

  const buildPayload = () => {
    if (!draft.counterpartyGuid) throw new Error('Выберите контрагента');
    if (!draft.items.length) throw new Error('Добавьте хотя бы одну строку');

    const generalDiscountPercent = draft.generalDiscountPercent.trim() ? asNumber(draft.generalDiscountPercent) : undefined;
    if (generalDiscountPercent !== undefined && (Number.isNaN(generalDiscountPercent) || generalDiscountPercent < 0 || generalDiscountPercent > 100)) {
      throw new Error('Общая скидка должна быть в диапазоне 0-100');
    }

    return {
      counterpartyGuid: draft.counterpartyGuid,
      agreementGuid: draft.agreementGuid || null,
      contractGuid: draft.contractGuid || null,
      warehouseGuid: draft.warehouseGuid || null,
      deliveryAddressGuid: draft.deliveryAddressGuid || null,
      deliveryDate: draft.deliveryDate || undefined,
      comment: draft.comment.trim() || undefined,
      currency: draft.currency.trim() || undefined,
      generalDiscountPercent,
      items: draft.items.map((item) => {
        const quantity = asNumber(item.quantity);
        const manualPrice = item.manualPrice.trim() ? asNumber(item.manualPrice) : undefined;
        const discountPercent = item.discountPercent.trim() ? asNumber(item.discountPercent) : undefined;
        if (Number.isNaN(quantity) || quantity <= 0) throw new Error(`Проверьте количество у "${item.productName}"`);
        if (manualPrice !== undefined && (Number.isNaN(manualPrice) || manualPrice <= 0)) throw new Error(`Проверьте ручную цену у "${item.productName}"`);
        if (discountPercent !== undefined && (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100)) {
          throw new Error(`Скидка у "${item.productName}" должна быть в диапазоне 0-100`);
        }
        return {
          productGuid: item.productGuid,
          packageGuid: item.packageGuid || undefined,
          quantity,
          manualPrice,
          discountPercent,
          comment: item.comment.trim() || undefined,
        };
      }),
    };
  };

  const save = async () => {
    try {
      setSaving(true);
      const payload = buildPayload();
      const order = draft.guid
        ? await updateClientOrder(draft.guid, { ...payload, revision: draft.revision })
        : await createClientOrder(payload);
      notify({
        type: 'success',
        title: draft.guid ? 'Заказ обновлен' : 'Заказ создан',
        message: draft.guid ? 'Изменения сохранены' : 'Черновик сохранен',
      });
      await loadOrders();
      setSelectedGuid(order.guid);
      await loadDetail(order.guid);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить заказ');
      notify({
        type: 'error',
        title: 'Ошибка сохранения',
        message: e?.message || 'Не удалось сохранить заказ',
      });
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!draft.guid) {
      await save();
      return;
    }
    try {
      setSubmitting(true);
      const order = await submitClientOrder(draft.guid, draft.revision);
      notify({
        type: 'success',
        title: 'Заказ отправлен',
        message: 'Заказ передан в очередь 1С',
      });
      await loadOrders();
      setSelectedGuid(order.guid);
      await loadDetail(order.guid);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить заказ');
      notify({
        type: 'error',
        title: 'Ошибка отправки',
        message: e?.message || 'Не удалось отправить заказ',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const runCancel = async () => {
    if (!draft.guid) {
      setSelectedGuid(null);
      setSelectedOrder(null);
      setDraft(emptyDraft());
      setProducts([]);
      return;
    }
    try {
      setCancelling(true);
      const order = await cancelClientOrder(draft.guid, draft.revision, 'Отменено менеджером из приложения');
      notify({
        type: 'warning',
        title: 'Заказ отменен',
        message: 'Статус заказа обновлен',
      });
      await loadOrders();
      setSelectedGuid(order.guid);
      await loadDetail(order.guid);
    } catch (e: any) {
      setError(e?.message || 'Не удалось отменить заказ');
    } finally {
      setCancelling(false);
    }
  };

  const cancel = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Отменить этот заказ?')) void runCancel();
      return;
    }
    Alert.alert('Отменить заказ', 'Заказ будет переведен в статус "Отменен". Продолжить?', [
      { text: 'Нет', style: 'cancel' },
      { text: 'Да', style: 'destructive', onPress: () => void runCancel() },
    ]);
  };

  const listPane = (
    <View style={[styles.pane, styles.listPane, { backgroundColor: card }]}>
      <Text style={styles.title}>Заказы клиентов</Text>
      <Text style={styles.subtitle}>Черновики менеджера и документы из 1С</Text>
      <View style={styles.rowWrap}>
        <TextInput
          value={ordersSearch}
          onChangeText={setOrdersSearch}
          placeholder="Поиск заказов"
          placeholderTextColor="#94A3B8"
          style={styles.input}
        />
        <Dropdown items={statusItems} value={statusFilter} onChange={setStatusFilter} placeholder="Статус" style={styles.flexMin} />
        <Pressable style={styles.secondaryBtn} onPress={() => void loadOrders()}>
          <Text style={styles.secondaryText}>Обновить</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.primaryBtn}
        onPress={() => {
          setSelectedGuid(null);
          setSelectedOrder(null);
          setDraft(emptyDraft());
          setProducts([]);
          setError(null);
        }}
      >
        <Text style={styles.primaryText}>Новый заказ</Text>
      </Pressable>
      {loadingOrders ? <ActivityIndicator style={{ marginTop: 12 }} color="#2563EB" /> : null}
      <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ gap: 10 }}>
        {orders.map((order) => (
          <Pressable
            key={order.guid}
            onPress={() => setSelectedGuid(order.guid)}
            style={[styles.listCard, selectedGuid === order.guid && styles.listCardActive]}
          >
            <Text style={styles.listTitle}>
              {order.number1c ? `Заказ ${order.number1c}` : `Черновик ${order.guid.slice(0, 8)}`}
            </Text>
            <Text style={styles.listMeta}>{order.counterparty?.name || 'Контрагент не выбран'}</Text>
            <Text style={styles.listMeta}>
              {STATUS_LABELS[order.status] || order.status} • {SYNC_LABELS[order.syncState] || order.syncState}
            </Text>
            <Text style={styles.listMeta}>
              Revision {order.revision} • {formatDateTime(order.updatedAt || order.queuedAt || order.sentTo1cAt)}
            </Text>
          </Pressable>
        ))}
        {!orders.length && !loadingOrders ? <Text style={styles.muted}>Заказы пока отсутствуют.</Text> : null}
      </ScrollView>
    </View>
  );

  const detailPane = (
    <View style={[styles.pane, styles.detailPane, { backgroundColor: card }]}>
      <Text style={styles.title}>
        {draftMode
          ? 'Новый заказ клиента'
          : selectedOrder?.number1c
            ? `Заказ 1С ${selectedOrder.number1c}`
            : 'Карточка заказа'}
      </Text>
      <Text style={styles.subtitle}>
        {draftMode
          ? 'Черновик живет в API до создания документа в 1С'
          : `${STATUS_LABELS[selectedOrder?.status || ''] || selectedOrder?.status || '—'} • ${
              SYNC_LABELS[selectedOrder?.syncState || ''] || selectedOrder?.syncState || '—'
            }`}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.rowWrap}>
        <Pressable style={styles.secondaryBtn} onPress={() => void refreshAll()}>
          <Text style={styles.secondaryText}>Обновить</Text>
        </Pressable>
        <Pressable style={[styles.secondaryBtn, (readOnly || cancelling) && styles.disabled]} disabled={readOnly || cancelling} onPress={cancel}>
          <Text style={styles.secondaryText}>{cancelling ? 'Отмена...' : 'Отменить'}</Text>
        </Pressable>
        <Pressable style={[styles.primaryBtn, (saving || readOnly) && styles.disabled]} disabled={saving || readOnly} onPress={() => void save()}>
          <Text style={styles.primaryText}>{saving ? 'Сохраняю...' : 'Сохранить'}</Text>
        </Pressable>
        <Pressable style={[styles.primaryBtn, (submitting || readOnly) && styles.disabled]} disabled={submitting || readOnly} onPress={() => void send()}>
          <Text style={styles.primaryText}>{submitting ? 'Отправляю...' : 'Отправить в 1С'}</Text>
        </Pressable>
      </View>
      {loadingDetail ? <ActivityIndicator style={{ marginTop: 12 }} color="#2563EB" /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />} contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <View style={styles.grid}>
          <View style={styles.field}>
            <Text style={styles.label}>Контрагент</Text>
            <Dropdown items={counterpartyItems} value={draft.counterpartyGuid} onChange={(v) => setPatch({ counterpartyGuid: v, agreementGuid: '', contractGuid: '', warehouseGuid: '', deliveryAddressGuid: '' })} placeholder="Выберите контрагента" buttonStyle={readOnly ? styles.readOnly : undefined} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Соглашение</Text>
            <Dropdown items={agreementItems} value={draft.agreementGuid} onChange={(v) => setPatch({ agreementGuid: v })} placeholder="Выберите соглашение" buttonStyle={readOnly ? styles.readOnly : undefined} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Договор</Text>
            <Dropdown items={contractItems} value={draft.contractGuid} onChange={(v) => setPatch({ contractGuid: v })} placeholder="Выберите договор" buttonStyle={readOnly ? styles.readOnly : undefined} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Склад</Text>
            <Dropdown items={warehouseItems} value={draft.warehouseGuid} onChange={(v) => setPatch({ warehouseGuid: v })} placeholder="Выберите склад" buttonStyle={readOnly ? styles.readOnly : undefined} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Адрес доставки</Text>
            <Dropdown items={addressItems} value={draft.deliveryAddressGuid} onChange={(v) => setPatch({ deliveryAddressGuid: v })} placeholder="Выберите адрес" buttonStyle={readOnly ? styles.readOnly : undefined} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Дата доставки</Text>
            <DateTimeInput value={draft.deliveryDate || undefined} onChange={(iso) => setPatch({ deliveryDate: iso })} allowClear onClear={() => setPatch({ deliveryDate: null })} disabled={readOnly} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Общая скидка, %</Text>
            <TextInput value={draft.generalDiscountPercent} onChangeText={(v) => setPatch({ generalDiscountPercent: v })} editable={!readOnly} placeholder="0" placeholderTextColor="#94A3B8" style={[styles.input, readOnly && styles.readOnly]} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Валюта</Text>
            <TextInput value={draft.currency} onChangeText={(v) => setPatch({ currency: v })} editable={!readOnly} placeholder="RUB" placeholderTextColor="#94A3B8" style={[styles.input, readOnly && styles.readOnly]} />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Комментарий</Text>
          <TextInput value={draft.comment} onChangeText={(v) => setPatch({ comment: v })} editable={!readOnly} multiline placeholder="Комментарий менеджера" placeholderTextColor="#94A3B8" style={[styles.textArea, readOnly && styles.readOnly]} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Строки заказа</Text>
          <Text style={styles.muted}>Итог: {formatMoney(localTotal, draft.currency || selectedOrder?.currency)}</Text>
          {!draft.items.length ? <Text style={styles.muted}>Добавьте товары через поиск ниже.</Text> : null}
          {draft.items.map((item) => {
            const packageItems: DropdownItem<string>[] = item.packages.map((pack) => ({ label: pack.name, value: pack.guid }));
            const quantity = asNumber(item.quantity);
            const manual = item.manualPrice.trim() ? asNumber(item.manualPrice) : undefined;
            const discount = item.discountPercent.trim() ? asNumber(item.discountPercent) : draft.generalDiscountPercent.trim() ? asNumber(draft.generalDiscountPercent) : 0;
            const price = manual ?? item.basePrice ?? 0;
            const lineTotal = (Number.isNaN(quantity) ? 0 : quantity) * price * (1 - (Number.isNaN(discount) ? 0 : discount) / 100);
            return (
              <View key={item.key} style={styles.lineCard}>
                <View style={styles.rowWrap}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineTitle}>{item.productName}</Text>
                    <Text style={styles.lineMeta}>{item.productCode || 'Без кода'} • {formatMoney(item.basePrice, item.currency || draft.currency)}</Text>
                  </View>
                  <Pressable style={[styles.secondaryBtn, readOnly && styles.disabled]} disabled={readOnly} onPress={() => setDraft((prev) => ({ ...prev, items: prev.items.filter((x) => x.key !== item.key) }))}>
                    <Text style={styles.secondaryText}>Удалить</Text>
                  </Pressable>
                </View>
                <View style={styles.grid}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Количество</Text>
                    <TextInput value={item.quantity} onChangeText={(v) => setItemPatch(item.key, { quantity: v })} editable={!readOnly} keyboardType="decimal-pad" style={[styles.input, readOnly && styles.readOnly]} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Упаковка</Text>
                    <Dropdown items={packageItems} value={item.packageGuid ?? undefined} onChange={(v) => setItemPatch(item.key, { packageGuid: v })} placeholder="Упаковка" buttonStyle={readOnly ? styles.readOnly : undefined} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Ручная цена</Text>
                    <TextInput value={item.manualPrice} onChangeText={(v) => setItemPatch(item.key, { manualPrice: v })} editable={!readOnly} keyboardType="decimal-pad" placeholder="Авто" placeholderTextColor="#94A3B8" style={[styles.input, readOnly && styles.readOnly]} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Скидка строки, %</Text>
                    <TextInput value={item.discountPercent} onChangeText={(v) => setItemPatch(item.key, { discountPercent: v })} editable={!readOnly} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#94A3B8" style={[styles.input, readOnly && styles.readOnly]} />
                  </View>
                </View>
                <View style={styles.rowWrap}>
                  <Text style={styles.lineMeta}>Итог строки: {formatMoney(lineTotal, item.currency || draft.currency)}</Text>
                  <Text style={styles.lineMeta}>Источник цены: {item.priceSource || 'не определен'}</Text>
                  {!readOnly ? <Pressable style={styles.linkBtn} onPress={() => setItemPatch(item.key, { manualPrice: '' })}><Text style={styles.linkText}>Сбросить ручную цену</Text></Pressable> : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Поиск товаров</Text>
          <View style={styles.rowWrap}>
            <TextInput value={productSearch} onChangeText={setProductSearch} editable={!readOnly} placeholder={draft.counterpartyGuid ? 'Название, код или артикул' : 'Сначала выберите контрагента'} placeholderTextColor="#94A3B8" style={styles.input} />
            <Pressable style={styles.secondaryBtn} onPress={() => void loadProducts()} disabled={loadingProducts}>
              <Text style={styles.secondaryText}>{loadingProducts ? 'Поиск...' : 'Найти'}</Text>
            </Pressable>
          </View>
          {loadingRefs ? <Text style={styles.muted}>Загружаю справочники...</Text> : null}
          {products.map((product) => (
            <View key={product.guid} style={styles.productCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineTitle}>{product.name}</Text>
                <Text style={styles.lineMeta}>{product.code || 'Без кода'} • {formatMoney(product.basePrice, product.currency)}</Text>
                {product.priceError ? <Text style={styles.error}>{product.priceError}</Text> : null}
              </View>
              <Pressable style={[styles.primaryBtn, (readOnly || product.basePrice === null || product.basePrice === undefined) && styles.disabled]} disabled={readOnly || product.basePrice === null || product.basePrice === undefined} onPress={() => addProduct(product)}>
                <Text style={styles.primaryText}>Добавить</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Статус и 1С</Text>
          <Text style={styles.muted}>Revision: {draft.revision || '—'}</Text>
          <Text style={styles.muted}>Sync state: {SYNC_LABELS[selectedOrder?.syncState || ''] || selectedOrder?.syncState || '—'}</Text>
          <Text style={styles.muted}>Статус: {STATUS_LABELS[selectedOrder?.status || ''] || selectedOrder?.status || '—'}</Text>
          <Text style={styles.muted}>Организация: {selectedOrder?.organization?.name || 'Определит 1С'}</Text>
          <Text style={styles.muted}>Документ 1С: {selectedOrder?.number1c ? `${selectedOrder.number1c} от ${formatDateTime(selectedOrder.date1c)}` : 'Еще не создан'}</Text>
          <Text style={styles.muted}>Проведен: {selectedOrder?.isPostedIn1c ? 'Да' : 'Нет'}</Text>
          {selectedOrder?.last1cError ? <Text style={styles.error}>Последняя ошибка 1С: {selectedOrder.last1cError}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>История событий</Text>
          {!selectedOrder?.events.length ? <Text style={styles.muted}>Событий пока нет.</Text> : null}
          {selectedOrder?.events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <Text style={styles.lineTitle}>{event.eventType} • rev {event.revision}</Text>
              <Text style={styles.lineMeta}>{event.source} • {formatDateTime(event.createdAt)}</Text>
              {event.note ? <Text style={styles.lineMeta}>{event.note}</Text> : null}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Последний snapshot из 1С</Text>
          {selectedOrder?.last1cSnapshot ? <Text style={styles.snapshot}>{JSON.stringify(selectedOrder.last1cSnapshot, null, 2)}</Text> : <Text style={styles.muted}>Снимок из 1С еще не получен.</Text>}
        </View>
        <TabBarSpacer />
      </ScrollView>
    </View>
  );

  if (!split) {
    return <ScrollView style={{ flex: 1, backgroundColor: background }} contentContainerStyle={{ paddingTop: topInset + 16, paddingHorizontal: 16, paddingBottom: 16, gap: 16 }}>{listPane}{detailPane}</ScrollView>;
  }

  return <View style={{ flex: 1, backgroundColor: background, paddingTop: topInset + 16, paddingHorizontal: 16, paddingBottom: 16 }}><View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>{listPane}{detailPane}</View></View>;
}

const styles = StyleSheet.create({
  pane: { borderRadius: 24, borderWidth: 1, borderColor: '#D8E2F0', padding: 16 },
  listPane: { width: 380 },
  detailPane: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#64748B', fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { minWidth: 220, flex: 1, gap: 6 },
  label: { color: '#475569', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 46, minWidth: 220, flexGrow: 1, borderWidth: 1, borderColor: '#D6E0EE', borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#0F172A', fontSize: 14, fontWeight: '600' },
  textArea: { minHeight: 96, borderWidth: 1, borderColor: '#D6E0EE', borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, color: '#0F172A', fontSize: 14, fontWeight: '600', textAlignVertical: 'top' },
  readOnly: { backgroundColor: '#F8FAFC' },
  primaryBtn: { minHeight: 44, borderRadius: 12, backgroundColor: '#2563EB', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  secondaryBtn: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#0F172A', fontSize: 13, fontWeight: '700' },
  linkBtn: { paddingVertical: 4 },
  linkText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  flexMin: { minWidth: 200, flexGrow: 1 },
  listCard: { borderRadius: 18, borderWidth: 1, borderColor: '#D6E0EE', backgroundColor: '#FFFFFF', padding: 14, gap: 6 },
  listCardActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  listTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  listMeta: { color: '#64748B', fontSize: 12 },
  section: { borderRadius: 20, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', padding: 16, gap: 12 },
  sectionTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  muted: { color: '#64748B', fontSize: 13 },
  lineCard: { borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 14, gap: 10 },
  lineTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  lineMeta: { color: '#64748B', fontSize: 12 },
  productCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  eventCard: { borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 12, gap: 4 },
  snapshot: { color: '#0F172A', fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', web: 'monospace' }) },
  error: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },
});
