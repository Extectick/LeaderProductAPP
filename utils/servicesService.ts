import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

export type ServiceAccessItem = {
  id: number;
  key: string;
  name: string;
  route: string | null;
  icon: string | null;
  description: string | null;
  gradientStart: string | null;
  gradientEnd: string | null;
  visible: boolean;
  enabled: boolean;
};

export type ServiceRoleRule = {
  id: number;
  roleId: number;
  visible: boolean | null;
  enabled: boolean | null;
};

export type ServiceDepartmentRule = {
  id: number;
  departmentId: number;
  visible: boolean | null;
  enabled: boolean | null;
};

export type ServiceAdminItem = {
  id: number;
  key: string;
  name: string;
  route: string | null;
  icon: string | null;
  description: string | null;
  gradientStart: string | null;
  gradientEnd: string | null;
  isActive: boolean;
  defaultVisible: boolean;
  defaultEnabled: boolean;
  roleAccess: ServiceRoleRule[];
  departmentAccess: ServiceDepartmentRule[];
};

export type ServiceTemplatePermission = {
  id: number;
  name: string;
  displayName: string;
  description: string;
};

export type ServiceAdminCreateResult = {
  service: ServiceAdminItem;
  permissionGroup: {
    id: number;
    key: string;
    displayName: string;
    description: string;
    isSystem: boolean;
    sortOrder: number;
    serviceId: number | null;
  } | null;
  createdPermissions: ServiceTemplatePermission[];
};

export async function getServicesForUser(): Promise<ServiceAccessItem[]> {
  const res = await apiClient<void, { services: ServiceAccessItem[] }>(API_ENDPOINTS.SERVICES.LIST);
  if (!res.ok) throw new Error(res.message);
  return res.data?.services || [];
}

export async function getAdminServices(): Promise<ServiceAdminItem[]> {
  const res = await apiClient<void, { services: ServiceAdminItem[] }>(API_ENDPOINTS.SERVICES.ADMIN);
  if (!res.ok) throw new Error(res.message);
  return res.data?.services || [];
}

export async function createAdminService(payload: {
  key: string;
  name: string;
  route?: string | null;
  icon?: string | null;
  description?: string | null;
  gradientStart?: string | null;
  gradientEnd?: string | null;
  isActive?: boolean;
  defaultVisible?: boolean;
  defaultEnabled?: boolean;
  generatePermissionTemplate?: boolean;
  permissionActions?: string[];
}) {
  const res = await apiClient<typeof payload, ServiceAdminCreateResult>(
    API_ENDPOINTS.SERVICES.ADMIN_CREATE,
    { method: 'POST', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data as ServiceAdminCreateResult;
}

export async function updateService(
  serviceId: number,
  payload: Partial<{
    name: string;
    route: string | null;
    icon: string | null;
    description: string | null;
    gradientStart: string | null;
    gradientEnd: string | null;
    isActive: boolean;
    defaultVisible: boolean;
    defaultEnabled: boolean;
  }>
) {
  const res = await apiClient<typeof payload, { service: ServiceAdminItem }>(
    API_ENDPOINTS.SERVICES.SERVICE_BY_ID(serviceId),
    { method: 'PATCH', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.service || null;
}

export async function upsertServiceRoleAccess(
  serviceId: number,
  payload: { roleId: number; visible?: boolean | null; enabled?: boolean | null }
) {
  const res = await apiClient<typeof payload, { rule: ServiceRoleRule }>(
    API_ENDPOINTS.SERVICES.ROLE_ACCESS(serviceId),
    { method: 'PUT', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.rule || null;
}

export async function deleteServiceRoleAccess(serviceId: number, roleId: number) {
  const res = await apiClient<void, { message: string }>(
    API_ENDPOINTS.SERVICES.ROLE_ACCESS_BY_ROLE(serviceId, roleId),
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function upsertServiceDepartmentAccess(
  serviceId: number,
  payload: { departmentId: number; visible?: boolean | null; enabled?: boolean | null }
) {
  const res = await apiClient<typeof payload, { rule: ServiceDepartmentRule }>(
    API_ENDPOINTS.SERVICES.DEPARTMENT_ACCESS(serviceId),
    { method: 'PUT', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.rule || null;
}

export async function deleteServiceDepartmentAccess(serviceId: number, departmentId: number) {
  const res = await apiClient<void, { message: string }>(
    API_ENDPOINTS.SERVICES.DEPARTMENT_ACCESS_BY_DEPARTMENT(serviceId, departmentId),
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}
