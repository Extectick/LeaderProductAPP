/** UI event contract. The QA entry supplies events; this does not enable a backend AI. */
export type HelpAssistantScenario = 'answer' | 'slow' | 'question' | 'error';
export type HelpAssistantStatus = 'thinking' | 'streaming' | 'completed' | 'stopped' | 'error';
export const HELP_ASSISTANT_STEPS = [
  'Изучаю описание проблемы',
  'Определяю, каких данных не хватает',
  'Ищу подходящие инструкции',
  'Подготавливаю ответ',
] as const;
export type HelpAssistantRun = {
  runId: string; eventId: number; ticketId: number; status: HelpAssistantStatus;
  step: number; completedSteps: number; startedAt: number; updatedAt: number;
  taskId?: string; taskStartSequence?: number; contextMessageCount?: number;
  stopReason?: 'user' | 'superseded';
  action?: { type: 'connect_onec'; baseKey?: string } | { type: 'request_it'; baseKey?: never };
  handoffReason?: 'no_knowledge' | 'source_unavailable' | 'user_requested' | 'model_handoff';
  scenario?: HelpAssistantScenario;
  activityVersion?: 1;
  activities?: HelpAssistantActivity[];
  phase?: string;
  draftText?: string;
  error?: string;
  retryAt?: number;
  suggestions?: string[];
  questions?: HelpAssistantQuestion[];
  metrics?: { startedAt: number; elapsedMs: number; firstAnalysisMs?: number; firstTokenMs?: number };
  generation?: { model: string; decision: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number; reasoningTokens?: number } | null };
};
export type HelpAssistantQuestion = {
  id: string; header: string; question: string;
  options: { label: string; description?: string }[]; multiSelect: boolean;
};
export type HelpAssistantActivity = {
  id: string; kind: 'analysis' | 'knowledge' | 'tool' | 'status'; label: string;
  status: 'running' | 'completed' | 'failed' | 'stopped'; text?: string;
  startedAt?: number; completedAt?: number;
};

export function helpAssistantPhaseLabel(run: HelpAssistantRun) {
  if (run.phase === 'retrying') return 'Восстанавливаю связь с ИИ';
  if (run.phase === 'queued') return 'Запрос принят';
  if (run.phase === 'knowledge') return 'Ищу инструкции';
  if (run.phase === 'connecting') return 'Подключаюсь к ИИ';
  if (run.phase === 'tool') return 'Проверяю данные в 1С';
  if (run.phase === 'validating') return 'Проверяю ответ';
  if (run.phase === 'answer' || run.status === 'streaming') return 'Подготавливаю ответ';
  return 'Анализирую задачу';
}
export type HelpAssistantPreview = {
  scenario: HelpAssistantScenario;
  setScenario: (scenario: HelpAssistantScenario) => void;
  stop: (ticketId: number, runId: string) => void;
  retry: (ticketId: number, runId: string) => void;
  replay: (ticketId: number) => void;
};

const ASSISTANT_AVATAR_COLORS = ['#2864AE', '#7952AD', '#247E75', '#916724', '#AA4D77', '#687D32'] as const;
/** A ticket keeps its color across screens, edits, retries and theme changes. */
export function helpAssistantAvatarColor(ticketId: number) {
  const seed = Number.isFinite(ticketId) ? Math.abs(Math.trunc(ticketId)) : 0;
  return ASSISTANT_AVATAR_COLORS[seed % ASSISTANT_AVATAR_COLORS.length];
}
export function helpHasAssistantAvatar(ticket: { aiEnabled: boolean; members: {role: string}[] }) {
  return ticket.aiEnabled && !ticket.members.some(member => member.role === 'IT');
}
