import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAssistantQuestion } from '../helpAssistant';
import { emptyHelpQuestionDraft, formatHelpQuestionAnswers, helpQuestionAnswer, helpQuestionAnswerText, restoreHelpQuestionDraft, type HelpQuestionDraft } from '../helpQuestions';
import { useHelpTheme } from '../helpTheme';

export type HelpQuestionInputMode = 'question' | 'message';
export type HelpQuestionAttachments = { count: number; names?: string[]; keys?: string[] };
export type HelpQuestionSubmitSnapshot = { revision: number; text: string };
export type HelpQuestionPanelHandle = {
  /** Saves/advances to review. Only the visible review button may submit. */
  answer: (text: string, attachments?: HelpQuestionAttachments) => Promise<boolean>;
  capture: (text: string) => void;
  getDraftText: () => string;
};
export type HelpQuestionChange = { index: number; question: HelpAssistantQuestion; review: boolean };
type Props = {
  questions: HelpAssistantQuestion[]; draft: string; disabled: boolean; maxBodyHeight: number;
  loadDraft: () => Promise<string>; saveDraft: (value: string) => Promise<unknown>;
  onDraftChange: (text: string) => void; onWriteAnswer: () => void;
  onSubmit: (text: string, snapshot?: HelpQuestionSubmitSnapshot) => Promise<boolean>; onSubmitStart?: () => HelpQuestionSubmitSnapshot; onDismiss: () => void;
  inputMode?: HelpQuestionInputMode; onInputModeChange?: (mode: HelpQuestionInputMode) => void;
  onQuestionChange?: (value: HelpQuestionChange) => void;
  attachmentCount?: number; attachmentNames?: string[]; attachmentKeys?: string[]; onAttachFiles?: () => void;
};

export const HelpQuestionPanel = forwardRef<HelpQuestionPanelHandle, Props>(function HelpQuestionPanel(props, ref) {
  const c = useHelpTheme();
  const [state, setState] = useState(emptyHelpQuestionDraft), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [sending, setSending] = useState(false), [submitted, setSubmitted] = useState(false);
  const current = useRef(state), latest = useRef(props); latest.current = props;
  const storage = useRef({ load: props.loadDraft, save: props.saveDraft });
  const writes = useRef<Promise<unknown>>(Promise.resolve()), locked = useRef(false), alive = useRef(true);
  const autoAdvance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const question = props.questions[state.index], mode = props.inputMode || 'question';
  const disabled = props.disabled || !ready || sending;
  const fileCount = props.attachmentCount || 0;
  const stopAutoAdvance = () => { if (autoAdvance.current) clearTimeout(autoAdvance.current); autoAdvance.current = null; };
  const update = (next: HelpQuestionDraft) => {
    current.current = next; setState(next);
    const value = JSON.stringify(next);
    writes.current = writes.current.catch(() => {}).then(() => storage.current.save(value));
    void writes.current.catch(() => { if (alive.current) setError('Не удалось сохранить ответы. Повторите отправку.'); });
  };
  useEffect(() => {
    alive.current = true;
    void storage.current.load().then(raw => {
      if (!alive.current) return;
      try { if (JSON.parse(raw)?.dismissed === true) { latest.current.onDismiss(); return; } } catch { /* empty draft */ }
      const restored = restoreHelpQuestionDraft(raw, latest.current.questions);
      current.current = restored; setState(restored);
      const text = helpQuestionAnswer(restored, latest.current.questions[restored.index]?.id)?.text;
      if (text && (latest.current.inputMode || 'question') === 'question' && !latest.current.draft.trim()) latest.current.onDraftChange(text);
    }).catch(() => { if (alive.current) setError('Не удалось восстановить сохранённые ответы.'); })
      .finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; stopAutoAdvance(); };
  }, []);
  useEffect(() => {
    if (ready && question) latest.current.onQuestionChange?.({ index: state.index, question, review: state.review === true });
  }, [ready, state.index, state.review, question?.id, question?.question]);
  useEffect(() => { if (disabled || mode === 'message') stopAutoAdvance(); return stopAutoAdvance; }, [disabled, mode, state.index]);
  const withText = (text: string, markFiles = false, attachments?: HelpQuestionAttachments): HelpQuestionDraft => {
    const saved = current.current, q = latest.current.questions[saved.index];
    if (!q || (latest.current.inputMode || 'question') === 'message') return saved;
    const previous = helpQuestionAnswer(saved, q.id);
    return { ...saved, answers: { ...saved.answers, [q.id]: { selected: previous?.selected || [], text: text.trim(),
      fileCount: markFiles ? Math.max(0, Math.min(10, attachments?.count ?? latest.current.attachmentCount ?? 0)) : previous?.fileCount || 0,
      fileNames: markFiles ? (attachments?.names || latest.current.attachmentNames || []).filter(name => typeof name === 'string').slice(0, 10).map(name => name.slice(0, 200)) : previous?.fileNames || [],
      fileKeys: markFiles ? (attachments?.keys || latest.current.attachmentKeys || []).filter(key => typeof key === 'string').slice(0, 10).map(key => key.slice(0, 2000)) : previous?.fileKeys || [] } } };
  };
  const capture = (text: string) => {
    if (!ready || submitted || locked.current || (latest.current.inputMode || 'question') === 'message') return;
    if (text.trim().length > 4000) { setError('Ответ на один вопрос — до 4000 символов.'); return; }
    const next = withText(text);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) update(next);
  };
  const navigate = (index: number) => {
    if (disabled) return;
    stopAutoAdvance();
    if (mode === 'question' && props.draft.trim().length > 4000) { setError('Сократите ответ до 4000 символов.'); return; }
    const next = { ...withText(latest.current.draft), index, review: false, collapsed: false };
    update(next); setError('');
    if (mode === 'question') latest.current.onDraftChange(helpQuestionAnswer(next, latest.current.questions[index].id)?.text || '');
    else latest.current.onInputModeChange?.('question');
  };
  const changeMode = (next: HelpQuestionInputMode) => {
    stopAutoAdvance();
    if (next === mode) return;
    if (mode === 'question') capture(latest.current.draft);
    latest.current.onInputModeChange?.(next);
  };
  const answer = async (text: string, attachments?: HelpQuestionAttachments): Promise<boolean> => {
    if (!alive.current || locked.current || latest.current.disabled || !ready || submitted || (latest.current.inputMode || 'question') === 'message') return false;
    stopAutoAdvance();
    if (text.trim().length > 4000) { setError('Ответ на один вопрос — до 4000 символов.'); return false; }
    const next = withText(text, true, attachments), q = latest.current.questions[next.index];
    if (!q) return false;
    if (!helpQuestionAnswerText(helpQuestionAnswer(next, q.id), attachments?.count ?? latest.current.attachmentCount ?? 0, attachments?.names ?? latest.current.attachmentNames, attachments?.keys ?? latest.current.attachmentKeys)) {
      setError('Выберите вариант, напишите ответ или прикрепите файл.'); return false;
    }
    setError('');
    if (next.review) { update(next); return false; }
    if (next.index < latest.current.questions.length - 1) {
      const advanced = { ...next, index: next.index + 1 }; update(advanced);
      latest.current.onDraftChange(helpQuestionAnswer(advanced, latest.current.questions[advanced.index].id)?.text || '');
    } else update({ ...next, review: true });
    return false;
  };
  const submitReview = async () => {
    if (!alive.current || latest.current.disabled || !ready || locked.current || submitted || !current.current.review || (latest.current.inputMode || 'question') === 'message') return;
    stopAutoAdvance();
    const next = withText(latest.current.draft);
    const missing = latest.current.questions.findIndex(q => !helpQuestionAnswerText(helpQuestionAnswer(next, q.id), latest.current.attachmentCount || 0, latest.current.attachmentNames, latest.current.attachmentKeys));
    if (missing >= 0) { navigate(missing); setError('Остался вопрос без ответа.'); return; }
    locked.current = true; setSending(true); setError('');
    const snapshot = latest.current.onSubmitStart?.(); update(next);
    try {
      await writes.current;
      if (!alive.current || latest.current.disabled) return;
      const text = formatHelpQuestionAnswers(latest.current.questions, next, latest.current.attachmentCount || 0, latest.current.attachmentNames, latest.current.attachmentKeys);
      const sent = snapshot ? await latest.current.onSubmit(text, snapshot) : await latest.current.onSubmit(text);
      if (sent) {
        if (alive.current) setSubmitted(true);
        // The message has already been accepted. A cache cleanup failure must
        // never turn that success into a retry and duplicate the response.
        await storage.current.save('').catch(() => {});
      }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Не удалось отправить ответы.'); }
    finally { locked.current = false; if (alive.current) setSending(false); }
  };
  useImperativeHandle(ref, () => ({ answer, capture, getDraftText: () => helpQuestionAnswer(current.current, latest.current.questions[current.current.index]?.id)?.text || '' }));
  if (!question || submitted) return null;
  const collapsed = state.collapsed || mode === 'message';
  const completed = props.questions.filter(q => helpQuestionAnswerText(helpQuestionAnswer(state, q.id), fileCount, props.attachmentNames, props.attachmentKeys)).length;
  const primaryLabel = state.review ? 'Отправить ответы' : state.index < props.questions.length - 1 ? 'Следующий вопрос' : 'Проверить ответы';
  const modeSwitch = props.onInputModeChange ? <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: 12, marginBottom: 6, padding: 3, borderRadius: 12, backgroundColor: c.elevated }}>
    {(['question', 'message'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'question' ? 'Ответ на вопрос' : 'Обычное сообщение'} accessibilityState={{ selected: mode === value }} disabled={disabled} onPress={() => changeMode(value)} style={{ flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: mode === value ? c.surface : 'transparent' }}><Text style={{ color: mode === value ? c.accentText : c.muted, fontSize: 12, fontWeight: mode === value ? '600' : '400' }}>{value === 'question' ? 'Ответ на вопрос' : 'Сообщение'}</Text></Pressable>)}
  </View> : null;
  return <View testID="help-question-panel" style={{ borderWidth: 1, borderColor: c.line, borderRadius: 20, marginBottom: 8, overflow: 'hidden', backgroundColor: c.surface }}>
    <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? 'Развернуть вопросы ИИ' : 'Свернуть вопросы ИИ'} accessibilityState={{ expanded: !collapsed }} disabled={!ready || sending}
      onPress={() => {
        stopAutoAdvance();
        if (collapsed) { update({ ...current.current, collapsed: false }); if (mode === 'message') latest.current.onInputModeChange?.('question'); }
        else { capture(latest.current.draft); update({ ...current.current, collapsed: true }); latest.current.onInputModeChange?.('message'); }
      }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14 }}>
      <Ionicons name={state.review ? 'checkmark-circle-outline' : 'chatbubble-ellipses-outline'} size={18} color={c.accentText}/>
      <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '600' }}>{state.review ? 'Проверьте ответы' : collapsed ? 'ИИ ждёт вашего ответа' : 'Уточним детали'}</Text>
      <Text style={{ color: c.muted, fontSize: 11 }}>{collapsed ? `${completed} из ${props.questions.length}` : `${state.index + 1} / ${props.questions.length}`}</Text>
      <Ionicons name={collapsed ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted}/>
    </Pressable>
    {!collapsed ? modeSwitch : null}
    {!collapsed ? <>
      {props.questions.length > 1 ? <View style={{ flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingBottom: 8 }}>
        {props.questions.map((q, index) => {
          const done = Boolean(helpQuestionAnswerText(helpQuestionAnswer(state, q.id), fileCount, props.attachmentNames, props.attachmentKeys));
          return <Pressable key={q.id} accessibilityRole="button" accessibilityLabel={`Перейти к вопросу ${index + 1}`} accessibilityState={{ selected: !state.review && index === state.index }} disabled={disabled} onPress={() => navigate(index)} style={{ flex: 1, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, backgroundColor: !state.review && index === state.index ? c.soft : c.elevated }}>
            {done ? <Ionicons name="checkmark" size={12} color={c.green}/> : <Text style={{ color: c.muted, fontSize: 11 }}>{index + 1}</Text>}
            <Text numberOfLines={1} style={{ color: !state.review && index === state.index ? c.accentText : c.muted, fontSize: 11, flexShrink: 1 }}>{q.header}</Text>
          </Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Все вопросы и ответы" disabled={disabled} onPress={() => { stopAutoAdvance(); update({ ...withText(latest.current.draft), review: true }); setError(''); }} style={{ minWidth: 34, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: state.review ? c.soft : c.elevated }}><Ionicons name="list-outline" size={17} color={state.review ? c.accentText : c.muted}/></Pressable>
      </View> : null}
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: props.maxBodyHeight }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 6, gap: 6 }}>
        {state.review ? <View testID="help-question-review" style={{ gap: 6 }}>
          {props.questions.map((q, index) => {
            const text = helpQuestionAnswerText(helpQuestionAnswer(state, q.id), fileCount, props.attachmentNames, props.attachmentKeys);
            return <Pressable key={q.id} accessibilityRole="button" accessibilityLabel={`Изменить ответ ${index + 1}`} disabled={disabled} onPress={() => navigate(index)} style={{ minHeight: 50, padding: 10, borderRadius: 12, backgroundColor: c.elevated, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 3 }}><Text numberOfLines={2} style={{ color: c.muted, fontSize: 11, lineHeight: 15 }}>{q.question}</Text><Text style={{ color: text ? c.text : c.danger, fontSize: 13, lineHeight: 18 }}>{text || 'Нет ответа'}</Text></View><Ionicons name="pencil-outline" size={15} color={c.muted}/>
            </Pressable>;
          })}
          {fileCount > 0 ? <Text style={{ color: c.muted, fontSize: 12 }}>{props.attachmentNames?.length ? props.attachmentNames.slice(0, 3).join(', ') : `Прикреплено файлов: ${fileCount}`}</Text> : null}
        </View> : <>
          <Text style={{ color: c.text, fontSize: 15, lineHeight: 21, fontWeight: '500', marginBottom: 2 }}>{question.question}</Text>
          {question.multiSelect ? <Text style={{ color: c.muted, fontSize: 11 }}>Можно выбрать несколько вариантов</Text> : null}
          {question.options.map(option => {
            const checked = Boolean(helpQuestionAnswer(state, question.id)?.selected.includes(option.label));
            return <Pressable key={option.label} accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'} accessibilityLabel={option.label} accessibilityState={{ checked, disabled }} disabled={disabled}
              onPress={() => {
                if (latest.current.disabled || locked.current || (latest.current.inputMode || 'question') === 'message') return;
                stopAutoAdvance();
                const previous = helpQuestionAnswer(current.current, question.id);
                const alreadySelected = previous?.selected.includes(option.label) || false;
                const selected = question.multiSelect ? alreadySelected ? (previous?.selected || []).filter(label => label !== option.label) : [...(previous?.selected || []), option.label] : [option.label];
                const next = { ...current.current, answers: { ...current.current.answers, [question.id]: { selected, text: '', fileCount: previous?.fileCount || 0 } } };
                update(next); setError(''); latest.current.onDraftChange('');
                if (!question.multiSelect && state.index < props.questions.length - 1) {
                  const index = state.index, id = question.id;
                  autoAdvance.current = setTimeout(() => {
                    autoAdvance.current = null;
                    if (!alive.current || latest.current.disabled || (latest.current.inputMode || 'question') !== 'question' || current.current.index !== index || current.current.review || latest.current.draft.trim() || latest.current.questions[index]?.id !== id) return;
                    const advanced = { ...current.current, index: index + 1 }; update(advanced);
                    latest.current.onDraftChange(helpQuestionAnswer(advanced, latest.current.questions[index + 1].id)?.text || '');
                  }, 200);
                }
              }} style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderWidth: 1, borderColor: checked ? c.accentText : c.line, borderRadius: 13, backgroundColor: checked ? c.soft : c.surface, opacity: disabled ? 0.5 : 1 }}>
              <Ionicons name={question.multiSelect ? checked ? 'checkbox' : 'square-outline' : checked ? 'radio-button-on' : 'radio-button-off'} size={19} color={checked ? c.accentText : c.muted}/>
              <View style={{ flex: 1, gap: 3 }}><Text style={{ color: checked ? c.accentText : c.text, fontSize: 13, fontWeight: checked ? '600' : '400' }}>{option.label}</Text>{option.description && option.description !== option.label ? <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16 }}>{option.description}</Text> : null}</View>
            </Pressable>;
          })}
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Написать свой ответ" disabled={disabled} onPress={() => {
              stopAutoAdvance();
              const next = withText(latest.current.draft), previous = helpQuestionAnswer(next, question.id);
              update({ ...next, answers: { ...next.answers, [question.id]: { selected: [], text: previous?.text || '', fileCount: previous?.fileCount || 0 } } });
              latest.current.onWriteAnswer();
            }} style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="create-outline" size={14} color={c.accentText}/><Text style={{ color: c.accentText, fontSize: 12 }}>Свой ответ</Text></Pressable>
            {props.onAttachFiles ? <Pressable accessibilityRole="button" accessibilityLabel="Прикрепить файл к ответу" disabled={disabled} onPress={() => props.onAttachFiles?.()} style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="attach-outline" size={15} color={c.accentText}/><Text style={{ color: c.accentText, fontSize: 12 }}>Файл{fileCount ? ` · ${fileCount}` : ''}</Text></Pressable> : null}
          </View>
        </>}
      </ScrollView>
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 12, paddingHorizontal: 14, paddingBottom: 4 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Пропустить вопросы" disabled={disabled} onPress={() => { stopAutoAdvance(); capture(latest.current.draft); void writes.current.catch(() => {}).then(() => storage.current.save(JSON.stringify({ ...current.current, dismissed: true }))).catch(() => {}); props.onDismiss(); }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 2 }}><Text style={{ color: c.muted, fontSize: 12 }}>Пропустить</Text></Pressable>
        {!state.review && state.index > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий вопрос" disabled={disabled} onPress={() => navigate(state.index - 1)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: c.muted, fontSize: 12 }}>Назад</Text></Pressable> : null}
        <View style={{ flex: 1 }}/>
        <Pressable accessibilityRole="button" accessibilityLabel={primaryLabel} disabled={disabled} onPress={() => { if (state.review) void submitReview(); else void answer(props.draft); }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, backgroundColor: c.accent, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>{sending ? 'Отправляем…' : state.review ? 'Отправить ответы' : state.index < props.questions.length - 1 ? 'Далее' : 'Проверить ответы'}</Text></Pressable>
      </View>
    </> : null}
  </View>;
});
