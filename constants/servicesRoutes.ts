export type Route = 
  // | "/warehouse"
  | "/tasks"
  | "/profile"
  // | "/reports"
  // | "/clients"
  | "/services/qrcodes";  // добавил сюда /qrcodes, так как он в services есть

export interface Service {
  name: string;
  icon: string;
  route: Route;
  gradient?: [string, string];
}

export const services: Service[] = [
  {
    name: 'QR генератор',
    icon: 'cube-outline',
    route: '/services/qrcodes',
    gradient: ['#e0e0e0', '#ffffff'],  // светлый градиент
  },
  // {
  //   name: 'Склад',
  //   icon: 'cube-outline',
  //   route: '/warehouse',
  //   gradient: ['#a8d5ba', '#4caf50'],  // мягкий зеленый градиент
  // },
  {
    name: 'Задачи',
    icon: 'list-outline',
    route: '/tasks',
    gradient: ['#90caf9', '#2196f3'],  // нежно-синий градиент
  },
  {
    name: 'Профиль',
    icon: 'person-outline',
    route: '/profile',
    gradient: ['#ffcc80', '#ff9800'],  // мягкий оранжевый градиент
  },
  // {
  //   name: 'Отчёты',
  //   icon: 'stats-chart-outline',
  //   route: '/reports',
  //   gradient: ['#ce93d8', '#9c27b0'],  // легкий фиолетовый градиент
  // },
  // {
  //   name: 'Клиенты',
  //   icon: 'people-outline',
  //   route: '/clients',
  //   gradient: ['#ef9a9a', '#f44336'],  // нежно-красный градиент
  // },
];
