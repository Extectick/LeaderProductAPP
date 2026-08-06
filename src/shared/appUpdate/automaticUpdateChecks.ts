const automaticCheckBlockers = new Set<string>();

export const AUTOMATIC_UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;

export function setAutomaticUpdateChecksPaused(owner: string, paused: boolean) {
  const normalizedOwner = owner.trim();
  if (!normalizedOwner) return;
  if (paused) {
    automaticCheckBlockers.add(normalizedOwner);
  } else {
    automaticCheckBlockers.delete(normalizedOwner);
  }
}

export function areAutomaticUpdateChecksPaused() {
  return automaticCheckBlockers.size > 0;
}
