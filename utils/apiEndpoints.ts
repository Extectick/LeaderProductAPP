export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    VERIFY: '/auth/verify',
    TOKEN: '/auth/token',
    LOGOUT: '/auth/logout'
  },
  USERS: {
    PROFILE: '/users/profile',
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
};
