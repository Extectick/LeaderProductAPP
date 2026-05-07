export type AdminTabKey = 'users' | 'departments' | 'roles' | 'services' | 'updates';

export type AdminTabItem = {
  key: AdminTabKey;
  label: string;
  icon: string;
};
