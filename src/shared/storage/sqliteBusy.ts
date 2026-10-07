export function isSQLiteBusy(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\bSQLITE_(BUSY|LOCKED)\b|database (?:table |schema )?is locked/i.test(message);
}

/** Only repeat idempotent initialization or a fully rolled-back SQL transaction. */
export async function retrySQLiteBusy<T>(task: () => Promise<T>): Promise<T> {
  const delays = [150, 400];
  for (let attempt = 0; ; attempt += 1) {
    try { return await task(); } catch (error) {
      if (!isSQLiteBusy(error) || attempt >= delays.length) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
