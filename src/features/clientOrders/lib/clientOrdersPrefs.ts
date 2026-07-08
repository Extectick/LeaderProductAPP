export function resolveStoredBooleanDefaultTrue(value: string | null | undefined) {
  if (value === '0') return false;
  return true;
}

export function serializeStoredBoolean(value: boolean) {
  return value ? '1' : '0';
}
