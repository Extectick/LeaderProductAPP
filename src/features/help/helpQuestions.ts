import type { HelpMessage } from './helpApi';
import type { HelpAssistantQuestion } from './helpAssistant';

const questionLike = (value: string) => /[?？]|^(?:укажите|уточните|опишите|напишите|расскажите|какая|какой|какие|есть ли)(?:\s|$)/iu.test(value) || /^(?:укажите|уточните|опишите|напишите|расскажите)\s/iu.test(value);

export function helpQuestions(message: HelpMessage): HelpAssistantQuestion[] {
  const run = message.assistantRun;
  if (run?.status !== 'completed') return [];
  if (Array.isArray(run.questions) && run.questions.length) return run.questions.slice(0, 3).filter(q =>
    q && typeof q.id === 'string' && typeof q.question === 'string' && q.question.trim() && Array.isArray(q.options)).map((q, index) => ({
      id: `q:${index}:${q.id.slice(0, 64)}`, header: String(q.header || 'Уточнение').slice(0, 60), question: q.question.slice(0, 600), multiSelect: q.multiSelect === true,
      options: q.options.filter(option => option && typeof option.label === 'string' && option.label.trim()).slice(0, 4).map(option => ({ label: option.label.slice(0, 120), description: typeof option.description === 'string' ? option.description.slice(0, 240) : '' })),
    }));
  if (run.generation?.decision !== 'clarify') return [];
  const suggestions = (run.suggestions || []).filter(value => typeof value === 'string' && value.trim()).slice(0, 3);
  // Older responses (including ticket 24) put questions in suggestions. Never
  // turn those questions into answers submitted on the user's behalf.
  if (suggestions.length && suggestions.every(questionLike)) return suggestions.map((question, index) => ({
    id: `legacy-${index}`, header: `Уточнение ${index + 1}`, question, options: [], multiSelect: false,
  }));
  if (!message.text?.trim()) return [];
  return [{ id: 'clarification', header: 'Уточнение', question: message.text.slice(0, 1200), multiSelect: false,
    options: suggestions.filter(value => !questionLike(value)).map(label => ({ label })) }];
}

export type HelpQuestionAnswer = { selected: string[]; text: string; skipped?: boolean; fileCount?: number; fileNames?: string[]; fileKeys?: string[] };
export type HelpQuestionDraft = { index: number; collapsed: boolean; review?: boolean;
  answers: Record<string, HelpQuestionAnswer> };
export const emptyHelpQuestionDraft = (): HelpQuestionDraft => ({ index: 0, collapsed: false, review: false, answers: Object.create(null) });

export function helpQuestionAnswer(draft: HelpQuestionDraft, id: string): HelpQuestionAnswer | undefined {
  return Object.prototype.hasOwnProperty.call(draft.answers, id) ? draft.answers[id] : undefined;
}

export function helpQuestionAnswerText(answer: HelpQuestionAnswer | undefined, attachmentCount?: number, attachmentNames?: string[], attachmentKeys?: string[]) {
  if (!answer) return '';
  const matchingFiles = answer.fileKeys?.length && attachmentKeys ? answer.fileKeys.some(key => attachmentKeys.includes(key))
    : answer.fileNames?.length && attachmentNames ? answer.fileNames.some(name => attachmentNames.includes(name)) : true;
  const hasFiles = (answer.fileCount || 0) > 0 && matchingFiles && (attachmentCount === undefined || attachmentCount > 0);
  const text=[...answer.selected, answer.text.trim(), hasFiles ? 'См. вложение' : ''].filter(Boolean).join('; ');
  return text || (answer.skipped ? 'Пропущен' : '');
}

export function helpQuestionHasAnswer(answer: HelpQuestionAnswer | undefined, attachmentCount?: number, attachmentNames?: string[], attachmentKeys?: string[]) {
  return Boolean(answer && helpQuestionAnswerText({...answer,skipped:false},attachmentCount,attachmentNames,attachmentKeys));
}

export function restoreHelpQuestionDraft(raw: string, questions: HelpAssistantQuestion[]): HelpQuestionDraft {
  const result = emptyHelpQuestionDraft();
  try {
    const value = JSON.parse(raw);
    result.index = Number.isInteger(value?.index) ? Math.max(0, Math.min(questions.length - 1, value.index)) : 0;
    result.collapsed = value?.collapsed === true;
    result.review = value?.review === true;
    for (const question of questions) {
      const answer = value?.answers?.[question.id];
      if (!answer) continue;
      result.answers[question.id] = {
        skipped: answer.skipped === true,
        text: typeof answer.text === 'string' ? answer.text.slice(0, 4000) : '',
        fileCount: Number.isInteger(answer.fileCount) ? Math.max(0, Math.min(10, answer.fileCount)) : 0,
        fileNames: Array.isArray(answer.fileNames) ? answer.fileNames.filter((name: unknown): name is string => typeof name === 'string').slice(0, 10).map((name: string) => name.slice(0, 200)) : [],
        fileKeys: Array.isArray(answer.fileKeys) ? answer.fileKeys.filter((key: unknown): key is string => typeof key === 'string').slice(0, 10).map((key: string) => key.slice(0, 2000)) : [],
        selected: Array.isArray(answer.selected) ? [...new Set(answer.selected.filter((label: unknown): label is string =>
          typeof label === 'string' && question.options.some(option => option.label === label)))].slice(0, question.multiSelect ? 4 : 1) as string[] : [],
      };
    }
  } catch { /* A missing or obsolete local draft starts a fresh questionnaire. */ }
  // Recover drafts saved by the old whole-questionnaire dismissal. Keep every
  // earlier answer and apply the user's Skip to the active question only.
  try { if (JSON.parse(raw)?.dismissed === true) return skipHelpQuestion(result, questions); } catch { /* empty draft */ }
  return result;
}

export function skipHelpQuestion(draft: HelpQuestionDraft, questions: HelpAssistantQuestion[], attachmentCount?: number, attachmentNames?: string[], attachmentKeys?: string[]): HelpQuestionDraft {
  const question=questions[draft.index];
  if(!question || draft.review)return draft;
  const previous=helpQuestionAnswer(draft,question.id);
  const answer=helpQuestionHasAnswer(previous,attachmentCount,attachmentNames,attachmentKeys)
    ? {...previous!,skipped:false}
    : {selected:[],text:'',skipped:true,fileCount:0,fileNames:[],fileKeys:[]};
  return {...draft,collapsed:false,index:Math.min(draft.index+1,questions.length-1),review:draft.index===questions.length-1,
    answers:{...draft.answers,[question.id]:answer}};
}

export function formatHelpQuestionAnswers(questions: HelpAssistantQuestion[], draft: HelpQuestionDraft, attachmentCount?: number, attachmentNames?: string[], attachmentKeys?: string[]) {
  return questions.map(question => {
    if (helpQuestionAnswer(draft, question.id)?.skipped && !helpQuestionHasAnswer(helpQuestionAnswer(draft,question.id),attachmentCount,attachmentNames,attachmentKeys)) return `${question.question}\nВопрос пропущен пользователем.`;
    const answer = helpQuestionAnswerText(helpQuestionAnswer(draft, question.id), attachmentCount, attachmentNames, attachmentKeys);
    if (!answer) throw new Error('Ответьте на каждый вопрос.');
    return `${question.question}\nОтвет: ${answer}`;
  }).join('\n\n');
}

/** Preserve both unsent drafts when typing races the questionnaire send. */
export function mergeQuestionMessageDraft(backup: string, edited: string) {
  if (!backup || backup === edited) return edited;
  if (!edited) return backup;
  return `${backup}\n\n${edited}`;
}
