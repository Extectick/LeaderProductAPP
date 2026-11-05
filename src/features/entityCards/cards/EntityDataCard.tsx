import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EntityFields, EntityValueText, useEntityColors } from './EntityFields';
import type { EntityCardData, EntityTable, EntityTarget } from '../entityTypes';

export type EntityDataCardProps = { data: EntityCardData; onOpen: (target: EntityTarget, label: string) => void };

function EntityTableRows({ table, onOpen, emphasizeFirstColumn = false }: {
  table: EntityTable; onOpen: EntityDataCardProps['onOpen']; emphasizeFirstColumn?: boolean;
}) {
  const colors = useEntityColors();
  return <View testID={`entity-table-${table.key}`} style={styles.section}>
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{table.label}</Text>
    {!table.rows.length ? <Text style={{ color: colors.secondaryText }}>Нет строк</Text> : table.rows.map((row, index) => <View key={index}
      style={[styles.tableRow, { borderColor: colors.inputBorder, backgroundColor: colors.cardBackground }]}>
      {table.columns.map((column, columnIndex) => <View key={column.key} style={emphasizeFirstColumn && columnIndex === 0 ? styles.firstColumn : styles.cell}>
        {emphasizeFirstColumn && columnIndex === 0 ? null : <Text style={[styles.cellLabel, { color: colors.secondaryText }]}>{column.label}</Text>}
        <View style={styles.cellValue}><EntityValueText value={row[column.key]} onOpen={onOpen} prominent={emphasizeFirstColumn && columnIndex === 0} /></View>
      </View>)}
    </View>)}
    {table.truncated ? <Text testID="entity-table-truncated" style={[styles.notice, { color: colors.secondaryText }]}>Показана часть строк этой таблицы.</Text> : null}
  </View>;
}

/** Renderer shared by ordinary pages, chat links and future registered object types. */
export function EntityDataCard({ data, onOpen, emphasizeFirstColumn = false }: EntityDataCardProps & { emphasizeFirstColumn?: boolean }) {
  const colors = useEntityColors();
  return <View testID={`entity-data-${data.view}`} style={styles.body}>
    <View style={styles.heading}><Text selectable accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{data.title}</Text>
      {data.subtitle ? <Text selectable style={[styles.subtitle, { color: colors.secondaryText }]}>{data.subtitle}</Text> : null}</View>
    <EntityFields fields={data.fields} onOpen={onOpen} />
    {data.tables.map(table => <EntityTableRows key={table.key} table={table} onOpen={onOpen} emphasizeFirstColumn={emphasizeFirstColumn} />)}
    {data.truncated && !data.tables.some(table => table.truncated) ? <Text testID="entity-card-truncated" style={[styles.notice, { color: colors.secondaryText }]}>Показана часть доступных данных.</Text> : null}
  </View>;
}

export function ProductEntityCard(props: EntityDataCardProps) { return <EntityDataCard {...props} emphasizeFirstColumn />; }
export function ClientOrderEntityCard(props: EntityDataCardProps) { return <EntityDataCard {...props} emphasizeFirstColumn />; }
export function GenericEntityCard(props: EntityDataCardProps) { return <EntityDataCard {...props} />; }

const styles = StyleSheet.create({
  body: { gap: 16 }, heading: { gap: 6 }, title: { fontSize: 22, lineHeight: 29, fontWeight: '700' }, subtitle: { fontSize: 14, lineHeight: 21 },
  section: { gap: 10 }, sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' }, tableRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  firstColumn: { paddingBottom: 4 }, cell: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, cellLabel: { flex: 0.85, fontSize: 13, lineHeight: 20 },
  cellValue: { flex: 1.15, minWidth: 0 }, notice: { fontSize: 13, lineHeight: 20 },
});
