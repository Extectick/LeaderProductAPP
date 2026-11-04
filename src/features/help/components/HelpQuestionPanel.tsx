import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAssistantQuestion } from '../helpAssistant';
import { emptyHelpQuestionDraft, formatHelpQuestionAnswers, restoreHelpQuestionDraft, type HelpQuestionDraft } from '../helpQuestions';
import { useHelpTheme } from '../helpTheme';

export type HelpQuestionPanelHandle = { answer: (text: string) => Promise<boolean> };
type Props = {
  questions: HelpAssistantQuestion[]; draft: string; disabled: boolean; maxBodyHeight: number;
  loadDraft: () => Promise<string>; saveDraft: (value: string) => Promise<unknown>;
  onDraftChange: (text: string) => void; onWriteAnswer: () => void;
  onSubmit: (text: string) => Promise<boolean>;
  onDismiss: () => void;
};

export const HelpQuestionPanel = forwardRef<HelpQuestionPanelHandle, Props>(function HelpQuestionPanel(props, ref) {
  const c = useHelpTheme();
  const [state, setState] = useState(emptyHelpQuestionDraft), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [sending, setSending] = useState(false), [submitted, setSubmitted] = useState(false);
  const current = useRef(state), latest = useRef(props); latest.current = props;
  const storage = useRef({ load: props.loadDraft, save: props.saveDraft });
  const writes = useRef<Promise<unknown>>(Promise.resolve()), locked = useRef(false), alive = useRef(true);
  const question = props.questions[state.index];
  const disabled = props.disabled || !ready || sending;
  const update = (next: HelpQuestionDraft) => {
    current.current = next; setState(next);
    const value = JSON.stringify(next);
    writes.current = writes.current.catch(() => {}).then(() => storage.current.save(value));
    void writes.current.catch(() => { if (alive.current) setError('Не удалось сохранить ответы на устройстве. Повторите отправку.'); });
  };
  useEffect(() => {
    alive.current = true;
    void storage.current.load().then(raw => {
      if (!alive.current) return;
      try { if (JSON.parse(raw)?.dismissed === true) { latest.current.onDismiss(); return; } } catch { /* empty draft */ }
      const restored = restoreHelpQuestionDraft(raw, latest.current.questions);
      current.current = restored; setState(restored);
      const text = restored.answers[latest.current.questions[restored.index]?.id]?.text;
      if (text && !latest.current.draft.trim()) latest.current.onDraftChange(text);
    }).catch(() => { if (alive.current) setError('Не удалось восстановить сохранённые ответы.'); })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; };
  }, []);
  const withText = (text: string) => {
    const saved = current.current, q = latest.current.questions[saved.index];
    return { ...saved, answers: { ...saved.answers, [q.id]: { selected: saved.answers[q.id]?.selected || [], text: text.trim() } } };
  };
  const navigate = (index: number) => {
    if (disabled) return;
    const next = { ...withText(latest.current.draft), index }; update(next); setError('');
    latest.current.onDraftChange(next.answers[latest.current.questions[index].id]?.text || '');
  };
  const answer = async (text: string): Promise<boolean> => {
    if (locked.current || props.disabled || !ready || submitted) return false;
    if (text.trim().length > 4000) { setError('Ответ на один вопрос — до 4000 символов.'); return false; }
    const next = withText(text), q = latest.current.questions[next.index], value = next.answers[q.id];
    if (!value.selected.length && !value.text) { setError('Выберите вариант или напишите свой ответ в поле ниже.'); return false; }
    update(next); setError('');
    if (next.index < latest.current.questions.length - 1) {
      update({ ...next, index: next.index + 1 });
      latest.current.onDraftChange(next.answers[latest.current.questions[next.index + 1].id]?.text || '');
      return false;
    }
    const missing = latest.current.questions.findIndex(item => !next.answers[item.id]?.selected.length && !next.answers[item.id]?.text.trim());
    if (missing >= 0) { navigate(missing); setError('Остался вопрос без ответа.'); return false; }
    locked.current = true; setSending(true);
    try {
      await writes.current;
      const sent = await latest.current.onSubmit(formatHelpQuestionAnswers(latest.current.questions, next));
      if (sent) { if (alive.current) setSubmitted(true); await storage.current.save(''); }
      return sent;
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'Не удалось отправить ответы.');
      return false;
    } finally { locked.current = false; if (alive.current) setSending(false); }
  };
  useImperativeHandle(ref, () => ({ answer }));
  if (!question || submitted) return null;
  return <View testID="help-question-panel" style={{ borderWidth: 1, borderColor: c.line, borderRadius: 18, marginBottom: 8, overflow: 'hidden', backgroundColor: c.elevated }}>
    <Pressable accessibilityRole="button" accessibilityLabel={state.collapsed ? 'Развернуть вопросы ИИ' : 'Свернуть вопросы ИИ'} accessibilityState={{ expanded: !state.collapsed }}
      onPress={() => { if (ready) update({ ...current.current, collapsed: !current.current.collapsed }); }}
      style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
      <Ionicons name="help-circle-outline" size={16} color={c.accentText}/>
      <Text style={{ flex: 1, color: c.muted, fontSize: 12 }}>Нужен ваш ответ</Text>
      <Text style={{ color: c.muted, fontSize: 12 }}>{state.index + 1} / {props.questions.length}</Text>
      <Ionicons name={state.collapsed ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted}/>
    </Pressable>
    {!state.collapsed ? <>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: props.maxBodyHeight }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 4, gap: 4 }}>
        <Text style={{ color: c.muted, fontSize: 11 }}>{question.header}</Text>
        <Text selectable style={{ color: c.text, fontSize: 14, lineHeight: 20, marginBottom: 4 }}>{question.question}</Text>
        {question.options.map((option, index) => {
          const checked = Boolean(state.answers[question.id]?.selected.includes(option.label));
          return <Pressable key={option.label} accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'} accessibilityLabel={option.label} accessibilityState={{ checked, disabled }} disabled={disabled}
            onPress={() => {
              const next = withText(latest.current.draft), selected = next.answers[question.id].selected;
              next.answers[question.id].selected = question.multiSelect ? checked ? selected.filter(label => label !== option.label) : [...selected, option.label] : [option.label];
              update(next); setError('');
            }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
            <Ionicons name={question.multiSelect ? checked ? 'checkbox' : 'square-outline' : checked ? 'radio-button-on' : 'radio-button-off'} size={19} color={checked ? c.accentText : c.muted}/>
            <View style={{ flex: 1, gap: 2 }}><Text style={{ color: checked ? c.accentText : c.text, fontSize: 13 }}>{option.label}</Text>{option.description ? <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16 }}>{option.description}</Text> : null}</View>
            <Text style={{ color: c.muted, fontSize: 11 }}>{index + 1}</Text>
          </Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Написать свой ответ" disabled={disabled} onPress={props.onWriteAnswer} style={{ minHeight: 36, justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 12 }}>Свой ответ — в поле ниже</Text></Pressable>
      </ScrollView>
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 12, paddingHorizontal: 14 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 4, gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Пропустить вопросы" disabled={disabled} onPress={() => { void writes.current.catch(() => {}).then(() => storage.current.save(JSON.stringify({ ...current.current, dismissed: true }))).catch(() => {}); props.onDismiss(); }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: c.muted, fontSize: 12 }}>Пропустить</Text></Pressable>
        {state.index > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий вопрос" disabled={disabled} onPress={() => navigate(state.index - 1)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: c.muted, fontSize: 13 }}>Назад</Text></Pressable> : null}
        <View style={{ flex: 1 }}/>
        <Pressable accessibilityRole="button" accessibilityLabel={state.index < props.questions.length - 1 ? 'Следующий вопрос' : 'Отправить ответы'} disabled={disabled} onPress={() => void answer(props.draft)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: c.accentText, fontSize: 13, fontWeight: '600' }}>{sending ? 'Отправляем…' : state.index < props.questions.length - 1 ? 'Далее' : 'Отправить ответы'}</Text></Pressable>
      </View>
    </> : null}
  </View>;
});
