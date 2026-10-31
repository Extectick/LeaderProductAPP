import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Checkbox, Divider, IconButton, Text, useTheme } from 'react-native-paper';
import type { KnowledgeAudit, KnowledgeClient, KnowledgeDocument, KnowledgePreview, KnowledgeVersion } from './types';
import { dateLabel, extractionErrors, knowledgeError, sections, statusNames, textBlocks } from './model';

const auditNames: Record<string, string> = { VERSION_DISCOVERED: 'Обнаружена новая версия', VERSION_READY: 'Текст подготовлен', PUBLISHED: 'Документ опубликован', REVOKED: 'Публикация отозвана', RETRY_REQUESTED: 'Запрошена повторная обработка' };
export function DocumentReader({ client, document, preview, loading, error, onVersion, onBack, compact, reviewed, onReviewed, busy }: {
  client: KnowledgeClient; document: KnowledgeDocument; preview: KnowledgePreview | null; loading: boolean; error: string;
  onVersion: (revision: number) => void; onBack: () => void; compact: boolean; reviewed: boolean; onReviewed: (value: boolean) => void; busy: boolean;
}) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'text' | 'versions' | 'history'>('text');
  const [versions, setVersions] = useState<KnowledgeVersion[]>([]), [before, setBefore] = useState<number | null>(null);
  const [audit, setAudit] = useState<KnowledgeAudit[]>([]), [historyLoading, setHistoryLoading] = useState(false), [historyError, setHistoryError] = useState('');
  const [historyAttempt, setHistoryAttempt] = useState(0);
  useEffect(() => { setTab('text'); setVersions([]); setAudit([]); }, [document.id]);
  useEffect(() => {
    if (tab === 'text') return;
    const abort = new AbortController(); setHistoryLoading(true); setHistoryError('');
    (async () => {
      try {
        if (tab === 'versions') { const result = await client.versions(document.id, undefined, abort.signal); if (!abort.signal.aborted) { setVersions(result.versions); setBefore(result.nextBefore); } }
        else { const result = await client.audit(document.id, abort.signal); if (!abort.signal.aborted) setAudit(result); }
      } catch (e) { if (!abort.signal.aborted) setHistoryError(knowledgeError(e)); }
      finally { if (!abort.signal.aborted) setHistoryLoading(false); }
    })();
    return () => abort.abort();
  }, [client, document.id, document.publishedAt, document.currentRevision, tab, historyAttempt]);
  const blocks = useMemo(() => textBlocks(preview?.version.text || ''), [preview?.version.text]);
  const list = React.useRef<FlatList<string>>(null);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [preview?.version.id]);
  const moreAbort = React.useRef<AbortController | null>(null);
  useEffect(() => () => moreAbort.current?.abort(), [document.id, tab]);
  const olderVersions = async () => {
    if (!before || historyLoading) return;
    const abort = new AbortController(); moreAbort.current = abort; setHistoryLoading(true);
    try { const result = await client.versions(document.id, before, abort.signal); if (!abort.signal.aborted) { setVersions(previous => [...previous, ...result.versions]); setBefore(result.nextBefore); } }
    catch (e) { if (!abort.signal.aborted) setHistoryError(knowledgeError(e)); }
    finally { if (!abort.signal.aborted) setHistoryLoading(false); }
  };
  const stale = preview && preview.version.revision !== document.currentRevision;
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={{ padding: 20, paddingBottom: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {compact ? <IconButton icon="arrow-left" accessibilityLabel="Назад к документам" disabled={busy} onPress={onBack} style={{ marginLeft: -12 }} /> : null}
        <Text variant="titleLarge" style={{ flex: 1, fontWeight: '700' }}>{document.title}</Text>
      </View>
      <Text variant="bodySmall" selectable style={{ color: colors.onSurfaceVariant }}>{document.path}</Text>
      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{sections[document.section]} · Версия {preview?.version.revision ?? document.currentRevision} · {Math.max(1, Math.round(document.size / 1024))} КБ</Text>
      {document.deletedAt ? <Text style={{ color: colors.error }}>Файл удалён из хранилища. Публикация недоступна.</Text> : null}
      {stale ? <View style={{ padding: 12, gap: 8, borderRadius: 12, backgroundColor: colors.secondaryContainer }}>
        <Text>Вы просматриваете предыдущую версию. Актуальная — {document.currentRevision}.</Text>
        <Button disabled={busy} mode="outlined" onPress={() => { setTab('text'); onVersion(document.currentRevision); }}>Открыть актуальную версию</Button>
      </View> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {(['text','versions','history'] as const).map(value => <Button key={value} compact mode={tab === value ? 'contained-tonal' : 'text'} disabled={busy} onPress={() => setTab(value)}>{value === 'text' ? 'Текст документа' : value === 'versions' ? 'Версии' : 'История'}</Button>)}
      </View>
    </View>
    <Divider />
    {tab === 'text' ? loading ? <View style={{ padding: 32, gap: 12 }}><ActivityIndicator /><Text style={{ textAlign: 'center' }}>Открываем текст документа</Text></View> : error ? <View style={{ padding: 20, gap: 12 }}><Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text><Button onPress={() => onVersion(document.currentRevision)}>Повторить загрузку</Button></View> : <FlatList
      ref={list} style={{ flex: 1 }} data={blocks} keyExtractor={(_, index) => String(index)} initialNumToRender={5} windowSize={5} contentContainerStyle={{ padding: 20, gap: 0, flexGrow: 1 }}
      renderItem={({ item }) => <Text selectable style={{ fontSize: 15, lineHeight: 25, color: colors.onSurface }}>{item}</Text>}
      ListHeaderComponent={<View style={{ gap: 10, marginBottom: 16 }}>
        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>ИЗВЛЕЧЁННЫЙ ТЕКСТ · {dateLabel(preview?.version.extractedAt)}</Text>
        {preview?.version.errorCode ? <Text style={{ color: preview.version.status === 'ERROR' ? colors.error : colors.onSurfaceVariant }}>{extractionErrors[preview.version.errorCode] || 'Не удалось подготовить текст. Обновите данные или повторите обработку.'}</Text> : null}
        {document.section === 'AI_WORKSPACE' ? <Text>Черновик ИИ. После проверки перенесите файл в «Материалы компании» через Nextcloud — затем его можно будет опубликовать.</Text> : null}
      </View>}
      ListEmptyComponent={<View style={{ gap: 12 }}><Text style={{ color: colors.onSurfaceVariant }}>{preview && ['QUEUED','PROCESSING'].includes(preview.version.status) ? 'Текст ещё обрабатывается. Обновите документ через несколько секунд.' : 'Текст для просмотра пока недоступен.'}</Text><Button disabled={busy} onPress={() => onVersion(document.currentRevision)}>Обновить текст</Button></View>}
    /> : <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      {historyError ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: colors.error }}>{historyError}</Text><Button onPress={() => setHistoryAttempt(value => value + 1)}>Повторить</Button></View> : null}
      {tab === 'versions' ? versions.map(version => <View key={version.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.outlineVariant, paddingBottom: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, fontWeight: '700' }}>Версия {version.revision}{version.revision === document.currentRevision ? ' · актуальная' : ''}</Text><Button compact onPress={() => { setTab('text'); onVersion(version.revision); }}>Открыть</Button></View>
        <Text variant="bodySmall">{statusNames[version.status]} · {dateLabel(version.createdAt)}</Text>
      </View>) : audit.map(item => <View key={item.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.outlineVariant, paddingBottom: 12, gap: 4 }}>
        <Text style={{ fontWeight: '600' }}>{auditNames[item.action] || 'Изменение документа'}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{dateLabel(item.createdAt)}{item.actorId ? ` · сотрудник №${item.actorId}` : ' · обработчик документов'}</Text>
        {typeof item.detail.revision === 'number' ? <Text variant="bodySmall">Версия {item.detail.revision}</Text> : null}
      </View>)}
      {historyLoading ? <ActivityIndicator /> : !historyError && (tab === 'versions' ? !versions.length : !audit.length) ? <Text>Записей пока нет</Text> : null}
      {tab === 'versions' && before ? <Button disabled={historyLoading} onPress={() => void olderVersions()}>Предыдущие версии</Button> : null}
    </ScrollView>}
    {preview?.version.status === 'READY' && !stale && document.section === 'COMPANY' && !document.deletedAt ? <View style={{ borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
      <Checkbox.Item position="leading" label="Я проверил текст этой версии" status={reviewed ? 'checked' : 'unchecked'} onPress={() => onReviewed(!reviewed)} disabled={busy || loading} labelStyle={{ textAlign: 'left', fontSize: 14 }} />
    </View> : null}
  </View>;
}
