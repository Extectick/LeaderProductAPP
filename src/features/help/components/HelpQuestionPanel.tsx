import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAssistantQuestion } from '../helpAssistant';
import { emptyHelpQuestionDraft, formatHelpQuestionAnswers, helpQuestionAnswer, helpQuestionAnswerText, helpQuestionHasAnswer, restoreHelpQuestionDraft, skipHelpQuestion, type HelpQuestionDraft } from '../helpQuestions';
import { useHelpTheme } from '../helpTheme';
import {HelpQuestionReveal} from './HelpQuestionReveal';
import {HelpQuestionTransition} from './HelpQuestionTransition';
import {HELP_QUESTION_NAVIGATION_HEIGHT} from '../helpQuestionLayout';
import {helpHaptic} from '../helpHaptics';

export type HelpQuestionInputMode = 'question' | 'message';
export type HelpQuestionAttachments = { count: number; names?: string[]; keys?: string[] };
export type HelpQuestionSubmitSnapshot = { revision: number; text: string };
export type HelpQuestionPanelHandle = {
  /** Advances the active answer; the last composer action may send immediately. */
  answer: (text: string, attachments?: HelpQuestionAttachments, stageOnly?: boolean) => Promise<boolean>;
  capture: (text: string) => void;
  submitReview: () => Promise<void>;
  back: () => void;
  skip: () => void;
  getDraftText: () => string;
};
export type HelpQuestionChange = { index: number; question: HelpAssistantQuestion; review: boolean };
type Props = {
  integrated?: boolean; submitOnLastAnswer?: boolean;
  /** The hidden opening scene measures questions without a height animation. */
  animate?:boolean;
  questions: HelpAssistantQuestion[]; draft: string; disabled: boolean; maxBodyHeight: number;
  loadDraft: () => Promise<string>; saveDraft: (value: string) => Promise<unknown>;
  onDraftChange: (text: string) => void; onWriteAnswer: () => void;
  onSubmit: (text: string, snapshot?: HelpQuestionSubmitSnapshot) => Promise<boolean>; onSubmitStart?: () => HelpQuestionSubmitSnapshot;
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
  const hydration=useRef(0),hydrated=useRef(false),revision=useRef(0);
  const bodyMetrics=useRef({height:0,content:0,y:0}),moreAnswersRef=useRef(false);
  const [moreAnswers,setMoreAnswers]=useState(false);
  const measureBody=(next:Partial<{height:number;content:number;y:number}>)=>{
    Object.assign(bodyMetrics.current,next);
    const value=bodyMetrics.current.content-bodyMetrics.current.height-bodyMetrics.current.y>2 && bodyMetrics.current.height>0;
    if(value!==moreAnswersRef.current){moreAnswersRef.current=value;setMoreAnswers(value);}
  };
  const question = props.questions[state.index], mode = props.inputMode || 'question';
  const disabled = props.disabled || !ready || sending;
  const fileCount = props.attachmentCount || 0;
  const update = (next: HelpQuestionDraft) => {
    const writeRevision=++revision.current;
    current.current = next; setState(next);
    const value = JSON.stringify(next);
    writes.current = writes.current.catch(() => {}).then(() => {
      // Keep the in-flight write and the newest snapshot, not a backlog of
      // every tap/keystroke. Final submit still awaits this durable snapshot.
      if(writeRevision!==revision.current)return;
      return storage.current.save(value);
    });
    void writes.current.catch(() => { if (alive.current) setError('Не удалось сохранить ответы. Повторите отправку.'); });
  };
  useEffect(() => {
    alive.current = true;
    let active=true;
    const generation=++hydration.current,loadedRevision=revision.current;
    const valid=()=>active && alive.current && generation===hydration.current;
    const cleanup=()=>{active=false;alive.current=false;};
    // Fast Refresh re-runs effects while retaining these answers. A late read
    // from an older effect must never replace a newer load or an interaction.
    if(hydrated.current)return cleanup;
    void storage.current.load().then(raw => {
      if (!valid() || revision.current!==loadedRevision || hydrated.current) return;
      const restored = restoreHelpQuestionDraft(raw, latest.current.questions);
      // Answers survive navigation; the collapsed presentation belongs only
      // to this mounted conversation, so every new opening shows its question.
      restored.collapsed=false;
      if(latest.current.submitOnLastAnswer)restored.review=false;
      current.current = restored; setState(restored);
      try { if (JSON.parse(raw)?.dismissed === true) update(restored); } catch { /* empty draft */ }
      const text=helpQuestionAnswer(restored,latest.current.questions[restored.index]?.id)?.text;
      if(text&&(latest.current.inputMode||'question')==='question'&&!latest.current.draft.trim())latest.current.onDraftChange(text);
    }).catch(() => { if (valid()) setError('Не удалось восстановить сохранённые ответы.'); })
      .finally(() => { if (valid()) {hydrated.current=true;setReady(true);} });
    return cleanup;
  }, []);
  useLayoutEffect(() => {
    if (ready && question) latest.current.onQuestionChange?.({ index: state.index, question, review: !props.submitOnLastAnswer && state.review === true });
  }, [ready, state.index, state.review, props.submitOnLastAnswer, question?.id, question?.question]);
  useLayoutEffect(()=>{
    bodyMetrics.current={height:0,content:0,y:0};moreAnswersRef.current=false;setMoreAnswers(false);
  },[state.index,state.review]);
  const withText = (text: string, markFiles = false, attachments?: HelpQuestionAttachments): HelpQuestionDraft => {
    const saved = current.current, q = latest.current.questions[saved.index];
    if (!q || (latest.current.inputMode || 'question') === 'message') return saved;
    const previous = helpQuestionAnswer(saved, q.id);
    return { ...saved, review: latest.current.submitOnLastAnswer ? false : saved.review, answers: { ...saved.answers, [q.id]: { selected: previous?.selected || [], text: text.trim(),
      skipped: previous?.skipped === true && !text.trim() && !(markFiles && (attachments?.count ?? latest.current.attachmentCount ?? 0) > 0),
      fileCount: markFiles ? Math.max(0, Math.min(10, attachments?.count ?? latest.current.attachmentCount ?? 0)) : previous?.fileCount || 0,
      fileNames: markFiles ? (attachments?.names || latest.current.attachmentNames || []).filter(name => typeof name === 'string').slice(0, 10).map(name => name.slice(0, 200)) : previous?.fileNames || [],
      fileKeys: markFiles ? (attachments?.keys || latest.current.attachmentKeys || []).filter(key => typeof key === 'string').slice(0, 10).map(key => key.slice(0, 2000)) : previous?.fileKeys || [] } } };
  };
  const capture = (text: string) => {
    if (!alive.current || !ready || submitted || locked.current || (latest.current.inputMode || 'question') === 'message') return;
    if (text.trim().length > 4000) { setError('Ответ на один вопрос — до 4000 символов.'); return; }
    const next = withText(text);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) update(next);
  };
  const navigate = (index: number) => {
    if (!alive.current || disabled || locked.current || current.current.index!==state.index) return;
    if (mode === 'question' && props.draft.trim().length > 4000) { setError('Сократите ответ до 4000 символов.'); return; }
    const next = { ...withText(latest.current.draft), index, review: false, collapsed: false };
    helpHaptic('selection');update(next); setError('');
    if (mode === 'question') latest.current.onDraftChange(helpQuestionAnswer(next, latest.current.questions[index].id)?.text || '');
    else latest.current.onInputModeChange?.('question');
  };
  const answer = async (text: string, attachments?: HelpQuestionAttachments, stageOnly=false): Promise<boolean> => {
    if (!alive.current || locked.current || latest.current.disabled || !ready || submitted || (latest.current.inputMode || 'question') === 'message') return false;
    if (text.trim().length > 4000) { setError('Ответ на один вопрос — до 4000 символов.'); return false; }
    const next = withText(text, true, attachments), q = latest.current.questions[next.index];
    if (!q) return false;
    if (!helpQuestionAnswerText(helpQuestionAnswer(next, q.id), attachments?.count ?? latest.current.attachmentCount ?? 0, attachments?.names ?? latest.current.attachmentNames, attachments?.keys ?? latest.current.attachmentKeys)) {
      setError('Выберите вариант, напишите ответ или прикрепите файл.'); return false;
    }
    setError('');
    if (next.review) { update(next); return false; }
    if (next.index < latest.current.questions.length - 1) {
      const advanced = { ...next, index: next.index + 1 }; helpHaptic('selection');update(advanced);
      latest.current.onDraftChange(helpQuestionAnswer(advanced, latest.current.questions[advanced.index].id)?.text || '');
    } else if(latest.current.submitOnLastAnswer) {
      if(stageOnly)update(next);
      else return submitAnswers(next);
    } else update({ ...next, review: true });
    return false;
  };
  async function submitAnswers(next:HelpQuestionDraft):Promise<boolean> {
    if (!alive.current || latest.current.disabled || !ready || locked.current || submitted || (latest.current.inputMode || 'question') === 'message') return false;
    const missing = latest.current.questions.findIndex(q => !helpQuestionAnswerText(helpQuestionAnswer(next, q.id), latest.current.attachmentCount || 0, latest.current.attachmentNames, latest.current.attachmentKeys));
    if (missing >= 0) { navigate(missing); setError('Остался вопрос без ответа.'); return false; }
    locked.current = true; setSending(true); setError('');
    const snapshot = latest.current.onSubmitStart?.(); update(next);
    try {
      await writes.current;
      if (!alive.current || latest.current.disabled) return false;
      const text = formatHelpQuestionAnswers(latest.current.questions, next, latest.current.attachmentCount || 0, latest.current.attachmentNames, latest.current.attachmentKeys);
      const sent = snapshot ? await latest.current.onSubmit(text, snapshot) : await latest.current.onSubmit(text);
      if (sent) {
        if (alive.current) setSubmitted(true);
        // The message has already been accepted. A cache cleanup failure must
        // never turn that success into a retry and duplicate the response.
        await storage.current.save('').catch(() => {});
      }
      return sent;
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Не удалось отправить ответы.'); return false; }
    finally { locked.current = false; if (alive.current) setSending(false); }
  };
  const submitReview = async () => {
    if(!current.current.review && !latest.current.submitOnLastAnswer)return;
    await submitAnswers(withText(latest.current.draft));
  };
  const skip = () => {
    if (!alive.current || disabled || locked.current || submitted || (current.current.review && !latest.current.submitOnLastAnswer) || (latest.current.inputMode || 'question') === 'message') return;
    if (current.current.index !== state.index) return;
    const next=skipHelpQuestion({...withText(latest.current.draft),review:false},latest.current.questions,latest.current.attachmentCount || 0,latest.current.attachmentNames,latest.current.attachmentKeys);
    if(next.review && latest.current.submitOnLastAnswer){latest.current.onDraftChange('');void submitAnswers({...next,review:false});return;}
    helpHaptic('selection');update(next); setError('');
    latest.current.onDraftChange(next.review?'':helpQuestionAnswer(next,latest.current.questions[next.index].id)?.text || '');
  };
  const back = () => { if (state.review || state.index > 0) navigate(state.review ? state.index : state.index - 1); };
  useImperativeHandle(ref, () => ({ answer, capture, submitReview, back, skip, getDraftText: () => helpQuestionAnswer(current.current, latest.current.questions[current.current.index]?.id)?.text || '' }));
  if (!ready || !question || submitted) return null;
  const collapsed = state.collapsed || mode === 'message';
  const reviewing = !props.submitOnLastAnswer && state.review === true;
  const minimalReview = reviewing;
  const primaryLabel = reviewing || (props.submitOnLastAnswer && state.index===props.questions.length-1) ? 'Отправить ответы' : state.index < props.questions.length - 1 ? 'Далее' : 'Проверить ответы';
  const customText = props.draft.trim() || helpQuestionAnswer(state, question.id)?.text || '';
  const canSkip=!helpQuestionHasAnswer(helpQuestionAnswer(withText(props.draft),question.id),fileCount,props.attachmentNames,props.attachmentKeys);
  const web=Platform.OS==='web';
  const collapseControl=<Pressable accessibilityRole="button" accessibilityLabel="Свернуть вопросы ИИ" accessibilityState={{ expanded: true }} disabled={disabled}
    onPress={() => { if(!alive.current || disabled || locked.current)return;capture(latest.current.draft); update({ ...current.current, collapsed: true }); latest.current.onInputModeChange?.('message'); }}
    hitSlop={4} style={{ minHeight: web?28:36, minWidth: 44, flexDirection:'row', gap:6, justifyContent: 'center', alignItems: 'center' }}>
    {!minimalReview ? <Text style={{ color: c.muted, fontSize: 12 }}>{`${state.index + 1} из ${props.questions.length}`}</Text> : null}<Ionicons name="chevron-down" size={16} color={c.muted}/>
  </Pressable>;
  const collapsedContent = <><View pointerEvents="none" style={{height:StyleSheet.hairlineWidth,backgroundColor:c.line,marginHorizontal:14}}/><Pressable accessibilityRole="button" accessibilityLabel="Развернуть вопросы ИИ" accessibilityState={{ expanded: false }} disabled={disabled}
      onPress={() => { update({ ...current.current, collapsed: false }); if (mode === 'message') latest.current.onInputModeChange?.('question'); }}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={c.muted}/><Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>ИИ ожидает ответ</Text><Ionicons name="chevron-up" size={16} color={c.muted}/>
    </Pressable></>;
  const expandedContent = <View style={{paddingTop:props.integrated?8:0}}>
    {!web?<HelpQuestionNavigation index={state.index} review={reviewing} canSkip={canSkip} disabled={disabled} onBack={back} onSkip={skip}/>:null}
    <HelpQuestionTransition index={state.index} identity={reviewing?'review':question.id}>
    <View style={{position:'relative'}}>
      <ScrollView testID="help-question-body" key={reviewing ? 'review' : question.id} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEventThrottle={32}
        onLayout={event=>measureBody({height:event.nativeEvent.layout.height})} onContentSizeChange={(_,content)=>measureBody({content})}
        onScroll={event=>measureBody({height:event.nativeEvent.layoutMeasurement.height,content:event.nativeEvent.contentSize.height,y:event.nativeEvent.contentOffset.y})}
        style={{ maxHeight: props.maxBodyHeight }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom:4 }}>
      <View testID="help-question-heading" style={{ flexDirection: 'row', flexWrap:web?'wrap':'nowrap', alignItems: 'flex-start', gap: web?4:8 }}>
        {!minimalReview ? <Text testID="help-question-text" style={{ flex: 1,...(web?{flexBasis:240,minWidth:200,maxWidth:'100%' as const}:{}), paddingVertical: 2, color: c.text, fontSize: 15, lineHeight: 21, fontWeight: '500' }}>{question.question}</Text> : <View style={{flex:1}}/>}
        {web?<View testID="help-question-inline-controls" style={{flexDirection:'row',alignItems:'center',gap:8,marginLeft:'auto',flexWrap:'wrap',maxWidth:'100%'}}>
          <HelpQuestionNavigation compact index={state.index} review={reviewing} canSkip={canSkip} disabled={disabled} onBack={back} onSkip={skip}/>
          {collapseControl}
        </View>:collapseControl}
      </View>
        {reviewing ? <View testID="help-question-review" style={{ gap: 8 }}>
          {props.questions.map((q, index) => {
            const text = helpQuestionAnswerText(helpQuestionAnswer(state, q.id), fileCount, props.attachmentNames, props.attachmentKeys);
            return <Pressable key={q.id} accessibilityRole="button" accessibilityLabel={`Изменить ответ ${index + 1}`} disabled={disabled} onPress={() => navigate(index)} style={{ minHeight: 44, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 3 }}><Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>{q.question}</Text><Text style={{ color: text ? c.text : c.danger, fontSize: 14, lineHeight: 21 }}>{text || 'Нет ответа'}</Text></View><View style={{ width: 32, alignItems: 'center' }}><Ionicons name="pencil-outline" size={19} color={c.muted}/></View>
            </Pressable>;
          })}
        </View> : <>
          {question.options.map(option => {
            const checked = Boolean(helpQuestionAnswer(state, question.id)?.selected.includes(option.label));
            return <Pressable key={option.label} accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'} accessibilityLabel={option.label} accessibilityState={{ checked, disabled }} disabled={disabled}
              onPress={() => {
                if (!alive.current || latest.current.disabled || locked.current || current.current.index!==state.index || latest.current.questions[current.current.index]?.id!==question.id || (latest.current.inputMode || 'question') === 'message') return;
                const next = withText(latest.current.draft), previous = helpQuestionAnswer(next, question.id);
                const alreadySelected = previous?.selected.includes(option.label) || false;
                const selected = question.multiSelect ? alreadySelected ? (previous?.selected || []).filter(label => label !== option.label) : [...(previous?.selected || []), option.label] : [option.label];
                if(question.multiSelect||!alreadySelected)helpHaptic('selection');
                update({ ...next, answers: { ...next.answers, [question.id]: { ...previous, selected, skipped: false, text: previous?.text || '', fileCount: previous?.fileCount || 0 } } }); setError('');
              }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
              <Ionicons name={question.multiSelect ? checked ? 'checkbox' : 'square-outline' : checked ? 'radio-button-on' : 'radio-button-off'} size={22} color={checked ? c.accentText : c.muted}/>
              <View style={{ flex: 1, gap: 2 }}><Text style={{ color: c.text, fontSize: 15, lineHeight: 21, fontWeight: checked ? '500' : '400' }}>{option.label}</Text>{option.description && option.description !== option.label ? <Text numberOfLines={2} style={{ color: c.muted, fontSize: 12, lineHeight: 16 }}>{option.description}</Text> : null}</View>
            </Pressable>;
          })}
          {!props.integrated ? <Pressable accessibilityRole="button" accessibilityLabel="Написать свой ответ" disabled={disabled} onPress={() => {
            const next = withText(latest.current.draft), previous = helpQuestionAnswer(next, question.id);
            update({ ...next, answers: { ...next.answers, [question.id]: { ...previous, selected: [], skipped: false, text: previous?.text || '', fileCount: previous?.fileCount || 0 } } }); latest.current.onWriteAnswer();
          }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 14 }}><Ionicons name="pencil-outline" size={20} color={c.muted}/><Text style={{ color: c.muted, fontSize: 14 }}>{customText || 'Написать свой ответ'}</Text></Pressable> : null}
        </>}
        {fileCount > 0 ? <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16 }}>{`Прикреплено файлов: ${fileCount}`}</Text> : null}
      </ScrollView>
      {moreAnswers ? <View testID="help-question-more-options" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:'absolute',left:16,right:16,bottom:0,height:12,backgroundColor:c.panel,alignItems:'center',justifyContent:'center'}}><Ionicons name="chevron-down" size={12} color={c.muted}/></View> : null}
    </View>
    </HelpQuestionTransition>
      {error ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 }}>{error}</Text> : null}
      {!props.integrated ? <View testID="help-question-footer" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 }}>
        <View style={{ flex: 1 }}/>
        <Pressable accessibilityRole="button" accessibilityLabel={primaryLabel} disabled={disabled} onPress={() => { if(current.current.index!==state.index)return; if (reviewing) void submitReview(); else void answer(latest.current.draft); }} style={{ minHeight: 44, flexShrink: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: c.accentText, fontSize: 14 }}>{sending ? 'Отправляем…' : minimalReview ? 'Отправить' : primaryLabel}</Text><Ionicons name="arrow-up" size={19} color={c.accentText}/></Pressable>
      </View> : null}
  </View>;
  return <View testID="help-question-panel">
    {props.integrated ? <HelpQuestionReveal collapsed={collapsed} collapsedContent={collapsedContent} animate={props.animate}>{expandedContent}</HelpQuestionReveal> : collapsed ? collapsedContent : expandedContent}
  </View>;
});

/** Small labels, full touch targets; the composer owns the only primary action. */
export function HelpQuestionNavigation({index,review,canSkip=true,disabled,onBack,onSkip,compact=false}:{index:number;review:boolean;canSkip?:boolean;disabled:boolean;onBack:()=>void;onSkip:()=>void;compact?:boolean}) {
  const c=useHelpTheme();
  const minHeight=compact?28:HELP_QUESTION_NAVIGATION_HEIGHT;
  return <View testID="help-question-navigation" style={{minHeight,flexDirection:'row',alignItems:'center',gap:compact?8:12,paddingHorizontal:compact?0:12}}>
    {review || index>0 ? <Pressable accessibilityRole="button" accessibilityLabel={review?'Вернуться к вопросам':'Предыдущий вопрос'} disabled={disabled} hitSlop={{top:4,bottom:4}} onPress={onBack} style={{minHeight,paddingHorizontal:4,justifyContent:'center'}}><Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Назад</Text></Pressable>:null}
    {!review && canSkip ? <Pressable accessibilityRole="button" accessibilityLabel="Пропустить вопрос" accessibilityHint="Перейти дальше без ответа на этот вопрос" disabled={disabled} hitSlop={{top:4,bottom:4}} onPress={onSkip} style={{marginLeft:'auto',minHeight,paddingHorizontal:4,justifyContent:'center'}}><Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Пропустить</Text></Pressable> : null}
  </View>;
}
