import { useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppHeaderPageTopOffset } from './HeaderTopOffset';

type HeaderInsetOptions = {
  compact?: boolean;
  hasSubtitle?: boolean;
  extraGap?: number;
};

export function useHeaderContentTopInset(options?: HeaderInsetOptions) {
  const { top } = useSafeAreaInsets();
  const compact = options?.compact;
  const hasSubtitle = options?.hasSubtitle;
  const extraGap = options?.extraGap;

  return useMemo(
    () => getAppHeaderPageTopOffset(top, { compact, hasSubtitle, extraGap }),
    [compact, extraGap, hasSubtitle, top]
  );
}

type HeaderContentSpacerProps = HeaderInsetOptions & {
  style?: StyleProp<ViewStyle>;
};

export function HeaderContentSpacer({ style, ...options }: HeaderContentSpacerProps) {
  const height = useHeaderContentTopInset(options);
  return <View pointerEvents="none" style={[{ height }, style]} />;
}
