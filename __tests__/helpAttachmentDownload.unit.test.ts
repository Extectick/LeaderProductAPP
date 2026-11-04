import { Platform } from 'react-native';
jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(), useAudioPlayerStatus: jest.fn() }));
jest.mock('expo-image', () => ({ Image: 'CachedImage' }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file://cache/', downloadAsync: jest.fn(), deleteAsync: jest.fn(async () => {}) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../src/features/help/helpTheme', () => ({ useHelpTheme: () => ({}), useHelpReducedMotion: () => true }));
jest.mock('../src/features/help/HelpAudioPlayback', () => ({ useHelpAudioPlayback: jest.fn() }));
jest.mock('../src/features/help/components/HelpPrimitives', () => ({ HelpIcon: 'HelpIcon' }));
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { downloadHelpAttachment } from '../src/features/help/components/HelpMedia';
import type { HelpAttachment } from '../src/features/help/helpApi';

const file: HelpAttachment = { id: 'txt-32', kind: 'FILE', name: 'test.txt', size: 128, mimeType: 'text/plain', url: '/help/attachments/txt-32' };
const source = { uri: 'https://api.example.test/help/attachments/txt-32', headers: { Authorization: 'Bearer fixture-token' } };
const originalPlatform = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks(); Platform.OS = 'android';
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status: 200, uri: 'file://download.txt' } as any);
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
});
afterEach(() => { Platform.OS = originalPlatform; });

test('native download forwards authorised headers and retains the existing two-argument contract', async () => {
  await downloadHelpAttachment(file, async () => source);
  expect(FileSystem.downloadAsync).toHaveBeenCalledWith(source.uri, 'file://cache/help-txt-32-test.txt', { headers: source.headers });
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file://download.txt', { mimeType: 'text/plain', dialogTitle: 'Сохранить файл' });
});

test('a resolver settling after cancellation never starts a download', async () => {
  let finish!: (value: typeof source) => void;
  const controller = new AbortController();
  const pending = downloadHelpAttachment(file, () => new Promise(resolve => { finish = resolve; }), controller.signal);
  controller.abort(); finish(source);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test.each(['download', 'availability'])('cancellation during %s cannot open a delayed native share sheet', async phase => {
  const controller = new AbortController();
  if (phase === 'download') jest.mocked(FileSystem.downloadAsync).mockImplementation(async () => { controller.abort(); return { status: 200, uri: 'file://download.txt' } as any; });
  else jest.mocked(Sharing.isAvailableAsync).mockImplementation(async () => { controller.abort(); return true; });
  await expect(downloadHelpAttachment(file, async () => source, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/cache\/help-txt-32-\d+-test\.txt$/), { idempotent: true });
});

test('web download uses the same authorised source and passes cancellation to fetch', async () => {
  Platform.OS = 'web';
  const controller = new AbortController();
  jest.mocked(fetch).mockImplementationOnce(async (_url, options) => {
    expect(options).toMatchObject({ headers: source.headers, signal: controller.signal });
    controller.abort();
    return { ok: true, blob: jest.fn() } as any;
  });
  await expect(downloadHelpAttachment(file, async () => source, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledWith(source.uri, { headers: source.headers, signal: controller.signal });
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
});
