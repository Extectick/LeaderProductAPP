const mockEnqueue = jest.fn();
const mockGetAccessTokenForRequest = jest.fn();

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://192.168.1.96:3000',
}));
jest.mock('@/utils/tokenService', () => ({
  getAccessTokenForRequest: (...args: unknown[]) => mockGetAccessTokenForRequest(...args),
}));
jest.mock('react-native', () => ({
  NativeModules: { LeaderDownloads: { enqueue: (...args: unknown[]) => mockEnqueue(...args) } },
  PermissionsAndroid: {
    PERMISSIONS: { WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE' },
    RESULTS: { GRANTED: 'granted' },
    check: jest.fn().mockResolvedValue(true),
    request: jest.fn().mockResolvedValue('granted'),
  },
  Platform: { OS: 'android', Version: 35 },
}));

import { enqueueAuthenticatedAndroidDownload } from '../utils/androidFileDownload';

describe('Android system file download', () => {
  beforeEach(() => {
    mockEnqueue.mockReset();
    mockGetAccessTokenForRequest.mockReset();
  });

  it('queues an authenticated PDF in Android DownloadManager', async () => {
    mockGetAccessTokenForRequest.mockResolvedValue('access-token');
    mockEnqueue.mockResolvedValue({
      downloadId: '42',
      fileName: 'Счет.pdf',
      relativePath: 'Download/Счет.pdf',
    });

    await enqueueAuthenticatedAndroidDownload({
      path: '/api/client-orders/order-1/invoices/invoice-1/download',
      fileName: 'Счет.pdf',
      mimeType: 'application/pdf',
    });

    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://192.168.1.96:3000/api/client-orders/order-1/invoices/invoice-1/download',
      fileName: 'Счет.pdf',
      mimeType: 'application/pdf',
      headers: {
        Authorization: 'Bearer access-token',
        Accept: 'application/pdf',
      },
    }));
  });
});
