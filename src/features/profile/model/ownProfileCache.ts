import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@/src/entities/user/types';

export type OwnProfileFence = { session: number; revision: number };
const FRESH_MS = 30_000;
let session = 0, revision = 0, freshUntil = 0;
let snapshot: Profile | null = null;
let pending: { fence: OwnProfileFence; promise: Promise<Profile | null> } | null = null;
let writes: Promise<void> = Promise.resolve();
const provenance = new WeakMap<object, OwnProfileFence>();
export const ownProfileFence = (): OwnProfileFence => ({ session, revision });
export const ownProfileFenceMatches = (fence: OwnProfileFence) => fence.session === session && fence.revision === revision;
export const ownProfileSessionMatches = (fence: OwnProfileFence) => fence.session === session;
export const currentOwnProfile = () => snapshot;

/** Login/logout boundaries also invalidate late responses for the same account. */
export function resetOwnProfileSession() {
  session++; revision++; snapshot = null; freshUntil = 0; pending = null;
}
export function beginOwnProfileMutation(): OwnProfileFence {
  revision++; pending = null; freshUntil = 0;
  return ownProfileFence();
}
export function isCurrentOwnProfile(value: Profile) {
  const stamp = provenance.get(value);
  return !stamp || ownProfileFenceMatches(stamp);
}
/** Preserve metadata, including explicit null avatar removal; never merge old URLs. */
export function acceptOwnProfile(value: Profile, fresh = false): boolean {
  if (!isCurrentOwnProfile(value)) return false;
  if (snapshot !== value) { revision++; pending = null; }
  snapshot = value;
  provenance.set(value, ownProfileFence());
  if (fresh) freshUntil = Date.now() + FRESH_MS;
  return true;
}
/** Serialize storage writes; a superseded write that has not started is skipped. */
export async function persistOwnProfile(value: Profile | null): Promise<void> {
  const fence = ownProfileFence();
  const operation = writes.catch(() => {}).then(async () => {
    if (!ownProfileFenceMatches(fence)) return;
    if (value) await AsyncStorage.setItem('profile', JSON.stringify(value));
    else await AsyncStorage.removeItem('profile');
  });
  writes = operation.catch(() => {});
  await operation;
}
export async function commitOwnProfileMutation(value: Profile | null, fence: OwnProfileFence): Promise<Profile | null> {
  if (!ownProfileSessionMatches(fence)) return null;
  if (!value) return null;
  // A successful server mutation supersedes any read started before it finished.
  if (!acceptOwnProfile(value, true)) return snapshot;
  await persistOwnProfile(value).catch(() => {});
  return ownProfileSessionMatches(fence) ? snapshot : null;
}
export async function readOwnProfile(fetcher: () => Promise<Profile | null>, force = false): Promise<Profile | null> {
  if (!force && snapshot && Date.now() < freshUntil) return snapshot;
  if (pending && ownProfileFenceMatches(pending.fence)) return pending.promise;
  const fence = ownProfileFence();
  const promise = (async () => {
    const value = await fetcher();
    if (!ownProfileSessionMatches(fence)) return null;
    if (!ownProfileFenceMatches(fence)) return snapshot;
    if (!value) return null;
    acceptOwnProfile(value, true);
    const accepted = ownProfileFence();
    await persistOwnProfile(value).catch(() => {});
    if (!ownProfileSessionMatches(accepted)) return null;
    return ownProfileFenceMatches(accepted) ? value : snapshot;
  })();
  pending = { fence, promise };
  try { return await promise; }
  finally { if (pending?.promise === promise) pending = null; }
}
