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
  scenario?: HelpAssistantScenario;
};
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
