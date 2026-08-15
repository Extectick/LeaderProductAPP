import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const InfoContext = React.createContext<{ show: (title: string, description: string) => void }>({ show: () => undefined });
const INFO: Record<string, string> = {
  'Показатели': 'Основные показатели продаж за выбранный период.',
  'Обзор продаж': 'Основные показатели продаж за выбранный период.',
  'Финансовое состояние': 'Соотношение оплаченной суммы, текущего долга и просроченной части долга.',
  'Сводка': 'Краткая финансовая сводка по выбранной организации и соглашению.',
  'Финансовые документы': 'Документы к оплате, просроченные обязательства и документы, ожидающие отгрузки.',
  'Оплачено': 'Сумма погашенных документов за указанный период.',
  'Срок не наступил': 'Часть задолженности, срок оплаты которой ещё не наступил.',
  'Отсрочка по соглашению': 'Срок оплаты, установленный выбранным соглашением с клиентом.',
  'Документы': 'Количество финансовых документов по текущим состояниям.',
  'Изменение': 'Разница рентабельности в процентных пунктах между текущим и предыдущим периодами.',
  'Продажи': 'Сумма фактических продаж за выбранный период.', 'Динамика': 'Изменение относительно предыдущего периода такой же длительности. Если в предыдущем периоде продаж не было, процент не рассчитывается.', 'Прибыль': 'Продажи за вычетом фактической себестоимости.', 'Рентабельность': 'Доля прибыли в продажах.', 'Средний чек': 'Средняя сумма одного документа продажи.', 'Заказов': 'Количество проведённых заказов.', 'Последний заказ': 'Последний проведённый заказ клиента.', 'Сумма последнего': 'Сумма последнего проведённого заказа клиента.', 'Частота заказов': 'Средний интервал между проведёнными заказами.', 'Быстрые факты': 'Краткие показатели активности клиента за выбранный период.', 'Динамика продаж': 'Сравнение фактических продаж текущего и предыдущего сопоставимого периода.', 'Общий долг': 'Текущая задолженность перед выбранной организацией.', 'Просрочено': 'Задолженность с истёкшим сроком оплаты.', 'Просрочка': 'Сумма и максимальная длительность просроченной задолженности.', 'Не наступил срок': 'Задолженность, срок оплаты которой ещё не наступил.', 'Аванс': 'Средства, ещё не закрытые продажами.', 'Ближайший платёж': 'Ближайший ожидаемый срок оплаты и сумма обязательств на эту дату.', 'Ближайшие оплаты': 'Текущие непогашенные обязательства по документам, отсортированные по сроку оплаты.', 'Платёжная дисциплина': 'Доля документов, погашенных без просрочки, и средняя длительность задержки за последние 6 месяцев.', 'Отсрочка': 'Отсрочка оплаты по условиям договора.', 'История оплат': 'Последние 20 проведённых поступлений от клиента независимо от выбранного периода продаж.',
};

export function MetricInfoProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = React.useState<{ title: string; description: string } | null>(null);
  const context = React.useMemo(() => ({ show: (title: string, description: string) => setInfo({ title, description }) }), []);
  return <InfoContext.Provider value={context}>{children}<Modal visible={Boolean(info)} transparent animationType="fade" onRequestClose={() => setInfo(null)}><Pressable style={styles.backdrop} onPress={() => setInfo(null)}><Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}><View style={styles.titleRow}><MaterialCommunityIcons name="information-outline" size={20} color="#2563EB" /><Text style={styles.title}>{info?.title}</Text></View><Text style={styles.description}>{info?.description}</Text><Pressable onPress={() => setInfo(null)} style={styles.close}><Text style={styles.closeText}>Понятно</Text></Pressable></Pressable></Pressable></Modal></InfoContext.Provider>;
}

export function InfoIcon({ title, description }: { title: string; description?: string }) {
  const context = React.useContext(InfoContext);
  return <Pressable hitSlop={8} onPress={() => context.show(title, description || INFO[title] || 'Показатель рассчитан по данным 1С.')}><MaterialCommunityIcons name="information-outline" size={14} color="#94A3B8" /></Pressable>;
}

const styles = StyleSheet.create({ backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.3)', padding: 20 }, dialog: { width: '100%', maxWidth: 380, borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16, gap: 12 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, title: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '900' }, description: { color: '#475569', fontSize: 14, fontWeight: '600', lineHeight: 20 }, close: { alignSelf: 'flex-end', minHeight: 38, justifyContent: 'center', paddingHorizontal: 12 }, closeText: { color: '#2563EB', fontWeight: '900' } });
