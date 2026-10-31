export type AdminTabKey = 'users' | 'departments' | 'roles' | 'services' | 'updates' | 'knowledge';

export type AdminTabItem = {
  key: AdminTabKey;
  label: string;
  icon: string;
};
