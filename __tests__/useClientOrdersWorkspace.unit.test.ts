import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/context/AuthContext', () => {
  const React = require('react');
  return { AuthContext: React.createContext(null) };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
}));

jest.mock('@/utils/clientOrdersService', () => ({
  cancelClientOrder: jest.fn(),
  copyClientOrder: jest.fn(),
  createClientOrder: jest.fn(),
  deleteClientOrder: jest.fn(),
  getClientOrderDefaults: jest.fn(),
  getClientOrder: jest.fn(),
  getClientOrderProductsBatch: jest.fn(),
  getClientOrderSettings: jest.fn(),
  getClientOrders: jest.fn(),
  searchClientOrderAgreements: jest.fn(),
  searchClientOrderContracts: jest.fn(),
  searchClientOrderCounterparties: jest.fn(),
  searchClientOrderDeliveryAddresses: jest.fn(),
  searchClientOrderPriceTypes: jest.fn(),
  searchClientOrderProducts: jest.fn(),
  searchClientOrderWarehouses: jest.fn(),
  submitClientOrder: jest.fn(),
  restoreClientOrder: jest.fn(),
  unqueueClientOrder: jest.fn(),
  updateClientOrder: jest.fn(),
  updateClientOrderSettings: jest.fn(),
}));

import { AuthContext } from '@/context/AuthContext';
import { useClientOrdersWorkspace } from '../src/features/clientOrders/useClientOrdersWorkspace';
import {
  getClientOrder,
  getClientOrderSettings,
  getClientOrders,
} from '@/utils/clientOrdersService';

const settings = {
  organizations: [{ guid: 'org-guid', name: 'Организация', isActive: true }],
  preferredOrganization: { guid: 'org-guid', name: 'Организация', isActive: true },
  deliveryDateMode: 'NEXT_DAY',
  deliveryDateOffsetDays: 1,
  fixedDeliveryDate: null,
  resolvedDeliveryDate: '2026-06-29T00:00:00.000Z',
  deliveryDateIssue: null,
  deliveryDateIssueMessage: null,
  currency: 'RUB',
};

function queuedOrder(queuePosition: number, patch: Record<string, unknown> = {}) {
  return {
    guid: 'order-guid',
    source: 'MANAGER_APP',
    origin: 'local',
    revision: 1,
    status: 'QUEUED',
    syncState: 'QUEUED',
    queuePosition,
    createdAt: '2026-06-28T05:00:00.000Z',
    updatedAt: '2026-06-28T05:00:00.000Z',
    organization: { guid: 'org-guid', name: 'Организация' },
    counterparty: { guid: 'counterparty-guid', name: 'Контрагент' },
    items: [],
    events: [],
    ...patch,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useClientOrdersWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.mocked(getClientOrderSettings).mockResolvedValue(settings as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes queued order metadata without reloading selected document detail', async () => {
    jest.mocked(getClientOrders)
      .mockResolvedValueOnce({
        items: [queuedOrder(1)],
        meta: { total: 1, limit: 20, offset: 0, statusCounts: { QUEUED: 1 }, liveSource: { status: 'ok' } },
      } as any)
      .mockResolvedValueOnce({
        items: [queuedOrder(2, { updatedAt: '2026-06-28T05:01:00.000Z' })],
        meta: { total: 1, limit: 20, offset: 0, statusCounts: { QUEUED: 1 }, liveSource: { status: 'ok' } },
      } as any);
    jest.mocked(getClientOrder).mockResolvedValue(queuedOrder(1, {
      items: [
        {
          product: { guid: 'product-guid', name: 'Товар' },
          quantity: 1,
          basePrice: 100,
        },
      ],
    }) as any);

    let workspace: ReturnType<typeof useClientOrdersWorkspace>;
    function Harness() {
      workspace = useClientOrdersWorkspace();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              isLoading: false,
              isAuthenticated: true,
              profile: { id: 1 } as any,
              setAuthenticated: jest.fn(),
              setProfile: jest.fn(),
              signOut: jest.fn(),
            },
          },
          React.createElement(Harness)
        )
      );
    });

    await flush();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await flush();

    await act(async () => {
      await workspace!.selectOrder('order-guid');
    });

    expect(getClientOrder).toHaveBeenCalledTimes(1);
    expect(workspace!.selectedOrder?.queuePosition).toBe(1);
    expect(workspace!.draft.items).toHaveLength(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
    await flush();

    expect(getClientOrders).toHaveBeenCalledTimes(2);
    expect(getClientOrder).toHaveBeenCalledTimes(1);
    expect(workspace!.selectedOrder?.queuePosition).toBe(2);
    expect(workspace!.draft.items).toHaveLength(1);
    expect(workspace!.loadingDetail).toBe(false);

    await act(async () => {
      renderer!.unmount();
    });
  });
});
