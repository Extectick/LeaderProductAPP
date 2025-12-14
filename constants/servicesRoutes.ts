export type Route =
  // | "/warehouse"
  | "/tasks"
  | "/profile"
  // | "/reports"
  | "/services/appeals"
  | "/services/qrcodes"
  | "/services/tracking"; // добавил сюда /qrcodes, так как он в services есть

export interface Service {
  name: string;
  icon: string;
  route: Route;
  gradient?: [string, string];
  description?: string;
  disable?: boolean;
}

export const services: Service[] = [
  {
    name: 'QR генератор и аналитика',
    icon: 'qr-code-outline',
    route: '/services/qrcodes',
    gradient: ['#5B21B6', '#7C3AED'], // более контрастный фиолетовый
    description: 'Создание QR-кодов, печать и аналитика по сканам.',
  },
  {
    name: 'Обращения',
    icon: 'documents',
    route: '/services/appeals' as any,
    gradient: ['#a8d5ba', '#4cad50'], // мягкий зеленый градиент
    description: 'Центр общения с клиентами и партнёрами.',
  },
  {
    name: 'Геомаршруты',
    icon: 'map-outline',
    route: '/services/tracking',
    gradient: ['#ffd89b', '#19547b'], // теплый + прохладный градиент
    description: 'Маршруты, точки и контроль передвижений.',
  },
  {
    name: 'Задачи',
    icon: 'list-outline',
    route: '/tasks',
    gradient: ['#90caf9', '#2196f3'], // нежно-синий градиент
    description: 'Постановка и контроль задач команды.',
    disable: true,
  },
  {
    name: 'Отчёты',
    icon: 'stats-chart-outline',
    route: '/reports' as any,
    gradient: ['#ce93d8', '#9c27b0'], // легкий фиолетовый градиент
    description: 'Визуальные отчёты и показатели (скоро).',
    disable: true,
  },
  {
    name: 'Клиенты',
    icon: 'people-outline',
    route: '/clients' as any,
    gradient: ['#ef9a9a', '#f44336'], // нежно-красный градиент
    description: 'Управление клиентской базой (скоро).',
    disable: true,
  },
];
