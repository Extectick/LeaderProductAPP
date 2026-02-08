export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    VERIFY: '/auth/verify',
    RESEND: '/auth/resend',
    TOKEN: '/auth/token',
    LOGOUT: '/auth/logout'
  },
  PASSWORD_RESET: {
    REQUEST: '/password-reset/request',
    VERIFY: '/password-reset/verify',
    CHANGE: '/password-reset/change',
  },
  USERS: {
    PROFILE: '/users/profile',
    CURRENT_PROFILE: '/users/me/current-profile',
    DEVICE_TOKENS: '/users/device-tokens',
    PRESENCE_PING: '/users/me/presence/ping',
    PRESENCE: (ids: number[]) => `/users/presence?ids=${ids.join(',')}`,
    PROFILE_AVATAR: (type: 'client' | 'supplier' | 'employee') =>
      `/users/me/profiles/${type}/avatar`,
    // ? функция, формирующая корректный путь /users/:userId/profile
    PROFILE_BY_ID: (userId: number) => `/users/${userId}/profile`,
    DEPARTMENTS: '/users/departments',
    DEPARTMENT_BY_ID: (id: number) => `/users/departments/${id}`,
    PROFILES: {
      CLIENT: '/users/profiles/client',
      SUPPLIER: '/users/profiles/supplier',
      EMPLOYEE: '/users/profiles/employee'
    },
    PERMISSIONS: '/users/permissions',
    ROLES: '/users/roles',
    ROLE_BY_ID: (roleId: number) => `/users/roles/${roleId}`,
    ROLE_PERMISSIONS: (roleId: number) => `/users/roles/${roleId}/permissions`,
    USER_ROLE: (userId: number) => `/users/${userId}/role`,
    USERS: (search?: string) => `/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    USER_ADMIN_UPDATE: (userId: number) => `/users/${userId}`,
    USER_PROFILE_UPDATE: (userId: number, type: 'client' | 'supplier' | 'employee') =>
      `/users/${userId}/profiles/${type}`,
    USER_ADMIN_PASSWORD: (userId: number) => `/users/${userId}/password`,
    DEPARTMENT_USERS: (departmentId: number) => `/users/departments/${departmentId}/users`,
  },
  QR: {
    CREATE: '/qr',
    GET_ALL: '/qr',
    GET_BY_ID: (id: string) => `/qr/${id}`,
    UPDATE: (id: string) => `/qr/${id}`,
    ANALYTICS: (id: string) => `/qr/${id}/analytics`,
    STATS: '/qr/stats'
  },
  TRACKING: {
    SAVE_POINTS: '/tracking/points',
    USER_ROUTES: (userId: number) => `/tracking/users/${userId}/routes`,
    ROUTE_POINTS: (routeId: number) => `/tracking/routes/${routeId}/points`,
    DAILY_STATS: '/tracking/stats/daily',
    ADMIN_USER_ROUTES_WITH_POINTS: (userId: number) =>
      `/tracking/admin/users/${userId}/routes-with-points`,
  },
  UPDATES: {
    CHECK: '/updates/check',
  },
  SERVICES: {
    LIST: '/services',
    ADMIN: '/services/admin',
    SERVICE_BY_ID: (serviceId: number) => `/services/${serviceId}`,
    ROLE_ACCESS: (serviceId: number) => `/services/${serviceId}/role-access`,
    ROLE_ACCESS_BY_ROLE: (serviceId: number, roleId: number) =>
      `/services/${serviceId}/role-access/${roleId}`,
    DEPARTMENT_ACCESS: (serviceId: number) => `/services/${serviceId}/department-access`,
    DEPARTMENT_ACCESS_BY_DEPARTMENT: (serviceId: number, departmentId: number) =>
      `/services/${serviceId}/department-access/${departmentId}`,
  },
};
