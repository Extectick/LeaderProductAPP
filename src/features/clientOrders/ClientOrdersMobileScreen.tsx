import TabBarSpacer from '@/components/Navigation/TabBarSpacer';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import DateTimeInput from '@/components/ui/DateTimeInput';
import Dropdown, { type DropdownItem } from '@/components/ui/Dropdown';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
  computeLineTotal,
  formatDateTime,
  formatMoney,
  type DraftItem,
} from '@/src/features/clientOrders/clientOrdersShared';
import { useClientOrdersWorkspace } from '@/src/features/clientOrders/useClientOrdersWorkspace';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type TabKey = 'orders' | 'editor';

export default function ClientOrdersMobileScreen() {
  const workspace = useClientOrdersWorkspace();
  const topInset = useHeaderContentTopInset({ hasSubtitle: true });
  const background = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'cardBackground');
  const [tab, setTab] = React.useState<TabKey>('orders');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [productsOpen, setProductsOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

  const counterpartyItems: DropdownItem<string>[] = workspace.refs.counterparties.map((item) => ({
    label: item.name,
    value: item.guid,
  }));
  const agreementItems: DropdownItem<string>[] = workspace.refs.agreements.map((item) => ({
    label: item.name,
    value: item.guid,
  }));
  const contractItems: DropdownItem<string>[] = workspace.refs.contracts.map((item) => ({
    label: item.number,
    value: item.guid,
  }));
  const warehouseItems: DropdownItem<string>[] = workspace.refs.warehouses.map((item) => ({
    label: item.name,
    value: item.guid,
  }));
  const addressItems: DropdownItem<string>[] = workspace.refs.deliveryAddresses
    .filter((item) => item.guid)
    .map((item) => ({ label: item.fullAddress, value: item.guid as string }));
  const filterCounterpartyItems: DropdownItem<string>[] = workspace.allCounterparties.map((item) => ({
    label: item.name,
    value: item.guid,
  }));
  const statusItems: DropdownItem<string>[] = [
    { label: 'Все статусы', value: '' },
    ...Object.entries(workspace.statusLabels).map(([value, label]) => ({ label, value })),
  ];

  return (
    <View style={[styles.screen, { backgroundColor: background, paddingTop: topInset + 12 }]}>
      <View style={styles.segmentRow}>
        <SegmentButton label="Заказы" active={tab === 'orders'} onPress={() => setTab('orders')} />
        <SegmentButton label="Редактор" active={tab === 'editor'} onPress={() => setTab('editor')} />
      </View>

      {tab === 'orders' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.panel, { backgroundColor: card }]}>
            <Text style={styles.title}>Заказы клиентов</Text>
            <Text style={styles.subtitle}>Список заказов, фильтры и запуск нового черновика</Text>
            <View style={styles.row}>
              <ActionButton label="Фильтры" kind="secondary" onPress={() => setFiltersOpen(true)} />
              <ActionButton label="Обновить" kind="secondary" onPress={() => void workspace.refreshAll()} />
            </View>
            <ActionButton label="Новый заказ" kind="primary" onPress={() => { void workspace.createNewOrder(); setTab('editor'); }} />
            <View style={styles.chipRow}>
              <InfoChip label={`Всего ${workspace.statusCounts.all}`} />
              <InfoChip label={`Черновики ${workspace.statusCounts.draft}`} />
              <InfoChip label={`В очереди ${workspace.statusCounts.queued}`} />
            </View>
          </View>

          {workspace.orders.map((order) => (
            <Pressable
              key={order.guid}
              onPress={() => {
                void workspace.selectOrder(order.guid);
                setTab('editor');
              }}
              style={[styles.orderCard, workspace.selectedGuid === order.guid && styles.orderCardActive]}
            >
              <Text style={styles.orderTitle}>
                {order.number1c ? `Заказ ${order.number1c}` : `Черновик ${order.guid.slice(0, 8)}`}
              </Text>
              <Text style={styles.orderMeta}>{order.counterparty?.name || 'Контрагент не выбран'}</Text>
              <Text style={styles.orderMeta}>
                {workspace.statusLabels[order.status] || order.status} • {workspace.syncLabels[order.syncState] || order.syncState}
              </Text>
              <Text style={styles.orderMeta}>{formatDateTime(order.updatedAt || order.queuedAt || order.sentTo1cAt)}</Text>
            </Pressable>
          ))}
          {!workspace.orders.length ? <Text style={styles.muted}>Заказы по текущему фильтру не найдены.</Text> : null}
          <TabBarSpacer />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.panel, { backgroundColor: card }]}>
            <Text style={styles.title}>
              {workspace.draftMode ? 'Новый заказ клиента' : workspace.selectedOrder?.number1c ? `Заказ ${workspace.selectedOrder.number1c}` : 'Черновик'}
            </Text>
            <Text style={styles.subtitle}>{workspace.autosaveLabel}</Text>
            {workspace.error ? <Text style={styles.error}>{workspace.error}</Text> : null}
            {workspace.autosaveError ? <Text style={styles.error}>{workspace.autosaveError}</Text> : null}
          </View>

          <Section title="Реквизиты">
            <Field label="Контрагент">
              <Dropdown items={counterpartyItems} value={workspace.draft.counterpartyGuid} onChange={workspace.setCounterparty} placeholder="Выберите контрагента" />
            </Field>
            <Field label="Соглашение">
              <Dropdown items={agreementItems} value={workspace.draft.agreementGuid} onChange={workspace.setAgreement} placeholder="Выберите соглашение" />
            </Field>
            <Field label="Договор">
              <Dropdown items={contractItems} value={workspace.draft.contractGuid} onChange={(value) => workspace.patchDraft({ contractGuid: value })} placeholder="Выберите договор" />
            </Field>
            <Field label="Склад">
              <Dropdown items={warehouseItems} value={workspace.draft.warehouseGuid} onChange={(value) => workspace.patchDraft({ warehouseGuid: value })} placeholder="Выберите склад" />
            </Field>
            <Field label="Адрес доставки">
              <Dropdown items={addressItems} value={workspace.draft.deliveryAddressGuid} onChange={(value) => workspace.patchDraft({ deliveryAddressGuid: value })} placeholder="Выберите адрес" />
            </Field>
            <Field label="Дата доставки">
              <DateTimeInput
                value={workspace.draft.deliveryDate || undefined}
                onChange={(iso) => workspace.patchDraft({ deliveryDate: iso })}
                allowClear
                onClear={() => workspace.patchDraft({ deliveryDate: null })}
              />
            </Field>
            <Field label="Общая скидка, %">
              <TextInput style={styles.input} value={workspace.draft.generalDiscountPercent} onChangeText={(value) => workspace.patchDraft({ generalDiscountPercent: value })} placeholder="0" placeholderTextColor="#94A3B8" />
            </Field>
            <Field label="Валюта">
              <TextInput style={styles.input} value={workspace.draft.currency} onChangeText={(value) => workspace.patchDraft({ currency: value })} placeholder="RUB" placeholderTextColor="#94A3B8" />
            </Field>
          </Section>

          <Section title="Комментарий">
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={workspace.draft.comment}
              onChangeText={(value) => workspace.patchDraft({ comment: value })}
              placeholder="Комментарий менеджера"
              placeholderTextColor="#94A3B8"
            />
          </Section>

          <Section title={`Строки заказа • ${formatMoney(workspace.localTotal, workspace.draft.currency || workspace.selectedOrder?.currency)}`}>
            {!workspace.draft.items.length ? <Text style={styles.muted}>Добавьте товары через подбор.</Text> : null}
            {workspace.draft.items.map((item) => (
              <LineCard
                key={item.key}
                item={item}
                generalDiscountPercent={workspace.draft.generalDiscountPercent}
                currency={workspace.draft.currency}
                messages={workspace.validation.itemMessages[item.key] || []}
                onPatch={(patch) => workspace.setItemPatch(item.key, patch)}
                onRemove={() => workspace.removeItem(item.key)}
              />
            ))}
          </Section>

          <Section title="Добавить товары">
            <ActionButton label="Открыть подбор товаров" kind="secondary" onPress={() => setProductsOpen(true)} />
            {!workspace.draft.counterpartyGuid ? <Text style={styles.warning}>Для подбора сначала выберите контрагента.</Text> : null}
          </Section>

          <TabBarSpacer />
        </ScrollView>
      )}

      <View style={styles.bottomBar}>
        <ActionButton label="Инспектор" kind="secondary" onPress={() => setInspectorOpen(true)} />
        <ActionButton label="Сохранить" kind="secondary" onPress={() => void workspace.saveDraft({ reason: 'manual' })} />
        <ActionButton label="В 1С" kind="primary" onPress={() => void workspace.submitOrder()} />
      </View>

      <SheetModal visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры списка">
        <Field label="Поиск">
          <TextInput
            style={styles.input}
            value={workspace.filters.search}
            onChangeText={(value) => workspace.setFilters((prev) => ({ ...prev, search: value }))}
            placeholder="Номер, контрагент, комментарий"
            placeholderTextColor="#94A3B8"
          />
        </Field>
        <Field label="Статус">
          <Dropdown items={statusItems} value={workspace.filters.status} onChange={(value) => workspace.setFilters((prev) => ({ ...prev, status: value }))} placeholder="Все статусы" />
        </Field>
        <Field label="Контрагент">
          <Dropdown items={filterCounterpartyItems} value={workspace.filters.counterpartyGuid} onChange={(value) => workspace.setFilters((prev) => ({ ...prev, counterpartyGuid: value }))} placeholder="Все контрагенты" />
        </Field>
        <View style={styles.row}>
          <ActionButton label="Сбросить" kind="secondary" onPress={() => workspace.clearFilters()} />
          <ActionButton label="Закрыть" kind="primary" onPress={() => setFiltersOpen(false)} />
        </View>
      </SheetModal>

      <SheetModal visible={productsOpen} onClose={() => setProductsOpen(false)} title="Подбор товаров" fullScreen>
        <Field label="Поиск товара">
          <TextInput
            style={styles.input}
            value={workspace.productSearch}
            onChangeText={workspace.setProductSearch}
            placeholder="Название, код, артикул"
            placeholderTextColor="#94A3B8"
          />
        </Field>
        <ActionButton label={workspace.loadingProducts ? 'Ищу...' : 'Найти'} kind="primary" onPress={() => void workspace.loadProducts()} />
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
          {workspace.products.map((product) => (
            <View key={product.guid} style={styles.productCard}>
              <Text style={styles.orderTitle}>{product.name}</Text>
              <Text style={styles.orderMeta}>{product.code || 'Без кода'} • {formatMoney(product.basePrice, product.currency)}</Text>
              {product.priceError ? <Text style={styles.warning}>{product.priceError}</Text> : null}
              <ActionButton label="Добавить в заказ" kind="secondary" onPress={() => workspace.addProduct(product)} />
            </View>
          ))}
        </ScrollView>
      </SheetModal>

      <SheetModal visible={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Инспектор заказа">
        <Section title="Статус и 1С">
          <Text style={styles.orderMeta}>Revision: {workspace.draft.revision || '—'}</Text>
          <Text style={styles.orderMeta}>
            Sync state: {workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'}
          </Text>
          <Text style={styles.orderMeta}>
            Статус: {workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'}
          </Text>
          <Text style={styles.orderMeta}>Документ 1С: {workspace.selectedOrder?.number1c || 'Еще не создан'}</Text>
          {workspace.selectedOrder?.last1cError ? <Text style={styles.error}>{workspace.selectedOrder.last1cError}</Text> : null}
        </Section>
        <Section title="История">
          {!workspace.selectedOrder?.events.length ? <Text style={styles.muted}>Событий пока нет.</Text> : null}
          {workspace.selectedOrder?.events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <Text style={styles.orderTitle}>{event.eventType} • rev {event.revision}</Text>
              <Text style={styles.orderMeta}>{event.source} • {formatDateTime(event.createdAt)}</Text>
              {event.note ? <Text style={styles.orderMeta}>{event.note}</Text> : null}
            </View>
          ))}
        </Section>
      </SheetModal>
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, kind, onPress }: { label: string; kind: 'primary' | 'secondary'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, kind === 'primary' ? styles.actionPrimary : styles.actionSecondary]}>
      <Text style={[styles.actionText, kind === 'primary' ? styles.actionPrimaryText : styles.actionSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View style={styles.infoChip}>
      <Text style={styles.infoChipText}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function LineCard(props: {
  item: DraftItem;
  generalDiscountPercent: string;
  currency: string;
  messages: string[];
  onPatch: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const packageItems: DropdownItem<string>[] = props.item.packages.map((pack) => ({ label: pack.name, value: pack.guid }));
  return (
    <View style={styles.lineCard}>
      <Text style={styles.orderTitle}>{props.item.productName}</Text>
      <Text style={styles.orderMeta}>
        {props.item.productCode || 'Без кода'} • база {formatMoney(props.item.basePrice, props.item.currency || props.currency)}
      </Text>
      <Field label="Количество">
        <TextInput style={styles.input} value={props.item.quantity} onChangeText={(value) => props.onPatch({ quantity: value })} placeholder="1" placeholderTextColor="#94A3B8" />
      </Field>
      <Field label="Упаковка">
        <Dropdown items={packageItems} value={props.item.packageGuid || undefined} onChange={(value) => props.onPatch({ packageGuid: value })} placeholder="Упаковка" />
      </Field>
      <Field label="Ручная цена">
        <TextInput style={styles.input} value={props.item.manualPrice} onChangeText={(value) => props.onPatch({ manualPrice: value })} placeholder="Авто" placeholderTextColor="#94A3B8" />
      </Field>
      <Field label="Скидка %">
        <TextInput style={styles.input} value={props.item.discountPercent} onChangeText={(value) => props.onPatch({ discountPercent: value })} placeholder="0" placeholderTextColor="#94A3B8" />
      </Field>
      <Text style={styles.orderMeta}>
        Итого строки: {formatMoney(computeLineTotal(props.item, props.generalDiscountPercent), props.item.currency || props.currency)}
      </Text>
      <Text style={styles.orderMeta}>Источник цены: {props.item.priceSource || 'не определен'}</Text>
      {props.messages.map((message) => (
        <Text key={message} style={styles.error}>{message}</Text>
      ))}
      <View style={styles.row}>
        <ActionButton label="Сбросить цену" kind="secondary" onPress={() => props.onPatch({ manualPrice: '' })} />
        <ActionButton label="Удалить" kind="secondary" onPress={props.onRemove} />
      </View>
    </View>
  );
}

function SheetModal(props: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  fullScreen?: boolean;
}) {
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={[styles.modalCard, props.fullScreen && styles.modalCardFull]}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>{props.title}</Text>
            <Pressable onPress={props.onClose}>
              <Text style={styles.actionSecondaryText}>Закрыть</Text>
            </Pressable>
          </View>
          <View style={{ gap: 14, flex: 1 }}>{props.children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 110, gap: 14 },
  segmentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  segmentButton: { flex: 1, minHeight: 44, borderRadius: 16, borderWidth: 1, borderColor: '#D6E0EE', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  segmentText: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  segmentTextActive: { color: '#FFFFFF' },
  panel: { borderRadius: 24, borderWidth: 1, borderColor: '#D8E2F0', padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  subtitle: { color: '#64748B', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoChip: { borderRadius: 999, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 6 },
  infoChipText: { color: '#1D4ED8', fontSize: 12, fontWeight: '800' },
  actionButton: { minHeight: 42, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: '#2563EB' },
  actionSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  actionText: { fontSize: 13, fontWeight: '800' },
  actionPrimaryText: { color: '#FFFFFF' },
  actionSecondaryText: { color: '#0F172A' },
  orderCard: { borderRadius: 20, borderWidth: 1, borderColor: '#D6E0EE', backgroundColor: '#FFFFFF', padding: 14, gap: 6 },
  orderCardActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  orderTitle: { color: '#0F172A', fontSize: 14, fontWeight: '800' },
  orderMeta: { color: '#64748B', fontSize: 12 },
  muted: { color: '#64748B', fontSize: 13 },
  warning: { color: '#B45309', fontSize: 13, fontWeight: '700' },
  error: { color: '#B91C1C', fontSize: 13, fontWeight: '700' },
  section: { borderRadius: 22, borderWidth: 1, borderColor: '#D8E2F0', backgroundColor: '#FFFFFF', padding: 16, gap: 12 },
  sectionTitle: { color: '#0F172A', fontSize: 20, fontWeight: '900' },
  label: { color: '#475569', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D6E0EE', borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#0F172A', fontSize: 14, fontWeight: '600' },
  textArea: { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' },
  lineCard: { borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 14, gap: 10 },
  productCard: { borderRadius: 18, borderWidth: 1, borderColor: '#D6E0EE', backgroundColor: '#FFFFFF', padding: 14, gap: 10 },
  eventCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 12, gap: 4 },
  bottomBar: { position: 'absolute', left: 12, right: 12, bottom: 16, flexDirection: 'row', gap: 10, padding: 12, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: '#D8E2F0' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end', padding: 12 },
  modalCard: { maxHeight: '88%', borderRadius: 24, backgroundColor: '#FFFFFF', padding: 16, gap: 14 },
  modalCardFull: { flex: 1, maxHeight: '100%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
