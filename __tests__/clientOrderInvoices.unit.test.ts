jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('@/utils/clientOrdersService', () => ({
  downloadClientOrderInvoice: jest.fn(),
}));
jest.mock('@/utils/androidFileDownload', () => ({
  enqueueAuthenticatedAndroidDownload: jest.fn(),
}));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
  Platform: { OS: 'web' },
}));

import {
  getClientOrderInvoiceActionLabel,
  getClientOrderInvoiceIdentifier,
  getClientOrderInvoicePresentation,
  getDownloadableClientOrderInvoices,
  hasPendingClientOrderInvoice,
} from '../src/features/clientOrders/lib/clientOrderInvoices';

describe('client order invoice presentation', () => {
  it('prefers the stable app GUID over the live 1C document GUID', () => {
    expect(getClientOrderInvoiceIdentifier({
      guid: 'fd923674-867f-11f1-a4a6-d843ae930d20',
      appGuid: 'e1169e80-18d7-408d-b280-0c50ca474e42',
    })).toBe('e1169e80-18d7-408d-b280-0c50ca474e42');
  });

  it('shows an available manual invoice even when automatic delivery is disabled', () => {
    expect(getClientOrderInvoicePresentation({
      invoiceRequested: false,
      invoiceState: 'NOT_REQUESTED',
      invoiceDownloadAvailable: true,
      latestInvoiceVersion: 1,
      invoiceCount: 1,
      invoices: [{
        id: 'invoice-1',
        realizationGuid: 'realization-1',
        version: 1,
        state: 'AVAILABLE',
        downloadAvailable: true,
      }],
    })).toMatchObject({
      state: 'AVAILABLE',
      label: 'Счёт готов',
      version: 1,
      count: 1,
    });
  });

  it('shows a manual invoice request as pending in an order-list summary', () => {
    const order = {
      invoiceRequested: false,
      invoiceState: 'NOT_REQUESTED' as const,
      invoiceCount: 1,
      invoiceDownloadAvailable: false,
      invoices: [],
    };

    expect(getClientOrderInvoicePresentation(order)).toMatchObject({
      state: 'WAITING',
      pending: true,
      visible: true,
      listLabel: '\u0421\u0447\u0451\u0442',
    });
    expect(hasPendingClientOrderInvoice(order)).toBe(true);
  });

  it('uses yellow clock styling for every pending queue state', () => {
    expect(getClientOrderInvoicePresentation({
      invoiceRequested: false,
      invoiceState: 'QUEUED',
      invoiceCount: 1,
      invoiceDownloadAvailable: false,
      invoices: [{
        id: 'invoice-queued',
        realizationGuid: 'realization-queued',
        version: 1,
        state: 'QUEUED',
        downloadAvailable: false,
      }],
    })).toMatchObject({
      state: 'QUEUED',
      icon: 'clock-outline',
      color: '#D97706',
      listLabel: 'Счёт',
    });
  });

  it('keeps an optimistic manual request visible until the API queue appears', () => {
    const order = {
      invoiceRequested: false,
      invoiceState: 'WAITING' as const,
      invoiceCount: 0,
      invoiceDownloadAvailable: false,
      invoiceRequestPending: true,
      invoices: [],
    };

    expect(getClientOrderInvoicePresentation(order)).toMatchObject({
      state: 'WAITING',
      pending: true,
      visible: true,
    });
  });

  it('changes the list presentation to a ready invoice when the PDF appears', () => {
    expect(getClientOrderInvoicePresentation({
      invoiceRequested: false,
      invoiceState: 'NOT_REQUESTED',
      invoiceCount: 1,
      invoiceDownloadAvailable: true,
      latestInvoiceVersion: 4,
      invoices: [],
    })).toMatchObject({
      state: 'AVAILABLE',
      pending: false,
      visible: true,
      listLabel: '\u0421\u0447\u0451\u0442 v4',
    });
  });

  it('does not show the v1 suffix in the order list', () => {
    expect(getClientOrderInvoicePresentation({
      invoiceRequested: false,
      invoiceState: 'AVAILABLE',
      invoiceCount: 1,
      invoiceDownloadAvailable: true,
      latestInvoiceVersion: 1,
      invoices: [],
    })).toMatchObject({
      state: 'AVAILABLE',
      listLabel: 'Счёт',
    });
  });

  it('does not display a version suffix for v1 and adds it for later versions', () => {
    const base = {
      id: 'invoice-1',
      realizationGuid: 'realization-1',
      realizationNumber: 'НОУТ-H04002',
      state: 'AVAILABLE' as const,
      downloadAvailable: true,
    };
    expect(getClientOrderInvoiceActionLabel({ ...base, version: 1 })).toBe('Счёт НОУТ-H04002');
    expect(getClientOrderInvoiceActionLabel({ ...base, version: 3 })).toBe('Счёт НОУТ-H04002 · v3');
  });

  it('keeps only the latest downloadable version for each realization', () => {
    const invoices = getDownloadableClientOrderInvoices({
      invoices: [
        { id: 'invoice-v2', realizationGuid: 'realization-1', version: 2, state: 'SENT', downloadAvailable: true },
        { id: 'invoice-v4', realizationGuid: 'realization-1', version: 4, state: 'SENT', downloadAvailable: true },
        { id: 'invoice-other', realizationGuid: 'realization-2', version: 1, state: 'AVAILABLE', downloadAvailable: true },
      ],
    });

    expect(invoices.map((invoice) => invoice.id)).toEqual(['invoice-v4', 'invoice-other']);
  });
});
