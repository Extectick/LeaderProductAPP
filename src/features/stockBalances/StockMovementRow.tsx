import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Tooltip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { StockMovement } from './products';
import { stockMoney } from './stockMoney';

export function movementDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year.slice(-2)}` : '—';
}
const Info = ({ icon, children }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; children: React.ReactNode }) =>
  <View style={styles.info}><MaterialCommunityIcons name={icon} size={15} color="#64748B" /><Text style={styles.secondary}>{children}</Text></View>;

export const StockMovementRow = React.memo(function StockMovementRow({ item, unit }: { item: StockMovement; unit: string }) {
  const receipt = item.direction === 'receipt';
  const priceLabel = receipt ? 'Входящая, с НДС' : item.costStatus === 'DOCUMENT' ? 'Цена продажи, с НДС' : 'Стоимость, с НДС';
  const hasPrice = item.price !== null && Number.isFinite(item.price);
  const hasAmount = item.amount !== null && Number.isFinite(item.amount);
  return <View style={styles.row}>
    <View style={styles.heading}>
      <MaterialCommunityIcons name={item.counterparty ? (receipt ? 'office-building-outline' : 'account-outline') : 'file-document-outline'} size={20} color="#2563EB" />
      <Text style={styles.title}>{item.counterparty || item.operationKind || item.document.typeName}</Text>
      <Text style={[styles.quantity, receipt && styles.receipt]}>{receipt ? '+' : '−'}{item.quantity.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}{unit ? ` ${unit}` : ''}</Text>
    </View>
    <Info icon="file-document-outline">{item.operationKind || item.document.typeName} · {item.document.number || 'Без номера'}</Info>
    {item.operationKind && item.operationKind !== item.document.typeName ? <Text style={styles.note}>{item.document.typeName}</Text> : null}
    <Info icon="calendar-blank-outline">{movementDate(item.document.date)}</Info>
    {item.movementAt.slice(0, 10) !== item.document.date.slice(0, 10) ? <Text style={styles.note}>Движение по складу: {movementDate(item.movementAt)}</Text> : null}
    <Info icon="warehouse">{item.warehouse.name}</Info>
    {item.characteristic ? <Info icon="tag-outline">{item.characteristic}</Info> : null}
    {item.writeOffArticles.map(article => <Info key={article} icon="text-box-minus-outline">{article}</Info>)}
    {item.baseDocuments.map(doc => <Text key={`${doc.type}:${doc.guid}`} style={styles.note}>
      {doc.typeName}: {doc.number || 'Без номера'} от {movementDate(doc.date)}
    </Text>)}
    <Tooltip title={item.costReason || 'Цена с НДС за единицу хранения'}><View style={styles.prices}>
      <View style={styles.priceColumn}><Text style={styles.priceLabel}>{priceLabel}</Text>
        <Text style={styles.price}>{hasPrice ? `${stockMoney(item.price!, item.currency)}${unit ? `/${unit}` : ''}` : '—'}</Text>
      </View>
      <View style={[styles.priceColumn, styles.amountColumn]}><Text style={styles.priceLabel}>Сумма</Text>
        <Text style={styles.price}>{hasAmount ? stockMoney(item.amount!, item.currency) : '—'}</Text>
      </View>
    </View></Tooltip>
    {item.costStatus === 'PRELIMINARY' ? <Text style={styles.preliminary}>Предварительная стоимость</Text>
      : item.costStatus === 'UNAVAILABLE' && item.costReason ? <Text style={styles.note}>{item.costReason}</Text> : null}
  </View>;
});
const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, fontWeight: '700', color: '#0F172A' },
  quantity: { flexShrink: 1, maxWidth: '42%', fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#2563EB', textAlign: 'right' },
  receipt: { color: '#059669' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  secondary: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: '#64748B' },
  note: { fontSize: 11, lineHeight: 15, color: '#64748B' },
  prices: { flexDirection: 'row', paddingTop: 5 },
  priceColumn: { flex: 1, minWidth: 0, gap: 2, paddingRight: 10 },
  amountColumn: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#E2E8F0', paddingLeft: 16, paddingRight: 0 },
  priceLabel: { fontSize: 12, lineHeight: 17, color: '#64748B' },
  price: { fontSize: 16, lineHeight: 21, color: '#0F172A', fontWeight: '700' },
  preliminary: { fontSize: 11, lineHeight: 15, color: '#92400E' },
});
