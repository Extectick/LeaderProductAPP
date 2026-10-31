import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, FlatList, Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, Divider, Icon, IconButton, Menu, Portal, Snackbar, Text, TextInput, TouchableRipple, useTheme } from 'react-native-paper';
import type { KnowledgeAudience, KnowledgeClient, KnowledgeDocument, KnowledgeSection } from './types';
import { canPublish, dateLabel, documentStatus, knowledgeError, sections, sourceReady, views } from './model';
import { useKnowledgeReview } from './useKnowledgeReview';
import { DocumentReader } from './DocumentReader';
import { PublicationDialog } from './PublicationDialog';

export function KnowledgeReviewPanel({ client }: { client: KnowledgeClient }) {
  const c = useKnowledgeReview(client); const { colors } = useTheme(); const { width } = useWindowDimensions(); const wide = width >= 1080;
  const [reviewed, setReviewed] = useState(false), [dialog, setDialog] = useState<'publish' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const [sectionMenu, setSectionMenu] = useState(false); const mutation = useRef(false), mounted = useRef(true);
  const source = c.sources.find(item => item.id === c.selected?.sourceId) || c.sources[0];
  const ready = sourceReady(source); const publishable = canPublish(c.preview, source);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setReviewed(false); setDialog(null); setActionError(''); }, [c.selected?.id, c.preview?.version.id]);
  useEffect(() => {
    if (!c.selected || wide) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { if (busy) return true; c.close(); return true; });
    return () => handler.remove();
  }, [c.selected?.id, wide, busy]);
  const open = (document: KnowledgeDocument) => { if (!mutation.current) void c.open(document); };
  const act = async (work: () => Promise<unknown>, success: string, documentId?: string, reloadText = false) => {
    if (mutation.current) return; mutation.current = true; setBusy(true); setActionError('');
    let completed = false;
    try {
      await work(); completed = true; if (!mounted.current) return;
      setDialog(null); setNotice(success); setReviewed(false);
      if (documentId) await c.afterMutation(documentId, reloadText); else await c.refresh(true);
    } catch (error) {
      if (mounted.current) setActionError(completed ? `${success}. Не удалось обновить отображение — нажмите «Обновить».` : knowledgeError(error));
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  };
  const publish = (audience: KnowledgeAudience) => {
    if (!c.preview || !reviewed || !publishable) return;
    const { document, version } = c.preview;
    void act(() => client.publish(document.id, version.id, audience), document.publishedRevision === null ? 'Документ опубликован' : 'Доступ обновлён', document.id);
  };
  const openCloud = () => { void Linking.openURL('https://cloud.leader-product.ru').catch(() => setNotice('Не удалось открыть Nextcloud')); };
  if (c.access === 'loading') return <View style={styles.center}><ActivityIndicator /><Text>Проверяем доступ к базе знаний</Text></View>;
  if (c.access !== 'allowed') return <View style={styles.center}><Icon source="book-lock-outline" size={40} color={colors.onSurfaceVariant} /><Text variant="titleLarge">База знаний недоступна</Text><Text style={styles.centerText}>{c.access === 'denied' ? 'Для проверки документов требуется право управления базой знаний. Обратитесь к администратору.' : c.accessError}</Text><Button mode="outlined" onPress={c.retryAccess}>Проверить снова</Button></View>;
  const statusColor = (tone: string) => tone === 'error' ? colors.error : tone === 'success' ? '#168251' : tone === 'ready' ? colors.primary : colors.onSurfaceVariant;
  const list = <View style={[styles.listPane, wide ? { width: '35%', maxWidth: 420, borderRightWidth: 1, borderRightColor: colors.outlineVariant } : { flex: 1 }]}>
    <TextInput mode="outlined" dense maxLength={100} label="Найти документ" value={c.search} onChangeText={c.setSearch} disabled={busy} style={styles.search} left={<TextInput.Icon icon="magnify" />} right={c.search ? <TextInput.Icon icon="close" accessibilityLabel="Очистить поиск документов" onPress={() => c.setSearch('')} /> : undefined} />
    {c.view === 'all' ? <View style={{ paddingHorizontal: 16, paddingBottom: 10, alignItems: 'flex-start' }}><Menu visible={sectionMenu} onDismiss={() => setSectionMenu(false)} anchor={<Button compact mode="outlined" icon="folder-outline" disabled={busy} onPress={() => setSectionMenu(true)}>{c.section ? sections[c.section] : 'Все папки'}</Button>}>
      <Menu.Item title="Все папки" onPress={() => { c.setSection(undefined); setSectionMenu(false); }} />
      {(Object.keys(sections) as KnowledgeSection[]).map(key => <Menu.Item key={key} title={sections[key]} onPress={() => { c.setSection(key); setSectionMenu(false); }} />)}
    </Menu></View> : null}
    {c.loading && !c.documents.length ? <View style={styles.center}><ActivityIndicator /><Text>Загружаем документы</Text></View> : <FlatList
      style={{ flex: 1 }} data={c.documents} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 8, paddingTop: 0, gap: 4 }}
      renderItem={({ item }) => { const status = documentStatus(item); return <TouchableRipple accessibilityRole="button" accessibilityLabel={`Открыть документ ${item.title}`} accessibilityState={{ selected: item.id === c.selected?.id, disabled: busy }} disabled={busy} onPress={() => open(item)} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: item.id === c.selected?.id && wide ? colors.primaryContainer : colors.surface }}>
        <View style={{ padding: 14, flexDirection: 'row', gap: 12 }}><View style={{ paddingTop: 2 }}><Icon source="file-document-outline" size={24} color={item.id === c.selected?.id ? colors.primary : colors.onSurfaceVariant} /></View><View style={{ flex: 1, gap: 5 }}>
          <Text numberOfLines={2} variant="titleSmall" style={{ fontWeight: '700' }}>{item.title}</Text>
          <Text numberOfLines={1} variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{item.path.split('/').slice(1, -1).join(' / ') || sections[item.section]}</Text>
          <Text variant="labelMedium" style={{ color: statusColor(status.tone) }}>{status.label}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Версия {item.currentRevision} · {dateLabel(item.versions?.[0]?.createdAt)}</Text>
        </View><Icon source="chevron-right" size={18} color={colors.onSurfaceVariant} /></View>
      </TouchableRipple>; }}
      ListEmptyComponent={<View style={styles.center}><Icon source={c.search ? 'file-search-outline' : 'book-check-outline'} size={40} color={colors.onSurfaceVariant} /><Text variant="titleMedium" style={styles.centerText}>{c.listError ? 'Не удалось загрузить список' : c.search ? 'Документы не найдены' : c.view === 'pending' ? 'Нет документов на проверке' : 'В этом списке пока пусто'}</Text><Text style={[styles.centerText, { color: colors.onSurfaceVariant }]}>{c.search ? 'Попробуйте другое название или папку.' : 'Добавьте TXT, MD, DOCX или PDF в «Материалы компании» через Nextcloud. После обработки файл появится здесь.'}</Text>{!c.search ? <Button onPress={openCloud} icon="open-in-new">Открыть Nextcloud</Button> : null}</View>}
      ListFooterComponent={c.nextCursor ? <Button loading={c.loadingMore} disabled={c.loadingMore || c.loading || busy} onPress={() => void c.loadMore()}>Показать ещё документы</Button> : null}
    />}
  </View>;
  const detail = c.selected ? <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
    <DocumentReader client={client} document={c.selected} preview={c.preview} loading={c.previewLoading} error={c.previewError} compact={!wide} onBack={c.close}
      onVersion={revision => { if (!busy && c.selected) void c.open(c.selected, revision); }} reviewed={reviewed} onReviewed={setReviewed} busy={busy} />
    <View style={[styles.footer, { borderTopColor: colors.outlineVariant, backgroundColor: colors.surface }]}>
      {c.selected.publishedRevision !== null ? <Text variant="bodySmall" style={{ color: '#168251' }}>Опубликовано {dateLabel(c.selected.publishedAt)} · {c.selected.allEmployees ? 'всем сотрудникам' : c.selected.allowedUserIds.length || c.selected.allowedDepartmentIds.length ? `отделов: ${c.selected.allowedDepartmentIds.length}, сотрудников: ${c.selected.allowedUserIds.length}` : 'только проверяющим'}</Text> : <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{!ready ? 'Публикация доступна после успешной синхронизации источника.' : c.preview?.version.revision !== c.selected.currentRevision ? 'Предыдущие версии нельзя публиковать.' : 'Проверьте текст и выберите, кому будет доступен документ.'}</Text>}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {c.selected.publishedRevision !== null ? <Button disabled={busy} textColor={colors.error} onPress={() => { setActionError(''); setDialog('revoke'); }}>Отозвать публикацию</Button> : null}
        {c.preview?.version.status === 'ERROR' && c.preview.version.revision === c.selected.currentRevision && !c.selected.deletedAt ? <Button icon="reload" disabled={busy} loading={busy} onPress={() => { const id = c.selected!.id; void act(() => client.retry(id), 'Повторная обработка запрошена', id, true); }}>Повторить обработку</Button> : null}
        <Button mode="contained" icon="check" disabled={!publishable || !reviewed || busy} onPress={() => { setActionError(''); setDialog('publish'); }}>{c.selected.publishedRevision !== null ? 'Изменить доступ' : 'Выбрать доступ и опубликовать'}</Button>
      </View>
    </View>
  </View> : <View style={styles.center}><Icon source="text-box-check-outline" size={52} color={colors.primary} /><Text variant="titleLarge">Выберите документ для проверки</Text><Text style={[styles.centerText, { color: colors.onSurfaceVariant }]}>Прочитайте извлечённый текст, проверьте версию и задайте доступ. До публикации материал не попадёт в поиск.</Text></View>;
  return <View style={styles.root}>
    {(wide || !c.selected) ? <>
      <View style={styles.heading}><View style={{ flex: 1, minWidth: 180, gap: 5 }}><Text variant="headlineSmall" style={{ fontWeight: '700' }}>База знаний</Text><Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Проверяйте материалы перед публикацией</Text></View><Button icon="open-in-new" onPress={openCloud} compact>Nextcloud</Button><IconButton icon="refresh" accessibilityLabel="Обновить документы" disabled={busy || c.loading} onPress={() => void c.refresh()} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>{views.map(item => <Chip key={item.key} selected={c.view === item.key} style={{ backgroundColor: c.view === item.key ? colors.primaryContainer : colors.surface }} showSelectedCheck disabled={busy} onPress={() => { c.setView(item.key); c.setSection(undefined); }}>{item.label}</Chip>)}</ScrollView>
    </> : null}
    <View style={[styles.source, { backgroundColor: ready ? colors.surfaceVariant : colors.errorContainer }]}>
      <Icon source={ready ? 'cloud-check-outline' : 'cloud-alert-outline'} size={18} color={ready ? colors.onSurfaceVariant : colors.error} />
      <Text variant="bodySmall" style={{ flex: 1, color: ready ? colors.onSurfaceVariant : colors.onErrorContainer }}>{!source ? 'Ожидаем сведения об источнике' : !source.enabled ? 'Источник отключён. Поиск и публикация приостановлены.' : source.lastErrorCode ? 'Не удалось синхронизировать Nextcloud. Поиск и публикация приостановлены.' : !ready ? 'Ожидаем актуальную синхронизацию Nextcloud.' : `Nextcloud · синхронизация ${dateLabel(source.lastSuccessAt)}`}</Text>
      {source?.enabled ? <Button compact disabled={busy} onPress={() => void act(() => client.sync(source.id), 'Синхронизация запрошена. Список обновится автоматически.')}>Синхронизировать</Button> : null}
    </View>
    {c.listError || actionError && !dialog ? <View style={[styles.error, { backgroundColor: colors.errorContainer }]}><Text accessibilityRole="alert" style={{ flex: 1, color: colors.onErrorContainer }}>{actionError || c.listError}</Text><Button compact disabled={busy} onPress={() => { setActionError(''); void c.refresh(); if (c.selected) void c.open(c.selected); }}>Обновить</Button></View> : null}
    <View style={[styles.content, { flexDirection: wide ? 'row' : 'column', backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
      {wide || !c.selected ? list : null}{wide || c.selected ? detail : null}
    </View>
    {dialog === 'publish' && c.preview ? <PublicationDialog key={c.preview.version.id} client={client} preview={c.preview} busy={busy} valid={publishable && reviewed} error={actionError} onClose={() => { if (!busy) setDialog(null); }} onPublish={publish} /> : null}
    <Portal><Dialog visible={dialog === 'revoke'} dismissable={!busy} onDismiss={() => setDialog(null)} style={{ maxWidth: 560, width: '94%', alignSelf: 'center', marginHorizontal: 0 }}><Dialog.Title>Отозвать публикацию?</Dialog.Title><Dialog.Content><Text>«{c.selected?.title}» исчезнет из поиска базы знаний. Файл останется в Nextcloud; его можно будет проверить и опубликовать снова.</Text>{actionError ? <Text accessibilityRole="alert" style={{ color: colors.error, marginTop: 12 }}>{actionError}</Text> : null}</Dialog.Content><Dialog.Actions><Button disabled={busy} onPress={() => setDialog(null)}>Отмена</Button><Button mode="contained" loading={busy} disabled={busy} buttonColor={colors.error} onPress={() => { if (c.selected) { const id = c.selected.id; void act(() => client.revoke(id), 'Публикация отозвана', id); } }}>Отозвать</Button></Dialog.Actions></Dialog></Portal>
    <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4500} action={{ label: 'Закрыть', onPress: () => setNotice('') }}>{notice}</Snackbar>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, gap: 12 }, heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingBottom: 2 }, source: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderRadius: 12 },
  error: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, gap: 8 },
  content: { flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', borderWidth: 1 }, listPane: { minHeight: 0 }, search: { margin: 16, marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }, centerText: { textAlign: 'center', maxWidth: 440, lineHeight: 23 },
  footer: { borderTopWidth: 1, padding: 14, gap: 10 },
});
