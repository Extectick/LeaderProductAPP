import type { HelpAssistantRun, HelpAssistantScenario } from '../../src/features/help/helpAssistant';
import type { HelpMessage } from '../../src/features/help/helpApi';

/** Preserve history/sequence IDs, but retire progress belonging to an older input. */
export function supersedeFixtureAssistantRuns(messages: HelpMessage[], exceptMessageId?: number): HelpMessage[] {
  return messages.map((message): HelpMessage => {
    const run = message.assistantRun;
    if (!run || message.id === exceptMessageId || !(run.status === 'thinking' || run.status === 'streaming' || run.status === 'stopped' && !message.text)) return message;
    return { ...message, assistantRun: { ...run, status: 'stopped', stopReason: 'superseded', eventId: run.eventId + 1, updatedAt: Date.now() } };
  });
}

export function fixtureAssistantTitle(text: string) {
  if (/принтер|печата/i.test(text)) return 'Не печатает принтер';
  if (/заказ/i.test(text)) return 'Проблема с заказом';
  if (/вход|войти|авторизац/i.test(text)) return 'Проблема со входом';
  if (/обмен/i.test(text)) return 'Ошибка обмена';
  const title = text.trim().replace(/\s+/g, ' ') || 'Вопрос по вложению';
  return title.length > 48 ? `${title.slice(0, 45).trimEnd()}…` : title;
}

function answerFor(text: string, scenario: HelpAssistantScenario) {
  if (scenario === 'question') return 'Уточните, пожалуйста: какая ошибка появляется на экране и после какого действия? Можно приложить фотографию — так будет проще выбрать следующий шаг.';
  if (/принтер|печата/i.test(text)) return 'Начнём с простых проверок:\n\n1. Проверьте питание принтера, бумагу и подключение.\n2. Откройте очередь печати и посмотрите, нет ли зависшего задания или режима «Приостановлено».\n3. Попробуйте напечатать пробную страницу.\n\nЕсли печать не восстановится, напишите модель принтера и текст ошибки. При необходимости подключим IT.';
  return 'Предлагаю сначала уточнить, на каком шаге возникает проблема:\n\n1. Проверьте подключение к сети.\n2. Повторите действие и запишите текст ошибки.\n3. Пришлите номер заказа или снимок экрана, если они относятся к проблеме.\n\nЭто поможет выбрать следующий шаг или передать обращение специалисту IT.';
}

type Job = { run: HelpAssistantRun; text: string; answer: string; timer?: ReturnType<typeof setTimeout>; emit: (run: HelpAssistantRun, text: string) => void };
/** One cancellable timer per ticket; replaced runs cannot publish late events. */
export class FixtureAssistant {
  private jobs = new Map<number, Job>();
  private sequence = 0;
  start(ticketId: number, source: string, scenario: HelpAssistantScenario, emit: Job['emit'], task?: {id?: string; startSequence: number; contextMessageCount: number}, resume?: {run:HelpAssistantRun;text:string}) {
    this.cancel(ticketId);
    const now = Date.now();
    const job: Job = { run: { ticketId, runId: `qa-ai-${now}-${++this.sequence}`, eventId: 0, status: 'thinking', step: 0, completedSteps: 0, startedAt: now, updatedAt: now }, text: '', answer: answerFor(source, scenario), emit };
    job.run = { ...job.run, taskId: task?.id ?? job.run.runId, taskStartSequence: task?.startSequence, contextMessageCount: task?.contextMessageCount ?? 1,scenario };
    if(resume){job.run={...resume.run,updatedAt:now,scenario};job.text=resume.text;}
    this.jobs.set(ticketId, job);
    const publish = () => {
      job.run = { ...job.run, eventId: job.run.eventId + 1, updatedAt: Date.now() };
      emit({ ...job.run }, job.text);
    };
    const schedule = (work: () => void, ms: number) => { job.timer = setTimeout(() => { if (this.jobs.get(ticketId) === job) work(); }, ms); };
    const stream = () => {
      const remaining = job.answer.slice(job.text.length);
      job.text += remaining.match(/^\s*\S+\s*/)?.[0] || remaining;
      job.run.status = job.text === job.answer ? 'completed' : 'streaming';
      publish();
      if (job.run.status !== 'completed') schedule(stream, 90);
    };
    const step = () => {
      if (scenario === 'error' && job.run.step === 1) { job.run.status = 'error'; publish(); return; }
      job.run.completedSteps = job.run.step + 1;
      if (job.run.step === 3) { job.run.status = 'streaming'; publish(); schedule(stream, 180); }
      else { job.run.step++; publish(); schedule(step, scenario === 'slow' ? 3200 : 1100); }
    };
    publish(); schedule(resume?.run.status==='streaming'?stream:step, resume?.run.status==='streaming'?90:scenario === 'slow' ? 3200 : 1100);
    return job.run.runId;
  }
  stop(ticketId: number, runId: string) {
    const job = this.jobs.get(ticketId);
    if (!job || job.run.runId !== runId || !['thinking', 'streaming'].includes(job.run.status)) return;
    clearTimeout(job.timer);
    job.run = { ...job.run, status: 'stopped', stopReason: 'user', eventId: job.run.eventId + 1, updatedAt: Date.now() };
    job.emit({ ...job.run }, job.text);
  }
  cancel(ticketId: number) { const old = this.jobs.get(ticketId); if (old) clearTimeout(old.timer); this.jobs.delete(ticketId); }
  dispose() { for (const id of this.jobs.keys()) this.cancel(id); }
}
