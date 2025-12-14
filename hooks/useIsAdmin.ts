import { useContext, useMemo } from 'react';

import { AuthContext } from '@/context/AuthContext';

// Делаем строгий список кодов прав/ролей для доступа к админке.
// Никаких "включает admin", только явные совпадения после нормализации.
const normalize = (val?: string | null) => (val || '').toLowerCase().replace(/[\s_-]+/g, '');
const ADMIN_ROLE_CODES = new Set(['admin', 'administrator', 'superadmin', 'sysadmin', 'админ', 'администратор']);
const ADMIN_PERMISSION_CODES = new Set([
  'admin',
  'adminpanel',
  'adminpanelaccess',
  'adminpanelfull',
  'adminpanel_access',
  'admin:full',
  'admin_panel_access',
]);

const extraCodesFromEnv = () => {
  const raw = process.env.EXPO_PUBLIC_ADMIN_PERMISSION || process.env.EXPO_PUBLIC_ADMIN_ROLE;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => normalize(s))
    .filter(Boolean);
};

export function useIsAdmin() {
  const auth = useContext(AuthContext);

  const isAdmin = useMemo(() => {
    const profile = auth?.profile;
    if (!profile) return false;

    const extra = extraCodesFromEnv();
    const roleCodes = new Set([...ADMIN_ROLE_CODES, ...extra]);
    const permCodes = new Set([...ADMIN_PERMISSION_CODES, ...extra]);

    const roleName = normalize(profile.role?.name);
    if (roleName && roleCodes.has(roleName)) return true;

    const deptHasAdmin =
      profile.departmentRoles?.some((dr) => {
        const name = normalize(dr.role?.name);
        return name && roleCodes.has(name);
      }) ?? false;
    if (deptHasAdmin) return true;

    const perms = (profile as any)?.permissions as string[] | undefined;
    const permAdmin =
      Array.isArray(perms) &&
      perms.some((p) => {
        const name = normalize(typeof p === 'string' ? p : (p as any)?.name);
        return name && permCodes.has(name);
      });

    return permAdmin;
  }, [auth?.profile]);

  const isCheckingAdmin = auth?.isLoading ?? false;

  return { isAdmin, isCheckingAdmin };
}
