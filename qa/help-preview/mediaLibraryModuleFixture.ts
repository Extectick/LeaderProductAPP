/** Web-only package boundary; native media modules stay outside this bundle. */
const denied = { granted: false, status: 'denied', canAskAgain: false, expires: 'never', accessPrivileges: 'none' };
export const AssetField = { MEDIA_TYPE: 'mediaType', CREATION_TIME: 'creationTime', MODIFICATION_TIME: 'modificationTime' };
export const MediaType = { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio', photo: 'photo', video: 'video', audio: 'audio' };
export class Query {
  eq() { return this; }
  orderBy() { return this; }
  offset() { return this; }
  limit() { return this; }
  async exeForMetadata() { return []; }
}
export class Asset {
  constructor(public id: string) {}
  async getUri() { return this.id; }
  async getMediaType() { return MediaType.IMAGE; }
  async getIsInCloud() { return false; }
}
export class Album {}
export const getPermissionsAsync = async () => denied;
export const requestPermissionsAsync = async () => denied;
export const presentPermissionsPicker = async () => {};
export const presentPermissionsPickerAsync = async () => {};
export const addListener = () => ({ remove() {} });
export const removeAllListeners = () => {};
export const usePermissions = () => [denied, requestPermissionsAsync, getPermissionsAsync];
export default { Asset, Query, Album, getPermissionsAsync, requestPermissionsAsync, presentPermissionsPicker, addListener, removeAllListeners };
