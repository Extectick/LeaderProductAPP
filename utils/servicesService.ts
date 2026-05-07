import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';

export type ServiceKind = 'LOCAL' | 'CLOUD';

export type ServiceAccessItem = {
  id: number;
  key: string;
  name: string;
  kind: ServiceKind;
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

export type ServiceDepartmentRoleRule = {
  id: number;
  departmentId: number;
  roleId: number;
  visible: boolean | null;
  enabled: boolean | null;
};

export type ServiceUserRule = {
  id: number;
  userId: number;
  visible: boolean | null;
  enabled: boolean | null;
};

export type ServiceAdminItem = {
  id: number;
  key: string;
  name: string;
  kind: ServiceKind;
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
  departmentRoleAccess: ServiceDepartmentRoleRule[];
  userAccess: ServiceUserRule[];
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

type PreviewLayerMatchBase = {
  id: number;
  visible: boolean | null;
  enabled: boolean | null;
};

type PreviewUserRuleMatch = PreviewLayerMatchBase & {
  userId: number;
  userName: string | null;
};

type PreviewRoleRuleMatch = PreviewLayerMatchBase & {
  roleId: number;
  roleName: string | null;
  roleDisplayName: string | null;
  distance: number;
};

type PreviewDepartmentRuleMatch = PreviewLayerMatchBase & {
  departmentId: number;
  departmentName: string | null;
};

type PreviewDepartmentRoleRuleMatch = PreviewLayerMatchBase & {
  departmentId: number;
  departmentName: string | null;
  roleId: number;
  roleName: string | null;
  roleDisplayName: string | null;
};

type PreviewLayerDecision<T> = {
  value: boolean;
  origin: 'default' | 'explicit';
  matchedRules: T[];
};

type PreviewResolvedFieldDecision = {
  value: boolean;
  source: 'default' | 'role' | 'department' | 'department_role' | 'user';
};

export type ServiceAccessPreviewExplanation = {
  service: {
    id: number;
    key: string;
    name: string;
    isActive: boolean;
    defaultVisible: boolean;
    defaultEnabled: boolean;
  };
  context: {
    userId: number;
    roleName: string | null;
    currentProfileType: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE' | null;
    activeDepartmentId: number | null;
    roleAssignments: Array<{
      roleId: number;
      roleName: string | null;
      distance: number;
      source: 'primary_role' | 'department_role';
      sourceDepartmentId: number | null;
    }>;
    departmentAssignments: Array<{
      departmentId: number;
      source: 'primary_department' | 'active_department' | 'department_role';
    }>;
    isEmployee: boolean;
    isAdmin: boolean;
  };
  access: {
    visible: boolean;
    enabled: boolean;
    isEmployee: boolean;
    isAdmin: boolean;
    reasonCodes: string[];
  };
  evaluation: {
    baseVisible: boolean;
    baseEnabled: boolean;
    finalVisible: PreviewResolvedFieldDecision;
    finalEnabled: PreviewResolvedFieldDecision;
    userVisible: PreviewLayerDecision<PreviewUserRuleMatch>;
    userEnabled: PreviewLayerDecision<PreviewUserRuleMatch>;
    departmentRoleVisible: PreviewLayerDecision<PreviewDepartmentRoleRuleMatch>;
    departmentRoleEnabled: PreviewLayerDecision<PreviewDepartmentRoleRuleMatch>;
    roleVisible: PreviewLayerDecision<PreviewRoleRuleMatch>;
    roleEnabled: PreviewLayerDecision<PreviewRoleRuleMatch>;
    departmentVisible: PreviewLayerDecision<PreviewDepartmentRuleMatch>;
    departmentEnabled: PreviewLayerDecision<PreviewDepartmentRuleMatch>;
  };
};

export type ServiceAccessMatrixItem = {
  user: {
    id: number;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    currentProfileType: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE' | null;
    role: {
      id: number;
      name: string;
      displayName: string | null;
    } | null;
    department: {
      id: number;
      name: string;
    } | null;
    activeDepartment: {
      id: number;
      name: string;
    } | null;
  };
  access: ServiceAccessPreviewExplanation['access'];
  evaluation: ServiceAccessPreviewExplanation['evaluation'];
};

export type ServiceAccessMatrixResult = {
  items: ServiceAccessMatrixItem[];
  meta?: {
    page?: number;
    count?: number;
    total?: number;
  };
};

export type DepartmentAccessCatalogItem = {
  id: number;
  key: string;
  name: string;
  kind: ServiceKind;
  route: string | null;
  icon: string | null;
  description: string | null;
  gradientStart: string | null;
  gradientEnd: string | null;
  isActive: boolean;
  defaultVisible: boolean;
  defaultEnabled: boolean;
  departmentRule: ServiceDepartmentRule | null;
  departmentRoleRule: ServiceDepartmentRoleRule | null;
};

export type DepartmentAccessCatalogResponse = {
  department: { id: number; name: string };
  role: { id: number; name: string; displayName: string | null } | null;
  services: DepartmentAccessCatalogItem[];
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
  kind?: ServiceKind;
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
    kind: ServiceKind;
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

export async function replaceServiceAccessRules(
  serviceId: number,
  payload: {
    roleAccess?: Array<{ roleId: number; visible?: boolean | null; enabled?: boolean | null }>;
    departmentAccess?: Array<{ departmentId: number; visible?: boolean | null; enabled?: boolean | null }>;
    departmentRoleAccess?: Array<{
      departmentId: number;
      roleId: number;
      visible?: boolean | null;
      enabled?: boolean | null;
    }>;
    userAccess?: Array<{ userId: number; visible?: boolean | null; enabled?: boolean | null }>;
  }
) {
  const res = await apiClient<typeof payload, { service: ServiceAdminItem }>(
    API_ENDPOINTS.SERVICES.ACCESS_RULES(serviceId),
    { method: 'PUT', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.service || null;
}

export async function getServiceAccessPreview(serviceId: number, userId: number) {
  const res = await apiClient<void, { explanation: ServiceAccessPreviewExplanation }>(
    API_ENDPOINTS.SERVICES.ACCESS_PREVIEW(serviceId, userId)
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.explanation || null;
}

export async function getServiceAccessMatrix(
  serviceId: number,
  query?: { page?: number; limit?: number; search?: string; roleId?: number | null; departmentId?: number | null }
) {
  const res = await apiClient<void, ServiceAccessMatrixResult>(
    API_ENDPOINTS.SERVICES.ACCESS_MATRIX(serviceId, query)
  );
  if (!res.ok) throw new Error(res.message);
  return {
    items: res.data?.items || [],
    meta: res.meta,
  };
}

export async function getDepartmentAccessCatalog(departmentId: number, roleId?: number | null) {
  const res = await apiClient<void, DepartmentAccessCatalogResponse>(
    API_ENDPOINTS.SERVICES.DEPARTMENT_ACCESS_CATALOG(departmentId, roleId)
  );
  if (!res.ok) throw new Error(res.message);
  return res.data as DepartmentAccessCatalogResponse;
}

export async function replaceDepartmentAccessCatalog(
  departmentId: number,
  payload: {
    roleId?: number | null;
    rules: Array<{ serviceId: number; visible?: boolean | null; enabled?: boolean | null }>;
  }
) {
  const res = await apiClient<typeof payload, DepartmentAccessCatalogResponse>(
    API_ENDPOINTS.SERVICES.DEPARTMENT_ACCESS_CATALOG(departmentId),
    { method: 'PUT', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data as DepartmentAccessCatalogResponse;
}

export async function upsertServiceUserAccess(
  serviceId: number,
  payload: { userId: number; visible?: boolean | null; enabled?: boolean | null }
) {
  const res = await apiClient<typeof payload, { rule: ServiceUserRule }>(
    API_ENDPOINTS.SERVICES.USER_ACCESS(serviceId),
    { method: 'PUT', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.rule || null;
}

export async function deleteServiceUserAccess(serviceId: number, userId: number) {
  const res = await apiClient<void, { message: string }>(
    API_ENDPOINTS.SERVICES.USER_ACCESS_BY_USER(serviceId, userId),
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function upsertServiceDepartmentRoleAccess(
  serviceId: number,
  payload: { departmentId: number; roleId: number; visible?: boolean | null; enabled?: boolean | null }
) {
  const res = await apiClient<typeof payload, { rule: ServiceDepartmentRoleRule }>(
    API_ENDPOINTS.SERVICES.DEPARTMENT_ROLE_ACCESS(serviceId),
    { method: 'PUT', body: payload }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data?.rule || null;
}

export async function deleteServiceDepartmentRoleAccess(
  serviceId: number,
  departmentId: number,
  roleId: number
) {
  const res = await apiClient<void, { message: string }>(
    API_ENDPOINTS.SERVICES.DEPARTMENT_ROLE_ACCESS_BY_TARGET(serviceId, departmentId, roleId),
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
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
