jest.mock('@/context/AuthContext', () => ({AuthContext:require('react').createContext(null)}));
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import type {ImageSource} from 'expo-image';
let mockLoading = false;
let mockViewer = 1;
let mockSource: ImageSource | null | undefined;
const mockRefresh = jest.fn(async()=>false);
jest.mock('expo-image', () => ({Image: 'AvatarImage'}));
jest.mock('@/src/shared/avatar/useAvatarSource', () => ({useAvatarSource: ({uri}: {uri:string|null}) => ({source:mockSource === undefined ? uri ? {uri,cacheKey:uri} : null : mockSource, loading:mockLoading, refresh:mockRefresh})}));
import {AuthContext} from '../context/AuthContext';
import {UserAvatar, resolveProfileAvatar} from '../components/Profile/UserAvatar';
let screen: TestRenderer.ReactTestRenderer;
const props = {identityKey:1, uri:'/users/1/avatars/EMPLOYEE/v1', size:76, initials:'АИ'};
const images = () => screen.root.findAllByType('AvatarImage' as any);
const tree=(next=props)=>React.createElement(AuthContext.Provider,{value:{isAuthenticated:true,profile:{id:mockViewer}} as any},React.createElement(UserAvatar,next));
async function render(next=props) {await act(async()=>{screen=TestRenderer.create(tree(next));});}
async function update(next=props) {await act(async()=>{screen.update(tree(next));});}
beforeEach(()=>{mockViewer=1;mockSource=undefined;mockLoading=false;mockRefresh.mockReset().mockResolvedValue(false);});
afterEach(async()=>{if(screen)await act(async()=>screen.unmount());});
test('uses persistent image caching without fades, timestamp keys or load-end success',async()=>{
 await render();const first=images()[0];
 expect(first.props.cachePolicy).toBe('memory-disk');expect(first.props.transition).toBe(0);
 expect(first.props.source.uri).toBe(props.uri);expect(first.props.onLoadEnd).toBeUndefined();
 await act(async()=>first.props.onLoad());await update();expect(images()).toHaveLength(1);
 expect(images()[0].props.source).toBe(first.props.source);
});
test('keeps old same-user image until the new one is decoded, preserving the pending image instance',async()=>{
 await render();await act(async()=>images()[0].props.onLoad());
 await update({...props,uri:'/users/1/avatars/EMPLOYEE/v2'});
 expect(images()).toHaveLength(2);expect(images()[0].props.source.uri).toBe(props.uri);
 const pending=images()[1];expect(pending.props.style[1]).toEqual({opacity:0});
 await act(async()=>pending.props.onLoad());expect(images()).toHaveLength(1);
 expect(images()[0]).toBe(pending);expect(images()[0].props.source.uri).toContain('v2');
});
test('failed refresh retains the existing photo and does not loop retries on rerender',async()=>{
 await render();await act(async()=>images()[0].props.onLoad());await update({...props,uri:'/users/1/avatars/EMPLOYEE/v2'});
 await act(async()=>images()[1].props.onError());expect(images()).toHaveLength(1);
 expect(images()[0].props.source.uri).toBe(props.uri);expect(mockRefresh).toHaveBeenCalledTimes(1);
 await update({...props,uri:'/users/1/avatars/EMPLOYEE/v2'});expect(images()).toHaveLength(1);
 expect(mockRefresh).toHaveBeenCalledTimes(1);
});
test('a repaired corrupt source is mounted again only after the async refresh completes',async()=>{
 let finish!:(value:boolean)=>void;mockRefresh.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await render();await act(async()=>images()[0].props.onError());expect(images()).toHaveLength(0);
 await act(async()=>finish(true));expect(images()).toHaveLength(1);
 await act(async()=>images()[0].props.onLoad());expect(images()[0].props.testID).toBe('user-avatar-visible');
});
test('account change and removal immediately discard the previous image and late callbacks',async()=>{
 await render();const oldLoad=images()[0].props.onLoad;await act(async()=>oldLoad());
 await update({...props,identityKey:2,uri:'/users/2/avatars/EMPLOYEE/v1'});
 expect(images()).toHaveLength(1);expect(images()[0].props.source.uri).toContain('/2/');
 await act(async()=>oldLoad());expect(images()[0].props.source.uri).toContain('/2/');
 await update({...props,identityKey:2,uri:null as unknown as string});expect(images()).toHaveLength(0);
});
test('later revisions win over old pending completions and loading keeps same-user visible bytes',async()=>{
 await render();await act(async()=>images()[0].props.onLoad());
 await update({...props,uri:'v2'});const outdatedLoad=images()[1].props.onLoad;
 mockSource=null;mockLoading=true;await update({...props,uri:'v3'});expect(images()[0].props.source.uri).toBe(props.uri);
 mockSource=undefined;mockLoading=false;await update({...props,uri:'v3'});
 await act(async()=>outdatedLoad());expect(images()[0].props.source.uri).toBe(props.uri);
 await act(async()=>images()[1].props.onLoad());expect(images()[0].props.source.uri).toBe('v3');
});
test('canonical deletion wins over stale legacy URLs; legacy fallback is limited to active role',()=>{
 const profile={avatarUrl:'legacy',avatarAssetUrl:null,currentProfileType:'CLIENT',clientProfile:{avatarUrl:'old-client'},employeeProfile:{avatarUrl:'old-employee'}};
 expect(resolveProfileAvatar(profile as any)).toBeNull();
 expect(resolveProfileAvatar({...profile,avatarAssetUrl:undefined,avatarUrl:null} as any)).toBe('old-client');
 expect(resolveProfileAvatar({...profile,avatarAssetUrl:undefined,avatarUrl:null,clientProfile:{}} as any)).toBeNull();
 expect(resolveProfileAvatar({...profile,avatarAssetUrl:'/users/1/avatars/USER/v2'} as any)).toContain('/USER/v2');
});

test('viewer/account changes remount the same viewed profile without retaining former viewer bytes',async()=>{
 await render();await act(async()=>images()[0].props.onLoad());const oldLoad=images()[0].props.onLoad;
 mockViewer=2;mockSource=null;await update();expect(images()).toHaveLength(0);
 await act(async()=>oldLoad());expect(images()).toHaveLength(0);
});

test('a late error from the replaced image cannot clear the successfully decoded current revision',async()=>{
 await render();await act(async()=>images()[0].props.onLoad());const oldError=images()[0].props.onError;
 await update({...props,uri:'v2'});await act(async()=>images()[1].props.onLoad());
 await act(async()=>oldError());expect(images()).toHaveLength(1);expect(images()[0].props.source.uri).toBe('v2');
});

test('repairing a failed new revision does not remount the old visible image',async()=>{
 await render();await act(async()=>images()[0].props.onLoad());const old=images()[0];
 await update({...props,uri:'v2'});mockRefresh.mockResolvedValueOnce(true);
 await act(async()=>images()[1].props.onError());expect(images()[0]).toBe(old);
 expect(images()[0].props.source.uri).toBe(props.uri);expect(images()).toHaveLength(2);
 await act(async()=>images()[1].props.onLoad());expect(images()[0].props.source.uri).toBe('v2');
});
