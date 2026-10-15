import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { StockMovement } from './products';

export function movementDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year.slice(-2)}` : '—';
}
function money(value: number, currency: string) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${/^(руб\.?|RUB|₽)$/i.test(currency.trim()) ? '₽' : currency}`;
}
const Info = ({ icon, children }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; children: React.ReactNode }) =>
  <View style={styles.info}><MaterialCommunityIcons name={icon} size={15} color="#64748B" /><Text style={styles.secondary}>{children}</Text></View>;

export const StockMovementRow = React.memo(function StockMovementRow({ item, unit }: { item: StockMovement; unit: string }) {
  return <View style={styles.row}>
    <Text style={styles.kind}>{item.operationKind}</Text>
    <View style={styles.heading}><Text style={styles.number}>{item.document.number || 'Без номера'} от {movementDate(item.document.date)}</Text>
      <Text style={styles.quantity}>{item.direction === 'receipt' ? '+' : '−'}{item.quantity.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}{unit ? ` ${unit}` : ''}</Text></View>
    {item.operationKind !== item.document.typeName ? <Text style={styles.note}>{item.document.typeName}</Text> : null}
    {item.movementAt.slice(0, 10) !== item.document.date ? <Text style={styles.note}>Движение по складу: {movementDate(item.movementAt)}</Text> : null}
    <Info icon="warehouse">{item.warehouse.name}</Info>
    {item.characteristic ? <Info icon="tag-outline">{item.characteristic}</Info> : null}
    {item.counterparty ? <Info icon="account-outline">{item.counterparty}</Info> : null}
    {item.writeOffArticles.map(article => <Info key={article} icon="text-box-minus-outline">{article}</Info>)}
    {item.baseDocuments.map(doc => <Text key={`${doc.type}:${doc.guid}`} style={styles.note}>
      {doc.typeName}: {doc.number || 'Без номера'} от {movementDate(doc.date)}
    </Text>)}
    {item.price !== null ? <Tooltip title={item.costReason || 'Цена с НДС за единицу хранения'}><View style={styles.prices} accessible
      accessibilityLabel={`Цена с НДС ${money(item.price, item.currency)}${item.amount !== null ? `, сумма ${money(item.amount, item.currency)}` : ''}`}>
      <MaterialCommunityIcons name="cash-multiple" size={17} color="#64748B" /><Text style={styles.secondary}>Цена с НДС</Text>
      <Text style={styles.price}>{money(item.price, item.currency)}</Text>
      {item.amount !== null ? <Text style={styles.total}>Σ {money(item.amount, item.currency)}</Text> : null}
    </View></Tooltip> : null}
    {item.costStatus === 'PRELIMINARY' ? <Text style={styles.preliminary}>Предварительная стоимость · допрасходы по данным 1С</Text>
      : item.costStatus === 'UNAVAILABLE' && item.costReason ? <Text style={styles.note}>{item.costReason}</Text> : null}
  </View>;
});
const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  kind: { fontSize: 11, color: '#64748B' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  number: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#0F172A' },
  quantity: { flexShrink: 0, fontSize: 13, fontWeight: '700', color: '#2563EB' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  secondary: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: '#475569' },
  note: { fontSize: 11, lineHeight: 15, color: '#64748B' },
  prices: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, paddingTop: 2 },
  price: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
  total: { fontSize: 12, color: '#475569', marginLeft: 4 },
  preliminary: { fontSize: 11, lineHeight: 15, color: '#92400E' },
});
