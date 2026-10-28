import { Platform } from 'react-native';
import { Asset, AssetField, MediaType, Query, getPermissionsAsync, requestPermissionsAsync, presentPermissionsPicker } from 'expo-media-library';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import type { HelpLocalFile } from './components/HelpComposer';

export type HelpLibraryPhoto = { id: string; uri: string; name: string; width: number; height: number; size?: number };
export type HelpPhotoPermission = { granted: boolean; limited: boolean; canAskAgain: boolean };
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
let draftSequence = 0;
const validDimension = (value: number | null) => value != null && Number.isFinite(value) && value > 0 ? value : 0;

/** Called by the opened picker only. Checking never triggers a system prompt. */
export async function getHelpPhotoPermission(request = false): Promise<HelpPhotoPermission> {
  if (Platform.OS === 'web') return { granted: false, limited: false, canAskAgain: false };
  const permission = await (request ? requestPermissionsAsync : getPermissionsAsync)(false, ['photo']);
  const limited = permission.accessPrivileges === 'limited';
  return { granted: permission.granted || limited, limited, canAskAgain: permission.canAskAgain };
}

export async function presentHelpPhotoPermissions(): Promise<void> {
  if (Platform.OS === 'web') return;
  const permission = await getHelpPhotoPermission();
  if (permission.limited) await presentPermissionsPicker(['photo']);
}

/** No asset URI extraction, EXIF lookup, decoding or iCloud download on paging. */
export async function loadHelpPhotoPage(offset: number, limit = 60): Promise<{ photos: HelpLibraryPhoto[]; hasMore: boolean }> {
  if (Platform.OS === 'web') return { photos: [], hasMore: false };
  const first = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 60;
  const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false }).offset(first).limit(count + 1).exeForMetadata();
  return {
    photos: assets.slice(0, count).filter(asset => asset.mediaType === MediaType.IMAGE).map(asset => ({
      id: asset.id, uri: asset.id, name: asset.filename || 'Фото', width: validDimension(asset.width), height: validDimension(asset.height),
    })),
    hasMore: assets.length > count,
  };
}

/** Ask only for visible thumbnails; iCloud-only assets keep a placeholder. */
export async function getHelpPhotoPreviewUri(photo: HelpLibraryPhoto): Promise<string | null> {
  if (Platform.OS === 'ios' && !photo.id.startsWith('capture:')) {
    // Unlike getUri/getInfo this native query explicitly disables network access.
    if (await new Asset(photo.id).getIsInCloud()) return null;
  }
  return photo.uri;
}

function draftDirectory() {
  if (!FileSystem.documentDirectory) throw new Error('Не удалось открыть папку черновиков приложения.');
  return `${FileSystem.documentDirectory}help-drafts/`;
}
function checkSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new Error('Не удалось прочитать фотографию.');
  if (size > MAX_PHOTO_BYTES) throw new Error('Фотография превышает ограничение 20 МБ.');
}
function outputFormat(name: string) {
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension === 'png') return { format: SaveFormat.PNG, extension: 'png', mimeType: 'image/png' };
  if (extension === 'webp') return { format: SaveFormat.WEBP, extension: 'webp', mimeType: 'image/webp' };
  return { format: SaveFormat.JPEG, extension: 'jpg', mimeType: 'image/jpeg' };
}

/** Delete only files created by this adapter, never a library asset or a directory. */
export async function discardHelpPreparedPhoto(file: Pick<HelpLocalFile, 'uri'>): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const directory = draftDirectory();
  if (!file.uri.startsWith(directory) || !/^photo-[a-z0-9-]+\.(jpg|png|webp)$/.test(file.uri.slice(directory.length))) return;
  const info = await FileSystem.getInfoAsync(file.uri);
  if (info.exists && !info.isDirectory) await FileSystem.deleteAsync(file.uri, { idempotent: true });
}

/** Resolving originals and downloading a selected iCloud image happens only here. */
export async function prepareHelpPhoto(photo: HelpLibraryPhoto): Promise<HelpLocalFile> {
  if (Platform.OS === 'web') throw new Error('Выберите фотографию через окно выбора файлов.');
  if (photo.size !== undefined) checkSize(photo.size);
  if (!photo.id) throw new Error('Фотография недоступна. Выберите её ещё раз.');
  const directory = draftDirectory(), format = outputFormat(photo.name);
  let original = photo.uri;
  if (!photo.id.startsWith('capture:')) {
    const asset = new Asset(photo.id);
    if (await asset.getMediaType() !== MediaType.IMAGE) throw new Error('Можно выбрать только фотографии.');
    original = await asset.getUri();
  }
  if (!/^(file|content):\/\//.test(original)) throw new Error('Не удалось получить локальную фотографию.');
  const sourceInfo = await FileSystem.getInfoAsync(original);
  if (!sourceInfo.exists || sourceInfo.isDirectory) throw new Error('Фотография недоступна. Выберите её ещё раз.');
  checkSize(sourceInfo.size);
  const context = ImageManipulator.manipulate(original);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  let temporary: string | undefined, destination: string | undefined;
  try {
    // Native loaders decode EXIF orientation; iOS additionally applies its
    // ImageFixOrientationTransformer. Saving encodes upright pixels and returns
    // their actual dimensions, so no manual EXIF rotation is applied twice.
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: format.format, compress: format.format === SaveFormat.PNG ? 1 : .92 });
    temporary = result.uri;
    if (!validDimension(result.width) || !validDimension(result.height)) throw new Error('Не удалось определить размер фотографии.');
    const normalized = await FileSystem.getInfoAsync(temporary);
    if (!normalized.exists || normalized.isDirectory) throw new Error('Не удалось обработать фотографию.');
    checkSize(normalized.size);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    destination = `${directory}photo-${Date.now().toString(36)}-${(++draftSequence).toString(36)}.${format.extension}`;
    await FileSystem.copyAsync({ from: temporary, to: destination });
    const durable = await FileSystem.getInfoAsync(destination);
    if (!durable.exists || durable.isDirectory) throw new Error('Не удалось сохранить фотографию в черновик.');
    checkSize(durable.size);
    const baseName = photo.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'Фото';
    const prepared = { uri: destination, name: `${baseName}.${format.extension}`, mimeType: format.mimeType, width: result.width, height: result.height, size: durable.size, assetId: photo.id };
    return prepared;
  } catch (error) {
    if (destination) await discardHelpPreparedPhoto({ uri: destination }).catch(() => {});
    throw error;
  } finally {
    // saveAsync creates only a temporary app-cache file; never remove originals.
    if (temporary && temporary !== original && FileSystem.cacheDirectory && temporary.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
    rendered?.release(); context.release();
  }
}
