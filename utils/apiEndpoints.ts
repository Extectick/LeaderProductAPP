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
    // ✅ функция, формирующая корректный путь /users/:userId/profile
    PROFILE_BY_ID: (userId: number) => `/users/${userId}/profile`,
    DEPARTMENTS: '/users/departments',
    PROFILES: {
      CLIENT: '/users/profiles/client',
      SUPPLIER: '/users/profiles/supplier',
      EMPLOYEE: '/users/profiles/employee'
    }
  },
  QR: {
    CREATE: '/qr',
    GET_ALL: '/qr',
    GET_BY_ID: (id: string) => `/qr/${id}`,
    UPDATE: (id: string) => `/qr/${id}`,
    ANALYTICS: (id: string) => `/qr/${id}/analytics`,
    STATS: '/qr/stats'
  }
};
