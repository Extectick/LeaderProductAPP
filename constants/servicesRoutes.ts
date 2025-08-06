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
  disable?: boolean;
}

export const services: Service[] = [
  {
    name: 'QR генератор и аналитика',
    icon: 'cube-outline',
    route: '/services/qrcodes',
    gradient: ['#e0e0e0', '#ffffff'],  // светлый градиент
  },
  {
    name: 'Обращения',
    icon: 'documents',
    route: '/warehouse' as any,
    gradient: ['#a8d5ba', '#4cad50'],  // мягкий зеленый градиент
    disable: true
  },
  {
    name: 'Задачи',
    icon: 'list-outline',
    route: '/tasks',
    gradient: ['#90caf9', '#2196f3'],  // нежно-синий градиент
    disable: true
  },
  {
    name: 'Отчёты',
    icon: 'stats-chart-outline',
    route: '/reports' as any,
    gradient: ['#ce93d8', '#9c27b0'],  // легкий фиолетовый градиент
    disable: true
  },
  {
    name: 'Клиенты',
    icon: 'people-outline',
    route: '/clients' as any,
    gradient: ['#ef9a9a', '#f44336'],  // нежно-красный градиент
    disable: true
  },
];
