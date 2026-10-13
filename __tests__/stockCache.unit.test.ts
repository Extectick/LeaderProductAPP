import AsyncStorage from '@react-native-async-storage/async-storage';
import { writeStockCache, readStockCache, clearStockCache } from '../src/features/stockBalances/stockCache';
jest.mock('../utils/config', () => ({ API_BASE_URL: 'https://dev.invalid' }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map();
  return { getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { data.delete(key); }) };
});
const page = { items: [{ guid: 'p' }], offset: 0, nextOffset: 1, hasMore: false };
it('isolates users, preserves concurrent writes and bounds cache size', async () => {
  await Promise.all([writeStockCache('u1', 'a', page), writeStockCache('u1', 'b', page)]);
  expect(await readStockCache('u1', 'a')).toEqual(page);
  expect(await readStockCache('u1', 'b')).toEqual(page);
  expect(await readStockCache('u2', 'a')).toBeNull();
  for (let i = 0; i < 10; i++) await writeStockCache('u1', String(i), page);
  expect(await readStockCache('u1', 'a')).toBeNull();
  expect(await readStockCache('u1', '9')).toEqual(page);
  await writeStockCache('u1', 'large', { ...page, items: Array.from({ length: 400 }, (_, i) => ({ guid: String(i) })), nextOffset: 400 });
  expect(await readStockCache('u1', 'large')).toMatchObject({ nextOffset: 300, hasMore: true });
  expect((await readStockCache('u1', 'large'))?.items).toHaveLength(300);
  await clearStockCache('u1'); expect(await readStockCache('u1', 'large')).toBeNull();
});
it('tolerates corrupt or unavailable device storage', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('broken');
  expect(await readStockCache('u1', 'a')).toBeNull();
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
  await expect(writeStockCache('u1', 'a', page)).resolves.toBeUndefined();
});
