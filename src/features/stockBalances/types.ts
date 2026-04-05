export type StockHierarchy = 'warehouse-product' | 'product-warehouse';

export type StockOrganization = {
  id: string;
  guid: string;
  name: string;
  code: string | null;
  isActive?: boolean;
};

export type StockLeafRow = {
  id: string;
  product: {
    guid: string;
    name: string;
    code: string | null;
    article: string | null;
    sku: string | null;
    unit: {
      guid: string | null;
      name: string | null;
      symbol: string | null;
    } | null;
  };
  warehouse: {
    guid: string;
    name: string;
    code: string | null;
  };
  organization: {
    guid: string;
    name: string;
    code: string | null;
  } | null;
  series: {
    guid: string | null;
    number: string | null;
    productionDate: string | null;
    expiresAt: string | null;
  } | null;
  quantity: number;
  reserved: number;
  inStock: number;
  shipping: number;
  clientReserved: number;
  managerReserved: number;
  available: number;
  updatedAt: string;
};

export type StockSecondLevelGroup = {
  id: string;
  type: 'warehouse' | 'product';
  guid: string;
  name: string;
  code: string | null;
  quantity: number;
  reserved: number;
  inStock: number;
  shipping: number;
  clientReserved: number;
  managerReserved: number;
  available: number;
  leafCount?: number;
  leaves: StockLeafRow[];
};

export type StockRootGroup = {
  id: string;
  type: 'warehouse' | 'product';
  guid: string;
  name: string;
  code: string | null;
  quantity: number;
  reserved: number;
  inStock: number;
  shipping: number;
  clientReserved: number;
  managerReserved: number;
  available: number;
  childCount?: number;
  children: StockSecondLevelGroup[];
};

export type StockBalancesMeta = {
  organizations: StockOrganization[];
  hierarchies: StockHierarchy[];
  defaultHierarchy: StockHierarchy;
  lastStockSyncedAt: string | null;
};

export type StockBalancesTreeResponse = {
  hierarchy: StockHierarchy;
  offset: number;
  limit: number;
  totalRoots: number;
  totalLeaves: number;
  roots: StockRootGroup[];
};

export type StockChildrenPage = {
  level: 'root';
  rootGuid: string;
  offset: number;
  limit: number;
  totalChildren: number;
  hasMore: boolean;
  children: StockSecondLevelGroup[];
};

export type StockLeavesPage = {
  level: 'group';
  rootGuid: string;
  nodeGuid: string;
  offset: number;
  limit: number;
  totalLeaves: number;
  hasMore: boolean;
  leaves: StockLeafRow[];
};

export type StockBalancesChildrenResponse =
  | StockChildrenPage
  | StockLeavesPage;
