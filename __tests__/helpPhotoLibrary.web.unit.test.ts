jest.mock('expo-media-library', () => { throw new Error('Native media library must not load on web'); });
jest.mock('expo-file-system/legacy', () => { throw new Error('Native files must not load on web'); });
jest.mock('expo-image-manipulator', () => { throw new Error('Native image manipulation must not load on web'); });

import { discardHelpPreparedPhoto, getHelpPhotoPermission, getHelpPhotoPreviewUri, loadHelpPhotoPage, prepareHelpPhoto, presentHelpPhotoPermissions } from '../src/features/help/helpPhotoLibrary.web';

test('browser photo adapter loads without native modules and leaves selection to the file picker', async () => {
  expect(await getHelpPhotoPermission(true)).toEqual({ granted: false, limited: false, canAskAgain: false });
  expect(await loadHelpPhotoPage(0)).toEqual({ photos: [], hasMore: false });
  await presentHelpPhotoPermissions();
  const photo = { id: 'browser-file', uri: 'blob:photo', name: 'photo.jpg', width: 10, height: 10 };
  expect(await getHelpPhotoPreviewUri(photo)).toBe('blob:photo');
  await discardHelpPreparedPhoto(photo);
  await expect(prepareHelpPhoto(photo)).rejects.toThrow('окно выбора файлов');
});
