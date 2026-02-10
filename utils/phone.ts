export function normalizePhoneInputToDigits11(input: unknown): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return null;

  let normalized = digits;
  if (normalized.length === 10) normalized = `7${normalized}`;
  if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`;
  }

  if (normalized.length !== 11 || !normalized.startsWith('7')) {
    return null;
  }
  return normalized;
}

export function formatPhoneInputMask(input: unknown): string {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return '';

  let local = digits;
  if (local.startsWith('7') || local.startsWith('8')) {
    local = local.slice(1);
  }
  local = local.slice(0, 10);

  if (!local) return '';

  let out = '+7';
  out += ` (${local.slice(0, Math.min(3, local.length))}`;
  if (local.length >= 3) out += ')';
  if (local.length > 3) out += ` ${local.slice(3, Math.min(6, local.length))}`;
  if (local.length > 6) out += `-${local.slice(6, Math.min(8, local.length))}`;
  if (local.length > 8) out += `-${local.slice(8, 10)}`;
  return out;
}

export function toApiPhoneDigitsString(input: unknown): string | null {
  return normalizePhoneInputToDigits11(input);
}

export function formatPhoneDisplay(input: unknown): string {
  const digits = normalizePhoneInputToDigits11(input);
  if (!digits) return '';
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

export function isPhoneValid(input: unknown): boolean {
  return Boolean(normalizePhoneInputToDigits11(input));
}
