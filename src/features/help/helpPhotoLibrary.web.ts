import type { HelpLocalFile } from './components/HelpComposer';
import type { HelpLibraryPhoto, HelpPhotoPermission } from './helpPhotoLibrary';

export type { HelpLibraryPhoto, HelpPhotoPermission } from './helpPhotoLibrary';

// Browsers select files through ImagePicker in HelpComposer. Do not evaluate the
// native library entry: ExpoMediaLibraryNext has no web implementation.
export async function getHelpPhotoPermission(_request = false): Promise<HelpPhotoPermission> {
  return { granted: false, limited: false, canAskAgain: false };
}

export async function presentHelpPhotoPermissions(): Promise<void> {}

export async function loadHelpPhotoPage(_offset: number, _limit = 60): Promise<{ photos: HelpLibraryPhoto[]; hasMore: boolean }> {
  return { photos: [], hasMore: false };
}

export async function getHelpPhotoPreviewUri(photo: HelpLibraryPhoto): Promise<string | null> {
  return photo.uri;
}

export async function discardHelpPreparedPhoto(_file: Pick<HelpLocalFile, 'uri'>): Promise<void> {}

export async function prepareHelpPhoto(_photo: HelpLibraryPhoto): Promise<HelpLocalFile> {
  throw new Error('Выберите фотографию через окно выбора файлов.');
}
