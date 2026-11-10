import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Image, type ImageSource} from 'expo-image';
import {useAvatarSource} from '@/src/shared/avatar/useAvatarSource';
import type {Profile} from '@/src/entities/user/types';
import {AuthContext} from '@/context/AuthContext';

type Props = {
  identityKey: string | number;
  uri?: string | null;
  size?: number;
  radius?: number;
  initials?: string;
  accessibilityLabel?: string;
  backgroundColor?: string;
  color?: string;
};

/** The active profile is the only legacy fallback; never borrow another role's photo. */
export function resolveProfileAvatar(profile: Profile | null | undefined): string | null {
  if (!profile) return null;
  const active = profile.currentProfileType === 'CLIENT' ? profile.clientProfile
    : profile.currentProfileType === 'SUPPLIER' ? profile.supplierProfile : profile.currentProfileType === 'EMPLOYEE' ? profile.employeeProfile : null;
  if (profile.avatarAssetUrl !== undefined) return profile.avatarAssetUrl;
  if (active?.avatarAssetUrl !== undefined) return active.avatarAssetUrl;
  return profile.avatarUrl || active?.avatarUrl || null;
}

const sourceKey = (source: ImageSource | null) => source?.cacheKey || source?.uri || null;

/** Identity remount is deliberate: another account must never inherit a visible photo. */
export function UserAvatar(props: Props) {
  const auth = useContext(AuthContext), viewerId = auth?.isAuthenticated ? auth.profile?.id || 0 : 0;
  return <AvatarImage key={`${viewerId}:${props.identityKey}`} {...props}/>;
}

function AvatarImage({identityKey, uri, size, radius, initials = '?', accessibilityLabel = 'Фотография пользователя', backgroundColor = '#DBE7FF', color = '#2563EB'}: Props) {
  const identity = String(identityKey), requested = uri?.trim() || null;
  const {source, refresh} = useAvatarSource({uri: requested, identityKey});
  const [visible, setVisible] = useState<ImageSource | null>(source);
  const [decoded, setDecoded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const current = useRef(sourceKey(source)); current.current = requested ? sourceKey(source) : null;
  const currentRequest = useRef(requested); currentRequest.current = requested;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!requested) { setVisible(null); setFailed(null); } }, [requested]);
  const display = requested ? visible : null, displayKey = sourceKey(display);
  const pending = requested && sourceKey(source) !== displayKey && sourceKey(source) !== failed ? source : null;
  const sources = useMemo(() => [display, pending].filter((value): value is ImageSource => Boolean(value)), [display, pending]);
  const shape = size === undefined ? styles.fill : {width: size, height: size};
  return <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}
    style={[styles.container, shape, {borderRadius: radius ?? (size ? size / 2 : 0), backgroundColor}]}>
    {!display || decoded !== displayKey ? <Text style={{color, fontWeight: '700', fontSize: size ? Math.round(size * .36) : 15}}>{initials || '?'}</Text> : null}
    {sources.map(source => <Image key={`${sourceKey(source)}:${attempts[sourceKey(source) || ''] || 0}`} testID={sourceKey(source) === displayKey ? 'user-avatar-visible' : 'user-avatar-pending'}
      source={source} style={[styles.image, sourceKey(source) !== displayKey && styles.pending]}
      contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={`${identity}:${sourceKey(source)}`}
      onLoad={() => {
        if (!alive.current || current.current !== sourceKey(source)) return;
        setVisible(source); setDecoded(sourceKey(source)); setFailed(null);
      }}
      onError={() => {
        if (!alive.current) return;
        setVisible(previous => sourceKey(previous) === sourceKey(source) ? null : previous);
        if (current.current !== sourceKey(source)) return;
        const failedKey = sourceKey(source), failedRequest = requested; setFailed(failedKey);
        void refresh().then(ready => {
          if (!ready || !alive.current || currentRequest.current !== failedRequest || !failedKey) return;
          setFailed(null); setAttempts(value => ({...value, [failedKey]: (value[failedKey] || 0) + 1}));
        }).catch(() => {});
      }}/>) }
  </View>;
}

const styles = StyleSheet.create({
  container: {alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  fill: {width: '100%', height: '100%'},
  image: {...StyleSheet.absoluteFill},
  pending: {opacity: 0},
});
