import type { ClientOrderProduct } from '@/utils/clientOrdersService';

export type CatalogManifest = {
  epoch: string;
  schemaVersion: number;
  revision: string;
  minAvailableRevision: string;
  productCount: number;
  lastSourceUpdateAt: string | null;
  lastFullReconcileAt: string | null;
  generatedAt: string;
};

export type CatalogProduct = Pick<
  ClientOrderProduct,
  'guid' | 'name' | 'code' | 'article' | 'sku' | 'isWeight' | 'baseUnit' | 'packages' | 'imageHash'
> & {
  isService?: boolean;
  isActive: boolean;
  group?: { guid: string; name: string } | null;
  revision: string;
  sourceUpdatedAt?: string | null;
};

export type CatalogSnapshotPage = {
  epoch: string;
  schemaVersion: number;
  snapshotRevision: string;
  items: CatalogProduct[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CatalogChange = {
  revision: string;
  productGuid: string;
  operation: 'UPSERT' | 'DELETE';
  item: CatalogProduct | null;
};

export type CatalogChangesPage = {
  epoch: string;
  schemaVersion: number;
  fromRevision: string;
  nextRevision: string;
  currentRevision: string;
  changes: CatalogChange[];
  hasMore: boolean;
};

export type CatalogSearchResult = {
  items: ClientOrderProduct[];
  total: number;
  hasMore: boolean;
};
