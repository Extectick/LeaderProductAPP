import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Checkbox, Chip, Text, TextInput, useTheme } from 'react-native-paper';
import type { AudienceItem, KnowledgeClient } from './types';
import { knowledgeError } from './model';

export function AudiencePicker({ client, kind, ids, onChange, disabled }: {
  client: KnowledgeClient; kind: 'user' | 'department'; ids: number[]; onChange: (ids: number[]) => void; disabled: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState(''), [items, setItems] = useState<AudienceItem[]>([]), [names, setNames] = useState<Record<number, string>>({});
  const [cursor, setCursor] = useState<number | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const generation = useRef(0); const more = useRef(false);
  useEffect(() => {
    if (!ids.length) return;
    const controller = new AbortController();
    client.audience(kind, { ids }, controller.signal).then(result => {
      if (!controller.signal.aborted) setNames(previous => ({ ...previous, ...Object.fromEntries(result.items.map(item => [item.id, item.name])) }));
    }).catch(() => {});
    return () => controller.abort();
  }, [client, kind, ids.join(',')]);
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController(); setLoading(true); setError(''); setItems([]); setCursor(null); more.current = false;
    const timer = setTimeout(() => {
      client.audience(kind, { q: query.trim() }, controller.signal).then(result => {
        if (controller.signal.aborted || current !== generation.current) return;
        setItems(result.items); setCursor(result.nextCursor); setNames(previous => ({ ...previous, ...Object.fromEntries(result.items.map(item => [item.id, item.name])) }));
      }).catch(e => { if (!controller.signal.aborted) setError(knowledgeError(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); generation.current++; };
  }, [client, kind, query]);
  const loadMore = async () => {
    if (!cursor || more.current) return; more.current = true; setLoading(true); const current = generation.current;
    try {
      const result = await client.audience(kind, { q: query.trim(), cursor });
      if (current !== generation.current) return;
      setItems(previous => [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))]); setCursor(result.nextCursor);
      setNames(previous => ({ ...previous, ...Object.fromEntries(result.items.map(item => [item.id, item.name])) }));
    } catch (e) { if (current === generation.current) setError(knowledgeError(e)); }
    finally { if (current === generation.current) { setLoading(false); more.current = false; } }
  };
  return <View style={{ gap: 8 }}>
    <Text variant="titleSmall">{kind === 'user' ? 'Сотрудники' : 'Отделы'} · выбрано {ids.length}</Text>
    {ids.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{ids.map(id => <Chip key={id} compact disabled={disabled} onClose={() => onChange(ids.filter(value => value !== id))} closeIconAccessibilityLabel={`Убрать ${names[id] || id}`}>{names[id] || `№${id}`}</Chip>)}</View> : null}
    <TextInput maxLength={100} mode="outlined" dense label={kind === 'user' ? 'Найти сотрудника' : 'Найти отдел'} value={query} onChangeText={setQuery} disabled={disabled} right={query ? <TextInput.Icon icon="close" onPress={() => setQuery('')} /> : undefined} />
    {error ? <Text style={{ color: colors.error }} accessibilityRole="alert">{error}</Text> : null}
    {items.map(item => <View key={item.id}>
      <Checkbox.Item label={item.name} labelStyle={{ fontSize: 14, textAlign: 'left' }} labelMaxFontSizeMultiplier={1.5} position="leading"
        status={ids.includes(item.id) ? 'checked' : 'unchecked'} disabled={disabled || !ids.includes(item.id) && ids.length >= 200}
        onPress={() => onChange(ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])} />
      {item.description ? <Text variant="bodySmall" style={{ paddingLeft: 52, marginTop: -6, color: colors.onSurfaceVariant }}>{item.description}</Text> : null}
    </View>)}
    {loading ? <ActivityIndicator size="small" /> : !items.length && !error ? <Text style={{ color: colors.onSurfaceVariant }}>Ничего не найдено</Text> : null}
    {cursor ? <Button disabled={loading || disabled} onPress={() => void loadMore()}>Показать ещё</Button> : null}
  </View>;
}
