// app/(main)/services/appeals/new.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createAppeal } from '@/utils/appealsService';
import { getDepartments, Department } from '@/utils/userService';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown';
import DateTimeInput from '@/components/ui/DateTimeInput';
import AttachmentsPicker, { AttachmentFile } from '@/components/ui/AttachmentsPicker';

export default function AppealNew() {
  const router = useRouter();

  const [form, setForm] = useState<{
    toDepartmentId?: number;
    title?: string;
    text?: string;
    deadline?: string; // ISO
    files?: AttachmentFile[];
  }>({});

  const [dropdownItems, setDropdownItems] = useState<DropdownItem<number>[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const deps = await getDepartments();
        if (isMounted) setDropdownItems(deps.map(dep => ({ label: dep.name, value: dep.id })));
      } catch (e) {
        console.error('Ошибка загрузки отделов:', e);
      } finally {
        if (isMounted) setLoadingDeps(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const errors = useMemo(() => ({
    toDepartmentId: !form.toDepartmentId ? 'Выберите отдел' : undefined,
    text: !form.text || !form.text.trim() ? 'Опишите обращение' : undefined,
  }), [form.toDepartmentId, form.text]);

  const isValid = !errors.toDepartmentId && !errors.text;
  const canSubmit = Boolean(isValid && !submitting);

  async function onSubmit() {
    if (!isValid) {
      Alert.alert('Проверьте форму', [errors.toDepartmentId, errors.text].filter(Boolean).join('\n'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await createAppeal({
        toDepartmentId: form.toDepartmentId!,
        title: form.title?.trim() || undefined,
        text: form.text!.trim(),
        deadline: form.deadline?.trim() || undefined,
        attachments: form.files,
      });
      router.replace(`/(main)/services/appeals/${res.id}`);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось создать обращение');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingVertical: 16 }}>
      <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 16, gap: 14 }}>
        <Text style={styles.title}>Новое обращение</Text>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Отдел *</Text>
        {loadingDeps ? (
          <ActivityIndicator />
        ) : (
          <Dropdown<number>
            placeholder="Выберите отдел"
            items={dropdownItems}
            value={form.toDepartmentId}
            onChange={(val) => update('toDepartmentId', val)}
            errorText={errors.toDepartmentId}
          />
        )}
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Заголовок (опционально)</Text>
        <TextInput
          placeholder="Коротко опишите проблему"
          placeholderTextColor="#9CA3AF"
          style={[styles.input, styles.inputText]}
          value={form.title || ''}
          onChangeText={(t) => update('title', t)}
          maxLength={120}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Описание *</Text>
        <TextInput
          placeholder="Подробно опишите суть обращения"
          placeholderTextColor="#9CA3AF"
          style={[styles.input, styles.inputText, { minHeight: 110, textAlignVertical: 'top', borderColor: errors.text ? '#EF4444' : '#E5E7EB' }]}
          multiline
          value={form.text || ''}
          onChangeText={(t) => update('text', t)}
        />
        {!!errors.text && <Text style={styles.errorText}>{errors.text}</Text>}
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Дедлайн (опционально)</Text>
        <DateTimeInput placeholder="Выберите дату и время" value={form.deadline} onChange={(iso) => update('deadline', iso)} />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Вложения</Text>
        <AttachmentsPicker
          value={form.files || []}
          onChange={(next) => update('files', next)}
          addLabel="Добавить файлы"
          accept="*/*"
          multiple
          maxFiles={10}
          showChips
        />
      </View>

      <Pressable onPress={onSubmit} disabled={!canSubmit} style={({ pressed }) => [styles.submitBtn, (!canSubmit || pressed) && { opacity: 0.9 }]}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.submitText}>Создать обращение</Text>
          </>
        )}
      </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: '#0B1220', marginBottom: 2 },
  fieldBlock: { gap: 8 },
  label: { color: '#4B5563', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  inputText: { color: '#111827' },
  submitBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#2563EB' },
  submitText: { color: '#fff', fontWeight: '800' },
});
