// The day endpoint groups routes by Omsk time, independently of the phone timezone.
export const TRACKING_DAY_OFFSET_MINUTES = 360;

export function trackingDayKey(date: Date) {
  return new Date(date.getTime() + TRACKING_DAY_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function trackingCalendarDate(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}

export function trackingDayFromCalendar(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function trackingShiftDay(day: string, delta: number) {
  const date = trackingCalendarDate(day);
  date.setDate(date.getDate() + delta);
  return trackingDayFromCalendar(date);
}

export function trackingDayLabel(day: string, now = new Date()) {
  if (day === trackingDayKey(now)) return 'Сегодня';
  if (day === trackingDayKey(new Date(now.getTime() - 86_400_000))) return 'Вчера';
  return trackingCalendarDate(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function trackingTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Omsk' });
}
