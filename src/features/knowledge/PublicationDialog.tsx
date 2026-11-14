import React, { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Button, Dialog, Divider, Portal, RadioButton, Text, useTheme } from 'react-native-paper';
import type { KnowledgeAudience, KnowledgeClient, KnowledgePreview } from './types';
import { AudiencePicker } from './AudiencePicker';

export function PublicationDialog({ client, preview, busy, error, valid, onClose, onPublish }: {
  client: KnowledgeClient; preview: KnowledgePreview; busy: boolean; error: string; valid: boolean; onClose: () => void; onPublish: (audience: KnowledgeAudience) => void;
}) {
  const { colors } = useTheme(); const { height } = useWindowDimensions();
  const doc = preview.document;
  const [mode, setMode] = useState(doc.allEmployees ? 'everyone' : doc.allowedUserIds.length || doc.allowedDepartmentIds.length ? 'selected' : 'reviewers');
  const [userIds, setUserIds] = useState(doc.allowedUserIds), [departmentIds, setDepartmentIds] = useState(doc.allowedDepartmentIds);
  const [picker, setPicker] = useState<'user' | 'department'>('department');
  const allowed = mode !== 'selected' || userIds.length + departmentIds.length > 0;
  const audience = { allEmployees: mode === 'everyone', userIds: mode === 'selected' ? userIds : [], departmentIds: mode === 'selected' ? departmentIds : [] };
  return <Portal><Dialog visible dismissable={!busy} onDismiss={onClose} style={{ width: '94%', maxWidth: 620, alignSelf: 'center', maxHeight: height - 48, marginHorizontal: 0, borderRadius: 20 }}>
    <Dialog.Title>{doc.publishedRevision !== null ? 'Изменить доступ' : 'Опубликовать документ'}</Dialog.Title>
    <Dialog.ScrollArea style={{ flexShrink: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
      <Text variant="titleMedium">{doc.title}</Text><Text style={{ color: colors.onSurfaceVariant }}>Проверенная версия {preview.version.revision}. Выберите, кому будет доступен материал в поиске базы знаний.</Text>
      <RadioButton.Group value={mode} onValueChange={setMode}>
        <RadioButton.Item value="reviewers" label="Только проверяющим" disabled={busy} position="leading" labelStyle={{ textAlign: 'left', fontSize: 15 }} />
        <RadioButton.Item value="selected" label="Выбранным сотрудникам и отделам" disabled={busy} position="leading" labelStyle={{ textAlign: 'left', fontSize: 15 }} />
        <RadioButton.Item value="everyone" label="Всем сотрудникам" disabled={busy} position="leading" labelStyle={{ textAlign: 'left', fontSize: 15 }} />
      </RadioButton.Group>
      {mode === 'everyone' ? <Text style={{ padding: 12, borderRadius: 12, backgroundColor: colors.secondaryContainer }}>Материал увидят все сотрудники, которым доступен сервис «ИИ ассистент».</Text> : null}
      {mode === 'selected' ? <><Divider /><View style={{ flexDirection: 'row', gap: 8 }}>{(['department','user'] as const).map(kind => <Button key={kind} disabled={busy} mode={picker === kind ? 'contained-tonal' : 'text'} onPress={() => setPicker(kind)}>{kind === 'department' ? `Отделы (${departmentIds.length})` : `Сотрудники (${userIds.length})`}</Button>)}</View>
        <AudiencePicker key={picker} client={client} kind={picker} ids={picker === 'user' ? userIds : departmentIds} onChange={picker === 'user' ? setUserIds : setDepartmentIds} disabled={busy} />
        {!allowed ? <Text style={{ color: colors.onSurfaceVariant }}>Выберите хотя бы один отдел или сотрудника.</Text> : null}
      </> : null}
      {!valid ? <Text accessibilityRole="alert" style={{ color: colors.error }}>Документ или состояние источника изменились. Закройте окно и обновите документ перед публикацией.</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text> : null}
    </ScrollView></Dialog.ScrollArea>
    <Dialog.Actions><Button disabled={busy} onPress={onClose}>Отмена</Button><Button mode="contained" loading={busy} disabled={busy || !valid || !allowed} onPress={() => onPublish(audience)}>{doc.publishedRevision !== null ? 'Сохранить доступ' : 'Опубликовать'}</Button></Dialog.Actions>
  </Dialog></Portal>;
}
