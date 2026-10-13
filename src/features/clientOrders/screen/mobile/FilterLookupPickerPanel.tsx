import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button as PaperButton, Searchbar, Surface, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getPickerItemMeta } from '../../lib/clientOrdersUi';

export function FilterLookupPickerPanel<T extends { guid: string; name: string }>({
  styles = lookupPickerStyles,
  topInset,
  bottomInset,
  title,
  icon,
  selectedGuid,
  selectedGuids,
  localItems,
  renderSearch,
  status,
  placeholder,
  search,
  onSelect,
  onApply,
  onReset,
  onClose,
}: {
  styles?: any;
  topInset: number;
  bottomInset: number;
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  selectedGuid?: string | null;
  selectedGuids?: string[];
  localItems?: T[];
  renderSearch?: (props: any) => React.ReactNode;
  status?: React.ReactNode;
  placeholder: string;
  search?: (args: { search: string; limit: number; offset: number }) => Promise<{ items: T[] }>;
  onSelect: (item: T) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    const requestId = ++requestRef.current;
    if (localItems) { setItems(localItems.filter(item => item.name.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")))); setLoading(false); return; }
    if (!search) return;
    const loadingTimer = setTimeout(() => {
      if (requestRef.current === requestId) setLoading(true);
    }, query.trim() ? 260 : 0);
    const requestTimer = setTimeout(() => {
      void search({ search: query.trim(), limit: 40, offset: 0 })
        .then((result) => {
          if (requestRef.current !== requestId) return;
          setItems(Array.isArray(result.items) ? result.items : []);
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setItems([]);
        })
        .finally(() => {
          if (requestRef.current === requestId) setLoading(false);
        });
    }, query.trim() ? 520 : 0);
    return () => {
      requestRef.current++;
      clearTimeout(loadingTimer);
      clearTimeout(requestTimer);
    };
  }, [query, search, localItems]);

  return (
    <View style={styles.filtersLookupOverlay}>
      <Surface mode="flat" style={[styles.filtersFullscreenHeader, { paddingTop: Math.max(topInset, 10) + 8 }]}>
        <View style={styles.filtersFullscreenHeaderRow}>
          <View style={styles.filtersLookupTitleRow}>
            <MaterialCommunityIcons name={icon} size={20} color="#2563EB" />
            <Text style={styles.filtersFullscreenTitle}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть подбор" onPress={onClose} style={({ pressed }) => [styles.filtersCloseButton, pressed && styles.flatPressed]}>
            <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
          </Pressable>
        </View>
      </Surface>
      <View style={styles.filtersLookupSearchArea}>
        {(renderSearch ?? (props => <Searchbar {...props} elevation={0} />))({
          style: styles.filtersLookupSearch,
          inputStyle: styles.ordersSearchbarInput,
          value: query,
          onChangeText: setQuery,
          placeholder,
        })}
      </View>
      {status}
      <ScrollView
        style={styles.filtersLookupList}
        contentContainerStyle={[styles.filtersLookupListContent, { paddingBottom: Math.max(bottomInset, 10) + 86 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {loading ? (
          <View style={styles.filtersLookupStateRow}>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : null}
        {!loading && !status && !items.length ? (
          <Text style={styles.filtersLookupEmpty}>Ничего не найдено.</Text>
        ) : null}
        {items.map((item) => {
          const selected = selectedGuids ? (item.guid === '' ? !selectedGuids.length : selectedGuids.includes(item.guid)) : item.guid === selectedGuid;
          return (
            <Pressable
              key={item.guid}
              accessibilityRole={selectedGuids ? "checkbox" : "button"}
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={item.name}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.filtersLookupRow, selected && styles.filtersLookupRowSelected, pressed && styles.flatPressed]}
            >
              <View style={styles.filtersLookupRowText}>
                <Text style={styles.filtersLookupRowTitle} numberOfLines={2}>{item.name}</Text>
                {getPickerItemMeta(title === 'Контрагент' ? 'filterCounterparty' : 'organization', item) ? (
                  <Text style={styles.filtersLookupRowMeta} numberOfLines={1}>{getPickerItemMeta(title === 'Контрагент' ? 'filterCounterparty' : 'organization', item)}</Text>
                ) : null}
              </View>
              {selected ? (
                <MaterialCommunityIcons name="check-circle" size={21} color="#16A34A" />
              ) : (
                <MaterialCommunityIcons name="chevron-right" size={22} color="#94A3B8" />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Surface mode="flat" style={[styles.filtersFullscreenFooter, { paddingBottom: Math.max(bottomInset, 10) + 8 }]}>
        <PaperButton mode="outlined" onPress={onReset} disabled={selectedGuids ? !selectedGuids.length : !selectedGuid} style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
          Сбросить
        </PaperButton>
        <PaperButton mode="contained" onPress={onApply} buttonColor="#2563EB" textColor="#FFFFFF" style={styles.filtersFullscreenFooterButton} labelStyle={styles.filtersFullscreenFooterLabel} contentStyle={styles.filtersFullscreenFooterContent}>
          Готово
        </PaperButton>
      </Surface>
    </View>
  );
}


export const lookupPickerStyles = StyleSheet.create({
  flatPressed: { opacity: 0.78 },
  filtersFullscreenHeader: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingBottom: 10 },
  filtersFullscreenHeaderRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  filtersFullscreenTitle: { flex: 1, color: '#0F172A', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  filtersCloseButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  filtersFullscreenFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  filtersFullscreenFooterButton: { flex: 1, borderRadius: 12, borderColor: '#CBD5E1' },
  filtersFullscreenFooterContent: { minHeight: 44 },
  filtersFullscreenFooterLabel: { fontSize: 13, fontWeight: '900', marginVertical: 0 },
  filtersLookupOverlay: { ...StyleSheet.absoluteFill, zIndex: 380, elevation: 380, backgroundColor: '#F8FAFC' },
  filtersLookupTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersLookupSearchArea: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, backgroundColor: '#F8FAFC' },
  filtersLookupSearch: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', elevation: 0 },
  filtersLookupList: { flex: 1 },
  filtersLookupListContent: { paddingHorizontal: 14, gap: 6 },
  filtersLookupStateRow: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  filtersLookupEmpty: { paddingVertical: 22, color: '#64748B', fontSize: 13, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  filtersLookupRow: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  filtersLookupRowSelected: { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' },
  filtersLookupRowText: { flex: 1, minWidth: 0, gap: 2 },
  filtersLookupRowTitle: { color: '#0F172A', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  filtersLookupRowMeta: { color: '#64748B', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  ordersSearchbarInput: { height: 42, minHeight: 0, maxHeight: 42, paddingVertical: 0, marginVertical: 0, fontSize: 14, lineHeight: 18, color: '#0F172A', fontWeight: '800', includeFontPadding: false, textAlignVertical: 'center' },
});
