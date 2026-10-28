const mockPlatform = { OS: 'android' };
jest.mock('react-native', () => ({ get Platform() { return mockPlatform; } }));
const mockQuery = { eq: jest.fn(), orderBy: jest.fn(), offset: jest.fn(), limit: jest.fn(), exeForMetadata: jest.fn() };
const mockAsset = { getMediaType: jest.fn(), getUri: jest.fn(), getIsInCloud: jest.fn() };
const mockConstructAsset = jest.fn(), mockConstructQuery = jest.fn();
const mockGetPermission = jest.fn(), mockRequestPermission = jest.fn(), mockPresentPermission = jest.fn();
jest.mock('expo-media-library', () => ({
  Asset: jest.fn((id: string) => { mockConstructAsset(id); return mockAsset; }), Query: jest.fn(() => { mockConstructQuery(); return mockQuery; }),
  AssetField: { MEDIA_TYPE: 'mediaType', CREATION_TIME: 'creationTime' }, MediaType: { IMAGE: 'image' },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermission(...args), requestPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args), presentPermissionsPicker: (...args: unknown[]) => mockPresentPermission(...args),
}));
const mockFiles = new Map<string, { exists: true; isDirectory: boolean; size: number }>();
const mockInfo = jest.fn(), mockCopy = jest.fn(), mockDelete = jest.fn(), mockDirectory = jest.fn();
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file://documents/', cacheDirectory: 'file://cache/', getInfoAsync: (...args: unknown[]) => mockInfo(...args), copyAsync: (...args: unknown[]) => mockCopy(...args), deleteAsync: (...args: unknown[]) => mockDelete(...args), makeDirectoryAsync: (...args: unknown[]) => mockDirectory(...args) }));
const mockSave = jest.fn(), mockReleaseImage = jest.fn(), mockReleaseContext = jest.fn(), mockRender = jest.fn(), mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) }, SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } }));
import { discardHelpPreparedPhoto, getHelpPhotoPermission, getHelpPhotoPreviewUri, loadHelpPhotoPage, prepareHelpPhoto, presentHelpPhotoPermissions, type HelpLibraryPhoto } from '../src/features/help/helpPhotoLibrary';

const photo: HelpLibraryPhoto = { id: 'content://media/external/images/media/7', uri: 'content://media/external/images/media/7', name: 'IMG_7.HEIC', width: 4000, height: 3000 };
const max = 20 * 1024 * 1024;
beforeEach(() => {
  jest.clearAllMocks(); mockPlatform.OS = 'android'; mockFiles.clear();
  mockFiles.set('file://original.HEIC', { exists: true, isDirectory: false, size: 2048 });
  mockFiles.set('file://cache/converted.jpg', { exists: true, isDirectory: false, size: 4096 });
  mockInfo.mockImplementation(async (uri: string) => mockFiles.get(uri) ?? { exists: false, isDirectory: false });
  mockCopy.mockImplementation(async ({ from, to }: { from: string; to: string }) => { mockFiles.set(to, { ...mockFiles.get(from)! }); });
  mockDelete.mockImplementation(async (uri: string) => { mockFiles.delete(uri); }); mockDirectory.mockResolvedValue(undefined);
  mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true, accessPrivileges: 'all' });
  mockRequestPermission.mockResolvedValue({ granted: true, canAskAgain: true, accessPrivileges: 'all' }); mockPresentPermission.mockResolvedValue(undefined);
  mockAsset.getMediaType.mockResolvedValue('image'); mockAsset.getUri.mockResolvedValue('file://original.HEIC'); mockAsset.getIsInCloud.mockResolvedValue(false);
  for (const key of ['eq', 'orderBy', 'offset', 'limit'] as const) mockQuery[key].mockReturnValue(mockQuery);
  mockQuery.exeForMetadata.mockResolvedValue([]);
  mockSave.mockResolvedValue({ uri: 'file://cache/converted.jpg', width: 3000, height: 4000 });
  mockRender.mockResolvedValue({ saveAsync: mockSave, release: mockReleaseImage });
  mockManipulate.mockReturnValue({ renderAsync: mockRender, release: mockReleaseContext });
});

test('module initialization and permission checks never ask for media automatically', async () => {
  expect(mockConstructQuery).not.toHaveBeenCalled(); expect(mockConstructAsset).not.toHaveBeenCalled(); expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(await getHelpPhotoPermission()).toEqual({ granted: true, limited: false, canAskAgain: true });
  expect(mockGetPermission).toHaveBeenCalledWith(false, ['photo']); expect(mockRequestPermission).not.toHaveBeenCalled();
});
test('permission requests and limited-scope updates ask only for photos', async () => {
  mockRequestPermission.mockResolvedValue({ granted: false, accessPrivileges: 'limited', canAskAgain: false });
  expect(await getHelpPhotoPermission(true)).toEqual({ granted: true, limited: true, canAskAgain: false });
  expect(mockRequestPermission).toHaveBeenCalledWith(false, ['photo']);
  mockGetPermission.mockResolvedValue({ granted: true, accessPrivileges: 'limited', canAskAgain: false }); await presentHelpPhotoPermissions();
  expect(mockPresentPermission).toHaveBeenCalledWith(['photo']);
});
test('photo paging requests lightweight metadata with newest-first order and one lookahead item', async () => {
  mockQuery.exeForMetadata.mockResolvedValue([1, 2, 3].map(id => ({ id: `content://${id}`, filename: `${id}.jpg`, mediaType: 'image', width: 1200, height: 900 })));
  expect(await loadHelpPhotoPage(20, 2)).toEqual({ photos: [1, 2].map(id => ({ id: `content://${id}`, uri: `content://${id}`, name: `${id}.jpg`, width: 1200, height: 900 })), hasMore: true });
  expect(mockQuery.eq).toHaveBeenCalledWith('mediaType', 'image'); expect(mockQuery.orderBy).toHaveBeenCalledWith({ key: 'creationTime', ascending: false });
  expect(mockQuery.offset).toHaveBeenCalledWith(20); expect(mockQuery.limit).toHaveBeenCalledWith(3);
  expect(mockConstructAsset).not.toHaveBeenCalled(); expect(mockManipulate).not.toHaveBeenCalled(); expect(mockCopy).not.toHaveBeenCalled();
});
test('metadata fallbacks stay lightweight and pagination inputs are bounded', async () => {
  mockQuery.exeForMetadata.mockResolvedValue([{ id: 'ph://local', filename: null, mediaType: 'image', width: null, height: -1 }, { id: 'video', mediaType: 'video' }]);
  expect(await loadHelpPhotoPage(-5, 1000)).toEqual({ photos: [{ id: 'ph://local', uri: 'ph://local', name: 'Фото', width: 0, height: 0 }], hasMore: false });
  expect(mockQuery.offset).toHaveBeenCalledWith(0); expect(mockQuery.limit).toHaveBeenCalledWith(101);
});
test('visible thumbnails do not resolve originals and iCloud-only photos remain placeholders', async () => {
  expect(await getHelpPhotoPreviewUri(photo)).toBe(photo.uri); expect(mockConstructAsset).not.toHaveBeenCalled();
  mockPlatform.OS = 'ios'; mockAsset.getIsInCloud.mockResolvedValue(true);
  expect(await getHelpPhotoPreviewUri({ ...photo, id: 'ph://cloud', uri: 'ph://cloud' })).toBeNull();
  mockAsset.getIsInCloud.mockResolvedValue(false); expect(await getHelpPhotoPreviewUri({ ...photo, id: 'ph://local', uri: 'ph://local' })).toBe('ph://local');
  expect(mockAsset.getUri).not.toHaveBeenCalled(); expect(mockCopy).not.toHaveBeenCalled();
});
test('selected HEIC is actually encoded as JPEG with normalized dimensions and a durable owned copy', async () => {
  const result = await prepareHelpPhoto(photo);
  expect(mockManipulate).toHaveBeenCalledWith('file://original.HEIC'); expect(mockRender).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: .92 });
  expect(result).toMatchObject({ name: 'IMG_7.jpg', mimeType: 'image/jpeg', width: 3000, height: 4000, size: 4096, assetId: photo.id });
  expect(result.uri).toMatch(/^file:\/\/documents\/help-drafts\/photo-[a-z0-9-]+\.jpg$/);
  expect(mockCopy).toHaveBeenCalledWith({ from: 'file://cache/converted.jpg', to: result.uri });
  expect(mockFiles.has(result.uri)).toBe(true); expect(mockFiles.has('file://original.HEIC')).toBe(true); expect(mockFiles.has('file://cache/converted.jpg')).toBe(false);
  expect(mockReleaseImage).toHaveBeenCalled(); expect(mockReleaseContext).toHaveBeenCalled();
});
test.each([['alpha.PNG', 'png', 'image/png'], ['shot.webp', 'webp', 'image/webp'], ['shot.jpeg', 'jpeg', 'image/jpeg']])('%s uses a matching real encoder', async (name, format, mimeType) => {
  const result = await prepareHelpPhoto({ ...photo, name }); expect(mockSave).toHaveBeenCalledWith({ format, compress: format === 'png' ? 1 : .92 }); expect(result.mimeType).toBe(mimeType);
});
test('camera captures use their local file without requesting a media library asset', async () => {
  const result = await prepareHelpPhoto({ ...photo, id: 'capture:1', uri: 'file://original.HEIC' });
  expect(result.assetId).toBe('capture:1'); expect(mockConstructAsset).not.toHaveBeenCalled();
});
test('known oversize and oversize original are rejected before decoding', async () => {
  await expect(prepareHelpPhoto({ ...photo, size: max + 1 })).rejects.toThrow('20 МБ'); expect(mockConstructAsset).not.toHaveBeenCalled();
  mockFiles.get('file://original.HEIC')!.size = max + 1;
  await expect(prepareHelpPhoto(photo)).rejects.toThrow('20 МБ'); expect(mockManipulate).not.toHaveBeenCalled(); expect(mockFiles.has('file://original.HEIC')).toBe(true);
});
test('oversize encoded output is rejected and only the generated temporary file is removed', async () => {
  mockFiles.get('file://cache/converted.jpg')!.size = max + 1;
  await expect(prepareHelpPhoto(photo)).rejects.toThrow('20 МБ'); expect(mockCopy).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledWith('file://cache/converted.jpg', { idempotent: true }); expect(mockFiles.has('file://original.HEIC')).toBe(true);
});
test('copy failures remove a partial owned draft, release decoder memory and leave the original untouched', async () => {
  mockCopy.mockImplementation(async ({ to }: { to: string }) => { mockFiles.set(to, { exists: true, isDirectory: false, size: 12 }); throw new Error('disk full'); });
  await expect(prepareHelpPhoto(photo)).rejects.toThrow('disk full');
  expect([...mockFiles.keys()]).toEqual(['file://original.HEIC']); expect(mockReleaseImage).toHaveBeenCalled(); expect(mockReleaseContext).toHaveBeenCalled();
});
test('discard never deletes a borrowed original, a directory, or a path traversal', async () => {
  const directory = 'file://documents/help-drafts/photo-dir.jpg'; mockFiles.set(directory, { exists: true, isDirectory: true, size: 1 });
  for (const uri of ['file://original.HEIC', photo.uri, 'file://documents/help-drafts/../private.txt', 'file://documents/help-drafts/photo-x/../../private.jpg', directory]) await discardHelpPreparedPhoto({ uri });
  expect(mockDelete).not.toHaveBeenCalled();
  const owned = 'file://documents/help-drafts/photo-abc-1.jpg'; mockFiles.set(owned, { exists: true, isDirectory: false, size: 10 });
  await discardHelpPreparedPhoto({ uri: owned }); expect(mockDelete).toHaveBeenCalledWith(owned, { idempotent: true });
});
test('non-photo assets and remote camera URLs cannot reach the decoder', async () => {
  mockAsset.getMediaType.mockResolvedValue('video'); await expect(prepareHelpPhoto(photo)).rejects.toThrow('только фотографии');
  await expect(prepareHelpPhoto({ ...photo, id: 'capture:2', uri: 'https://example.test/photo.jpg' })).rejects.toThrow('локальную');
  expect(mockManipulate).not.toHaveBeenCalled();
});
