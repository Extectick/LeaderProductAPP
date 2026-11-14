/** Main navigation; individual business services stay in the shared catalog. */
export type SidebarPath = '/services' | '/services/help' | '/profile' | '/admin';
export type SidebarScreenItem = {
  name: 'home' | 'help' | 'profile' | 'admin';
  sidebar: {icon: string; label: string; path: SidebarPath};
};
export const sidebarScreens: SidebarScreenItem[] = [
  {name:'home',sidebar:{icon:'apps-outline',label:'Главная',path:'/services'}},
  {name:'help',sidebar:{icon:'help-ai',label:'ИИ ассистент',path:'/services/help'}},
  {name:'profile',sidebar:{icon:'person-outline',label:'Профиль',path:'/profile'}},
  {name:'admin',sidebar:{icon:'shield-checkmark-outline',label:'Администрирование',path:'/admin'}},
];
