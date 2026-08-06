export type ClientOrdersAccessProfile = {
  employeeProfile?: {
    onecUserGuid?: string | null;
  } | null;
} | null | undefined;

export function isClientOrdersOnecUserLinked(profile: ClientOrdersAccessProfile): boolean {
  return Boolean(profile?.employeeProfile?.onecUserGuid?.trim());
}
