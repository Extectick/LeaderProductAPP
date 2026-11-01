/** Web QA cannot enumerate a native phone library. Keep it outside the bundle. */
export type HelpLibraryPhoto = { id: string; uri: string; name: string; width: number; height: number; size?: number };
export type HelpPhotoPermission = { granted: boolean; limited: boolean; canAskAgain: boolean };
export async function getHelpPhotoPermission(): Promise<HelpPhotoPermission> { return { granted: false, limited: false, canAskAgain: false }; }
export async function presentHelpPhotoPermissions() {}
export async function loadHelpPhotoPage() { return { photos: [] as HelpLibraryPhoto[], hasMore: false }; }
export async function getHelpPhotoPreviewUri(photo: HelpLibraryPhoto) { return photo.uri; }
export async function discardHelpPreparedPhoto() {}
export async function prepareHelpPhoto(photo: HelpLibraryPhoto) { return { uri: photo.uri, name: photo.name, mimeType: 'image/jpeg', width: photo.width, height: photo.height, size: photo.size }; }
