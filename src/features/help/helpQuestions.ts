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

export type HelpQuestionDraft = { index: number; collapsed: boolean;
  answers: Record<string, { selected: string[]; text: string }> };
export const emptyHelpQuestionDraft = (): HelpQuestionDraft => ({ index: 0, collapsed: false, answers: {} });

export function restoreHelpQuestionDraft(raw: string, questions: HelpAssistantQuestion[]): HelpQuestionDraft {
  const result = emptyHelpQuestionDraft();
  try {
    const value = JSON.parse(raw);
    result.index = Number.isInteger(value?.index) ? Math.max(0, Math.min(questions.length - 1, value.index)) : 0;
    result.collapsed = value?.collapsed === true;
    for (const question of questions) {
      const answer = value?.answers?.[question.id];
      if (!answer) continue;
      result.answers[question.id] = {
        text: typeof answer.text === 'string' ? answer.text.slice(0, 4000) : '',
        selected: Array.isArray(answer.selected) ? [...new Set(answer.selected.filter((label: unknown): label is string =>
          typeof label === 'string' && question.options.some(option => option.label === label)))].slice(0, question.multiSelect ? 4 : 1) as string[] : [],
      };
    }
  } catch { /* A missing or obsolete local draft starts a fresh questionnaire. */ }
  return result;
}

export function formatHelpQuestionAnswers(questions: HelpAssistantQuestion[], draft: HelpQuestionDraft) {
  return questions.map(question => {
    const answer = draft.answers[question.id];
    if (!answer || !answer.selected.length && !answer.text.trim()) throw new Error('Ответьте на каждый вопрос.');
    return `${question.question}\nОтвет: ${[...answer.selected, answer.text.trim()].filter(Boolean).join('; ')}`;
  }).join('\n\n');
}
