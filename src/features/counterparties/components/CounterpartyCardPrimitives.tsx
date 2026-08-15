import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { CounterpartyCardTab } from '../model/counterpartyCard.types';
import { InfoIcon } from './MetricInfoDialog';

export function SectionCard({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <MaterialCommunityIcons name={icon} size={18} color="#2563EB" />
        <Text style={styles.sectionTitle}>{title}</Text>
        <InfoIcon title={title} />
      </View>
      {children}
    </View>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.metricGrid}>{children}</View>;
}

export function Metric({ label, value, tone = 'normal', loading = false }: { label: string; value: string; tone?: 'normal' | 'danger' | 'success'; loading?: boolean }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabelRow}><Text numberOfLines={1} style={styles.metricLabel}>{label}</Text><InfoIcon title={label} /></View>
      {loading
        ? <View accessibilityLabel={`Загрузка: ${label}`} style={styles.metricValueSkeleton} />
        : <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, tone === 'danger' && styles.danger, tone === 'success' && styles.success]}>{value}</Text>}
    </View>
  );
}

export function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={[styles.infoValue, danger && styles.danger]}>{value}</Text>
    </View>
  );
}

export function SectionUnavailable({ forbidden = false, onRetry, organizationRequired = false }: { forbidden?: boolean; onRetry?: () => void; organizationRequired?: boolean }) {
  const text = organizationRequired
    ? 'Выберите организацию, чтобы увидеть данные'
    : forbidden ? 'Раздел недоступен для вашей роли' : 'Данные раздела временно недоступны';
  return (
    <View style={styles.unavailable}>
      <MaterialCommunityIcons name={organizationRequired ? 'office-building-outline' : forbidden ? 'lock-outline' : 'cloud-alert-outline'} size={27} color="#64748B" />
      <Text style={styles.unavailableText}>{text}</Text>
      {onRetry ? <Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Повторить</Text></Pressable> : null}
    </View>
  );
}

function SkeletonPeriods() {
  return <View style={styles.skeletonPeriods}>{['Неделя', 'Месяц', 'Квартал', 'Полгода', 'Свой'].map((period) => <View key={period} style={styles.skeletonPeriod}><Text style={styles.skeletonPeriodText}>{period}</Text></View>)}</View>;
}

function CounterpartyOverviewSkeleton() {
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 3 : 2;
  const cardWidth = Math.floor((width - 20) / columns);
  const overview = (columns >= 3 ? [
    ['Продажи', 'cash-multiple'], ['Прибыль', 'chart-areaspline'], ['Средний чек', 'receipt-text-outline'], ['Динамика', 'trending-up'], ['Рентабельность', 'percent-outline'], ['Заказов', 'file-document-outline'], ['Последний заказ', 'calendar-check-outline'], ['Частота заказов', 'calendar-sync-outline'],
  ] : [
    ['Продажи', 'cash-multiple'], ['Прибыль', 'chart-areaspline'], ['Динамика', 'trending-up'], ['Рентабельность', 'percent-outline'], ['Средний чек', 'receipt-text-outline'], ['Заказов', 'file-document-outline'], ['Последний заказ', 'calendar-check-outline'], ['Частота заказов', 'calendar-sync-outline'],
  ]) as ReadonlyArray<readonly [string, React.ComponentProps<typeof MaterialCommunityIcons>['name']]>;
  return <View style={styles.skeletonWrap}>
    <SkeletonPeriods />
    <View style={styles.skeletonGridSection}><View style={styles.skeletonHeading}><MaterialCommunityIcons name="chart-line" size={21} color="#475569" /><Text style={styles.skeletonHeadingText}>Показатели</Text><InfoIcon title="Показатели" /></View><View style={styles.skeletonCardGrid}>{overview.map(([label, icon], index) => <SkeletonGridCard key={label} width={cardWidth} label={label} icon={icon} index={index} columns={columns} total={overview.length} />)}</View></View>
  </View>;
}

function SkeletonGridCard({ width, label, icon, index, columns, total }: { width: number; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; index: number; columns: number; total: number }) {
  const lastColumn = (index + 1) % columns === 0;
  const lastRow = Math.floor(index / columns) === Math.floor((total - 1) / columns);
  return <View style={[styles.skeletonCard, { width }, !lastColumn && styles.skeletonCardColumnDivider, !lastRow && styles.skeletonCardRowDivider]}><View style={styles.skeletonCardHeader}><View style={styles.skeletonCardIcon}><MaterialCommunityIcons name={icon} size={23} color="#475569" /></View><Text numberOfLines={1} style={styles.skeletonCardLabel}>{label}</Text><InfoIcon title={label} /></View><View style={styles.skeletonValueWide} /></View>;
}

function SkeletonValue({ width = '70%', height = 18 }: { width?: number | `${number}%`; height?: number }) {
  return <View style={[styles.skeletonValue, { width, height }]} />;
}

function SkeletonFinanceLegend({ label, color }: { label: string; color: string }) {
  return <View style={styles.skeletonLegendItem}><View style={[styles.skeletonLegendDot, { backgroundColor: color }]} /><View style={styles.skeletonLegendBody}><Text style={styles.skeletonLegendLabel}>{label}</Text><SkeletonValue width="82%" height={15} /></View></View>;
}

function SkeletonTermFact({ label, icon }: { label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  return <View style={styles.skeletonTermFact}><View style={styles.skeletonTermHeader}><MaterialCommunityIcons name={icon} size={23} color="#2563EB" /><Text style={styles.skeletonTermLabel}>{label}</Text><InfoIcon title={label} /></View><SkeletonValue width="74%" height={22} /><SkeletonValue width="52%" height={12} /></View>;
}

function SkeletonDocumentRow({ first = false }: { first?: boolean }) {
  return <View style={[styles.skeletonDocumentRow, !first && styles.skeletonRowBorder]}><View style={styles.skeletonDocumentIcon} /><View style={styles.skeletonDocumentBody}><SkeletonValue width="48%" height={14} /><SkeletonValue width="78%" height={10} /></View><SkeletonValue width={62} height={15} /></View>;
}

export function CounterpartyFinanceSkeleton({ contentOnly = false }: { contentOnly?: boolean }) {
  const content = <>
    <SectionCard title="Финансовое состояние" icon="chart-donut">
      <View style={styles.skeletonDiagram}><View style={styles.skeletonDonut}><View style={styles.skeletonDonutCenter}><Text style={styles.skeletonDonutLabel}>Общий долг</Text><SkeletonValue width={82} height={17} /></View></View><View style={styles.skeletonLegend}><SkeletonFinanceLegend label="Оплачено" color="#10B981" /><SkeletonFinanceLegend label="Долг" color="#F59E0B" /><SkeletonFinanceLegend label="Просрочено" color="#EF4444" /><SkeletonFinanceLegend label="Аванс" color="#7C3AED" /></View></View>
      <View style={styles.skeletonDateRow}><MaterialCommunityIcons name="calendar-range" size={19} color="#64748B" /><SkeletonValue width={132} height={14} /></View>
    </SectionCard>
    <SectionCard title="Условия оплаты" icon="calendar-check-outline"><View style={styles.skeletonTermsGrid}><SkeletonTermFact label="Ближайший платёж" icon="calendar-arrow-right" /><SkeletonTermFact label="Отсрочка" icon="timer-sand" /></View><View style={styles.skeletonAgreement}><MaterialCommunityIcons name="file-sign" size={20} color="#64748B" /><View style={styles.skeletonAgreementBody}><Text style={styles.skeletonAgreementLabel}>Соглашение</Text><SkeletonValue width="72%" height={15} /></View></View></SectionCard>
    <SectionCard title="Финансовые документы" icon="file-document-multiple-outline">
      <View style={styles.skeletonDocumentSummary}>{['всего', 'к оплате', 'просрочено', 'к отгрузке'].map((label) => <View key={label} style={styles.skeletonDocumentSummaryItem}><SkeletonValue width={28} height={18} /><Text style={styles.skeletonDocumentSummaryLabel}>{label}</Text></View>)}</View>
      <View style={styles.skeletonFilterControl}><Text style={styles.skeletonFilterControlLabel}>Показывать</Text><View style={styles.skeletonFilterTrigger}><MaterialCommunityIcons name="filter-variant" size={18} color="#2563EB" /><Text style={styles.skeletonFilterText}>Все</Text><MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" /></View></View>
      <SkeletonDocumentRow first /><SkeletonDocumentRow /><SkeletonDocumentRow />
    </SectionCard>
  </>;
  return contentOnly ? content : <View style={styles.skeletonWrap}><SkeletonPeriods />{content}</View>;
}

function SkeletonInfoRow({ label }: { label: string }) {
  return <View style={styles.skeletonInfoRow}><Text style={styles.skeletonInfoLabel}>{label}</Text><SkeletonValue width="64%" height={17} /></View>;
}

function CounterpartyProfileSkeleton() {
  return <View style={styles.skeletonWrap}><SectionCard title="Реквизиты" icon="card-account-details-outline">{['Полное наименование', 'ИНН', 'КПП', 'Юридический тип', 'Партнёр', 'Состояние'].map((label) => <SkeletonInfoRow key={label} label={label} />)}</SectionCard><SectionCard title="Ответственные" icon="account-tie-outline">{['Основной менеджер', 'Регион', 'Зона'].map((label) => <SkeletonInfoRow key={label} label={label} />)}</SectionCard><SectionCard title="Коммерческие условия" icon="file-sign">{['Соглашение', 'Договор', 'Вид цены', 'Форма оплаты'].map((label) => <SkeletonInfoRow key={label} label={label} />)}</SectionCard></View>;
}

function CounterpartyActivityPlaceholder() {
  return <View style={styles.skeletonActivity}><View style={styles.skeletonActivityIcon}><MaterialCommunityIcons name="tools" size={48} color="#2563EB" /></View><Text style={styles.skeletonActivityTitle}>В разработке</Text><Text style={styles.skeletonActivityText}>Здесь появится история взаимодействий с контрагентом.</Text></View>;
}

export function CounterpartySkeleton({ tab = 'overview' }: { tab?: CounterpartyCardTab }) {
  if (tab === 'finance') return <CounterpartyFinanceSkeleton />;
  if (tab === 'profile') return <CounterpartyProfileSkeleton />;
  if (tab === 'activity') return <CounterpartyActivityPlaceholder />;
  return <CounterpartyOverviewSkeleton />;
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', minWidth: 130, paddingVertical: 9, paddingRight: 10, gap: 3 },
  metricLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  metricValue: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  metricValueSkeleton: { width: '72%', height: 20, borderRadius: 6, backgroundColor: '#E8EEF6' },
  infoRow: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0', gap: 2 },
  infoLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { color: '#1E293B', fontSize: 14, fontWeight: '700', lineHeight: 19 },
  danger: { color: '#DC2626' },
  success: { color: '#16A34A' },
  unavailable: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 24, backgroundColor: '#FFFFFF' },
  unavailableText: { color: '#64748B', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  retry: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 16 },
  retryText: { color: '#2563EB', fontWeight: '800' },
  skeletonWrap: { flex: 1, backgroundColor: '#FFFFFF', gap: 1 }, skeletonPeriods: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 9, gap: 3 }, skeletonPeriod: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, skeletonPeriodText: { color: '#64748B', fontSize: 11, fontWeight: '700' }, skeletonGridSection: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 11, gap: 8 }, skeletonHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 }, skeletonHeadingText: { color: '#0F172A', fontSize: 15, lineHeight: 22, fontWeight: '900' }, skeletonCardGrid: { flexDirection: 'row', flexWrap: 'wrap' }, skeletonCard: { alignItems: 'flex-start', gap: 5, paddingHorizontal: 10, paddingVertical: 11 }, skeletonCardColumnDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#E2E8F0' }, skeletonCardRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, skeletonCardHeader: { minWidth: 0, minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7 }, skeletonCardIcon: { width: 27, height: 28, alignItems: 'center', justifyContent: 'center' }, skeletonCardLabel: { flex: 1, minWidth: 0, color: '#475569', fontSize: 12.5, lineHeight: 20, fontWeight: '800' }, skeletonValueWide: { width: '75%', height: 22, borderRadius: 6, backgroundColor: '#E8EEF6' },
  skeletonValue: { borderRadius: 5, backgroundColor: '#E8EEF6' }, skeletonDiagram: { minHeight: 206, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }, skeletonDonut: { width: 206, height: 206, borderRadius: 103, borderWidth: 22, borderColor: '#E8EEF6', alignItems: 'center', justifyContent: 'center' }, skeletonDonutCenter: { alignItems: 'center', gap: 7 }, skeletonDonutLabel: { color: '#64748B', fontSize: 10, fontWeight: '700' }, skeletonLegend: { flex: 1, minWidth: 108, gap: 4 }, skeletonLegendItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6, paddingVertical: 4 }, skeletonLegendDot: { width: 9, height: 9, borderRadius: 5 }, skeletonLegendBody: { flex: 1, minWidth: 0, gap: 5 }, skeletonLegendLabel: { color: '#64748B', fontSize: 10, fontWeight: '700' }, skeletonDateRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -7 },
  skeletonTermsGrid: { flexDirection: 'row' }, skeletonTermFact: { width: '50%', minWidth: 0, gap: 5, paddingHorizontal: 8, paddingVertical: 6 }, skeletonTermHeader: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 6 }, skeletonTermLabel: { flex: 1, minWidth: 0, color: '#64748B', fontSize: 10.5, fontWeight: '800' }, skeletonAgreement: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingHorizontal: 8, paddingTop: 10 }, skeletonAgreementBody: { flex: 1, minWidth: 0, gap: 5 }, skeletonAgreementLabel: { color: '#64748B', fontSize: 10, fontWeight: '700' }, skeletonRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, skeletonDocumentSummary: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0', paddingBottom: 9 }, skeletonDocumentSummaryItem: { minWidth: 70, flex: 1, alignItems: 'center', gap: 3 }, skeletonDocumentSummaryLabel: { color: '#64748B', fontSize: 9.5, fontWeight: '700' }, skeletonFilterControl: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 7 }, skeletonFilterControlLabel: { color: '#64748B', fontSize: 11, fontWeight: '800' }, skeletonFilterTrigger: { minWidth: 142, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, borderWidth: 1, borderColor: '#DCE5F1', borderRadius: 9, paddingHorizontal: 10 }, skeletonFilterText: { flex: 1, color: '#1E293B', fontSize: 11.5, fontWeight: '800' }, skeletonDocumentRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, skeletonDocumentIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#E8EEF6' }, skeletonDocumentBody: { flex: 1, minWidth: 0, gap: 6 },
  skeletonInfoRow: { minHeight: 58, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0', gap: 7, paddingVertical: 9 }, skeletonInfoLabel: { color: '#64748B', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }, skeletonActivity: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 32, gap: 10 }, skeletonActivityIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF2FF' }, skeletonActivityTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' }, skeletonActivityText: { maxWidth: 290, color: '#64748B', fontSize: 13, fontWeight: '600', lineHeight: 19, textAlign: 'center' },
});
