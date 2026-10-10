import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
jest.mock('@/context/AuthContext', () => ({ AuthContext: require('react').createContext(null) }));
jest.mock('@/utils/userService', () => ({ getProfile: jest.fn() }));
import { AuthContext } from '../context/AuthContext';
import { getProfile } from '../utils/userService';
import { ProfileDataProvider, useProfileData } from '../src/features/profile/model/ProfileDataContext';
const request = getProfile as jest.Mock;
let renderer: TestRenderer.ReactTestRenderer;
function Consumer() { return React.createElement('ProfileData', useProfileData()); }
function mount(auth: any) { return React.createElement(AuthContext.Provider, { value: auth }, React.createElement(ProfileDataProvider, null, React.createElement(Consumer))); }
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.clearAllMocks(); });
test('cached own profile stays visible when offline and does not fetch again on re-render', async () => {
  request.mockRejectedValue(new Error('offline'));
  const auth = { profile: { id: 1, firstName: 'Анна' }, setProfile: jest.fn() };
  await act(async () => { renderer = TestRenderer.create(mount(auth)); });
  expect(renderer.root.findByType('ProfileData' as any).props.profile).toBe(auth.profile);
  expect(renderer.root.findByType('ProfileData' as any).props.error).toBeNull();
  await act(async () => renderer.update(mount({ ...auth })));
  expect(request).toHaveBeenCalledTimes(1);
  expect(auth.setProfile).not.toHaveBeenCalled();
});
test('late response from previous user cannot overwrite the new user profile', async () => {
  let resolve!: (value: unknown) => void;
  request.mockReturnValue(new Promise(r => { resolve = r; }));
  const oldAuth = { profile: { id: 1 }, setProfile: jest.fn() };
  const newAuth = { profile: { id: 2 }, setProfile: jest.fn() };
  await act(async () => { renderer = TestRenderer.create(mount(oldAuth)); });
  await act(async () => renderer.update(mount(newAuth)));
  await act(async () => resolve({ id: 1, firstName: 'Old user' }));
  expect(newAuth.setProfile).not.toHaveBeenCalled();
  expect(renderer.root.findByType('ProfileData' as any).props.profile.id).toBe(2);
});
