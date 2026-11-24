export type Metric = 'inStock' | 'available';
export type Warehouse = string;

export interface Draft {
  time: string;
  timeZone: string;
  metric: Metric;
  warehouse: Warehouse;
}

export interface ReportRow {
  product: string;
  warehouse: string;
  quantity: number;
}

export interface Run {
  id: string;
  at: number;
  slot: number | null;
  status: 'alert' | 'clear' | 'error';
  rows: ReportRow[];
  unread?: boolean;
  error?: string;
  truncated?:boolean;
  errorCode?:string;
}

export interface Task extends Draft {
  id: string;
  active: boolean;
  runs: Run[];
}


export interface SavedTask extends Task {
  due: number;
  hasMoreRuns?: boolean;
}
export type Report = Run & {taskId:string};
export function warehouseLabel(warehouse:string) { return warehouse === 'all' ? 'Все склады' : warehouse; }

export const metricLabels: Record<Metric, string> = {
  inStock: 'В наличии',
  available: 'Доступно с учётом резервов',
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function clockIn(timeZone: string) {
  if (!timeZone) throw new Error('Укажите часовой пояс.');
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      });
    } catch {
      throw new Error('Проверьте часовой пояс, например Asia/Novosibirsk.');
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function validateDraft(draft: Draft): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
    throw new Error('Введите время от 00:00 до 23:59.');
  }
  clockIn(draft.timeZone);
  if (!Object.prototype.hasOwnProperty.call(metricLabels, draft.metric)) throw new Error('Выберите показатель остатка.');
  if (!draft.warehouse.trim() || draft.warehouse.length > 150) throw new Error('Укажите название склада.');
}

const minuteMs = 60000;
const dayMs = 24 * 60 * minuteMs;

// Represent the wall-clock fields on a UTC timeline to compare local dates and offsets.
function localStamp(format: Intl.DateTimeFormat, instant: number) {
  const parts = format.formatToParts(instant);
  function value(type: Intl.DateTimeFormatPartTypes) {
    return Number(parts.find(part => part.type === type)?.value);
  }
  return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'));
}

export function nextOccurrence(draft: Draft, after: number): number {
  validateDraft(draft);
  if (!Number.isFinite(after)) throw new Error('Проверьте дату запуска.');
  const format = clockIn(draft.timeZone);
  const today = Math.floor(localStamp(format, after) / dayMs) * dayMs;
  const [hours, minutes] = draft.time.split(':').map(Number);
  const desired = today + (hours * 60 + minutes) * minuteMs;

  // Skip a nonexistent local time and run only at the first occurrence of a repeated time.
  for (let day = 0; day < 4; day++) {
    const wall = desired + day * dayMs;
    const offsets = [-dayMs, 0, dayMs].map(shift => localStamp(format, wall + shift) - (wall + shift));
    const occurrences = offsets.map(offset => wall - offset).filter(instant => localStamp(format, instant) === wall);
    const first = Math.min(...occurrences);
    if (Number.isFinite(first) && first > after) return first;
  }
  throw new Error('Не удалось рассчитать ближайший запуск.');
}
