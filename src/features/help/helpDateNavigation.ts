export type HelpLocalDayBounds = { dateKey: string; from: string; to: string };

export type HelpDateJumpGeometry = {
  /** Target message coordinates relative to the current viewport, before replacing a window. */
  targetTop?: number;
  targetHeight?: number;
  viewportTop: number;
  viewportBottom: number;
};

/** Date navigation reveals the beginning of a day, without selecting an individual message. */
export function helpDateJumpMode({targetTop,targetHeight,viewportTop,viewportBottom}:HelpDateJumpGeometry):'visible'|'near'|'far' {
  const height=viewportBottom-viewportTop;
  if(targetTop===undefined || !Number.isFinite(targetTop) || !Number.isFinite(height) || height<=0)return 'far';
  const visiblePart=Math.min(32,Math.max(1,targetHeight??32));
  // A long message does not have to fit entirely: its readable beginning is enough.
  if(targetTop>=viewportTop-1 && targetTop+visiblePart<=viewportBottom)return 'visible';
  return Math.abs(targetTop-viewportTop)<=height?'near':'far';
}

/** Calendar constructors preserve the user's timezone, including 23/25-hour DST days. */
export function helpLocalDayBounds(value: string): HelpLocalDayBounds {
  let year: number, month: number, day: number;
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendar) {
    year = Number(calendar[1]); month = Number(calendar[2]) - 1; day = Number(calendar[3]);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error('Выберите корректную дату');
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime())) throw new Error('Выберите корректную дату');
    year = instant.getFullYear(); month = instant.getMonth(); day = instant.getDate();
  }
  if (year < 100 || year > 9999 || month < 0 || month > 11 || day < 1 || day > 31) throw new Error('Выберите корректную дату');
  const start = new Date(year, month, day), end = new Date(year, month, day + 1);
  if (start.getFullYear() !== year || start.getMonth() !== month || start.getDate() !== day || !Number.isFinite(end.getTime())) throw new Error('Выберите корректную дату');
  return { dateKey: `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`, from: start.toISOString(), to: end.toISOString() };
}
