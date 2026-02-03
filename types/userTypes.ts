
export type ProfileStatus = "PENDING" | "ACTIVE" | "BLOCKED"

export type ProfileType = "CLIENT" | "SUPPLIER" | "EMPLOYEE"

export type Profile = {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    profileStatus: ProfileStatus;
    currentProfileType: ProfileType | null;
    role: {
        id: number;
        name: string;
    };
    departmentRoles: Array<{
        department: {
        id: number;
        name: string;
        };
        role: {
        id: number;
        name: string;
        };
    }>;
    clientProfile?: clientProfile | null;
    supplierProfile?: supplierProfile | null;
    employeeProfile?: employeeProfile | null;
}

// В userService.ts (или отдельном файле, например userCreateTypes.ts)

export type AddressDto = {
  street: string;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  country: string;
};

export type UserNameDto = {
  firstName: string;
  lastName?: string | null;
  middleName?: string | null;
};

export type CreateClientProfileDto = {
  user: UserNameDto;
  phone?: string | null;
  address?: AddressDto | null;
};

export type CreateSupplierProfileDto = {
  user: UserNameDto;
  phone?: string | null;
  address?: AddressDto | null;
};

export type CreateEmployeeProfileDto = {
  user: UserNameDto;
  phone?: string | null;
  departmentId: number;
};


export type DepartmentRole = {
    department: {
    id: number;
    name: string;
    };
    role: {
    id: number;
    name: string;
    };
}

export type clientProfile = {
    id: number;
    phone: string | null;
    status: ProfileStatus;
    address: {
    street: string;
    city: string;
    state: string | null;
    postalCode: string | null;
    country: string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
}
export type supplierProfile = {
    id: number;
    phone: string | null;
    status: ProfileStatus;
    address: {
    street: string;
    city: string;
    state: string | null;
    postalCode: string | null;
    country: string;
    } | null;
    createdAt: Date;
    updatedAt: Date;
}
export type employeeProfile = {
    id: number;
    phone: string | null;
    status: ProfileStatus;
    department: {
    id: number;
    name: string;
    } | null;
    departmentRoles: Array<{
    id: number;
    role: {
        id: number;
        name: string;
    };
    }>;
    createdAt: Date;
    updatedAt: Date;
}
