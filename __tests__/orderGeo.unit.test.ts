jest.mock('expo-location', () => ({
  __esModule: true,
  getForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { captureOrderGeoEvent } from '../utils/orderGeo';

const mockLocation = jest.requireMock('expo-location') as {
  getForegroundPermissionsAsync: jest.Mock;
  hasServicesEnabledAsync: jest.Mock;
  getCurrentPositionAsync: jest.Mock;
  getLastKnownPositionAsync: jest.Mock;
};

describe('order geo capture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
    mockLocation.getLastKnownPositionAsync.mockResolvedValue(null);
  });

  it('captures a fresh point without blocking order data', async () => {
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      timestamp: Date.UTC(2026, 8, 4, 8, 0, 0),
      coords: { latitude: 54.99, longitude: 73.36, accuracy: 12 },
    });

    await expect(captureOrderGeoEvent('CREATED')).resolves.toMatchObject({
      type: 'CREATED',
      status: 'CAPTURED',
      latitude: 54.99,
      longitude: 73.36,
      accuracy: 12,
      source: 'fresh',
    });
  });

  it('uses a recent last-known point after a fresh-position failure', async () => {
    mockLocation.getCurrentPositionAsync.mockRejectedValue(new Error('gps timeout'));
    mockLocation.getLastKnownPositionAsync.mockResolvedValue({
      timestamp: Date.UTC(2026, 8, 4, 8, 1, 0),
      coords: { latitude: 55.01, longitude: 73.4, accuracy: 40 },
    });

    await expect(captureOrderGeoEvent('SUBMITTED')).resolves.toMatchObject({
      type: 'SUBMITTED',
      status: 'CAPTURED',
      source: 'last-known',
    });
    expect(mockLocation.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 120_000, requiredAccuracy: 250 });
  });

  it('records a reason instead of rejecting when permission is missing', async () => {
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(captureOrderGeoEvent('CREATED')).resolves.toMatchObject({
      type: 'CREATED',
      status: 'PERMISSION_DENIED',
      reason: 'LOCATION_PERMISSION_DENIED',
    });
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});
