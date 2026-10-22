import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { StockMovement } from './products';
import { isCustomerOrderDocument, movementPresentation } from './receiptPresentation';
import { stockMoney } from './stockMoney';

export const StockCompactMovementRow = React.memo(function StockCompactMovementRow({ item, unit }: { item: StockMovement; unit: string }) {
  const [costOpen, setCostOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  React.useEffect(() => { setCostOpen(false); setDetailsOpen(false); }, [item.id]);
  const receipt = item.direction === 'receipt';
  // Receipt history contains physical accepted movements, not planned arrivals.
  // PRELIMINARY is an accounting-month flag, not a receipt acceptance status.
  const showCostHelp = item.costStatus === 'UNAVAILABLE' || (!receipt && item.costStatus === 'PRELIMINARY');
  const { transfer, source, destination, document, operation } = movementPresentation(item);
  const priceLabel = receipt ? 'Входящая цена с НДС' : item.costStatus === 'DOCUMENT' ? 'Цена продажи, с НДС' : 'Стоимость, с НДС';
  const price = item.price !== null && Number.isFinite(item.price) ? `${stockMoney(item.price, item.currency)}${unit ? `/${unit}` : ''}` : '—';
  const amount = item.amount !== null && Number.isFinite(item.amount) ? stockMoney(item.amount, item.currency) : '—';
  const costHint = item.costStatus === 'PRELIMINARY'
    ? `Предварительная стоимость. ${item.costReason || 'Стоимость может измениться после расчёта в 1С.'}`
    : item.costReason || `${priceLabel} за единицу хранения и сумма движения.`;
  const info = (name: string, icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'], color: string, label: string, bold = false) =>
    <View style={styles.info} accessible accessibilityLabel={`${label}: ${name}`}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={[styles.secondary, bold && styles.supplier]}>{name}</Text>
    </View>;
  return <View style={styles.row}>
    <View style={styles.heading}>
      <Pressable style={styles.document} onPress={() => setDetailsOpen(value => !value)} accessibilityRole="button"
        accessibilityLabel={`Документ: ${operation} ${document.number || 'Без номера'}. Подробности`} accessibilityState={{ expanded: detailsOpen }}>
        <MaterialCommunityIcons name={transfer ? 'swap-horizontal' : 'clipboard-text-outline'} size={20} color="#2563EB" />
        <Text style={styles.documentText}>{operation} {document.number || 'Без номера'}</Text>
      </Pressable>
      <Text style={[styles.quantity, !receipt && styles.expense]}>{receipt ? '+' : '−'}{item.quantity.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}{unit ? ` ${unit}` : ''}</Text>
    </View>
    {!transfer && item.counterparty ? info(item.counterparty, receipt ? 'office-building-outline' : 'account-outline', '#64748B', receipt ? 'Поставщик' : 'Контрагент', true) : null}
    {destination ? info(destination, 'warehouse', '#519A72', 'Склад получатель') : null}
    {source ? info(source, 'warehouse', '#C46B6B', 'Склад отправитель') : null}
    {detailsOpen ? <View style={styles.details}>
      <Text style={styles.note}>{item.document.typeName}: {item.document.number} · {item.document.date}</Text>
      {item.movementAt.slice(0, 10) !== item.document.date.slice(0, 10) ? <Text style={styles.note}>Движение по складу: {item.movementAt.slice(0, 10)}</Text> : null}
      {item.baseDocuments.filter(doc => !receipt || !isCustomerOrderDocument(doc)).map(doc => <Text key={`${doc.type}:${doc.guid}`} style={styles.note}>{doc.typeName}: {doc.number} · {doc.date}</Text>)}
      {item.characteristic ? <Text style={styles.note}>{item.characteristic}</Text> : null}
      {item.writeOffArticles.map(article => <Text key={article} style={styles.note}>{article}</Text>)}
      {transfer && !(receipt ? source : destination) ? <Text style={styles.note}>{receipt ? 'Склад отправитель' : 'Склад получатель'} не указан в данных движения.</Text> : null}
    </View> : null}
    <View style={styles.prices}>
      <View style={styles.priceColumn}>
        <Text style={styles.price} accessibilityLabel={`${priceLabel}: ${price}`}>{price}</Text>
        {showCostHelp ? <Pressable style={styles.question} hitSlop={6}
          onPress={() => setCostOpen(value => !value)} accessibilityRole="button" accessibilityLabel="Пояснение стоимости" accessibilityState={{ expanded: costOpen }}>
          <MaterialCommunityIcons name="help-circle-outline" size={18} color="#64748B" />
        </Pressable> : null}
      </View>
      <View style={styles.amount}><Text style={styles.price} accessibilityLabel={`Сумма: ${amount}`}>{amount}</Text></View>
    </View>
    {costOpen && showCostHelp ? <Text accessibilityLiveRegion="polite" style={styles.note}>{costHint}</Text> : null}
  </View>;
});
export const StockReceiptRow = StockCompactMovementRow;
const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#CBD5E1' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  document: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  documentText: { flexShrink: 1, fontSize: 12, lineHeight: 17, color: '#64748B' },
  quantity: { flexShrink: 0, fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#059669' },
  expense: { color: '#DC2626' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  secondary: { flex: 1, fontSize: 13, lineHeight: 19, color: '#64748B' },
  supplier: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  prices: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', marginTop: 3, paddingTop: 7, alignItems: 'center' },
  priceColumn: { flex: 1.2, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 },
  amount: { flex: 1, minWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#CBD5E1', paddingLeft: 12 },
  price: { flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#0F172A' },
  question: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  details: { gap: 3 }, note: { fontSize: 12, lineHeight: 17, color: '#64748B' },
});
