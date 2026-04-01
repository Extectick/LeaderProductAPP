import MobileStockBalancesScreen from '@/src/features/stockBalances/MobileStockBalancesScreen';
import { useStockBalances } from '@/src/features/stockBalances/useStockBalances';
import React from 'react';

export default function StockBalancesScreen() {
  const stock = useStockBalances({ compact: true });

  return (
    <MobileStockBalancesScreen
      roots={stock.tree?.roots || []}
      organizations={stock.meta?.organizations || []}
      hierarchy={stock.hierarchy}
      onChangeHierarchy={stock.setHierarchy}
      organizationGuid={stock.organizationGuid}
      onChangeOrganization={stock.setOrganizationGuid}
      search={stock.searchInput}
      onChangeSearch={stock.setSearchInput}
      loading={stock.loading}
      refreshing={stock.refreshing}
      error={stock.error}
      onRefresh={stock.refresh}
      onLoadMore={stock.loadMore}
      canLoadMore={stock.canLoadMore}
      lastStockSyncedAt={stock.meta?.lastStockSyncedAt || null}
      childrenByRootGuid={stock.childrenByRootGuid}
      leavesByGroupKey={stock.leavesByGroupKey}
      loadingNodeIds={stock.loadingNodeIds}
      onToggleRoot={stock.loadRootChildren}
      onLoadMoreRootChildren={stock.loadMoreRootChildren}
      onToggleGroup={stock.loadGroupLeaves}
      onLoadMoreGroupLeaves={stock.loadMoreGroupLeaves}
    />
  );
}
