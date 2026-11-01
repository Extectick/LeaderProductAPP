/** Native camera boundary for web layout QA; never used by app Metro. */
import React from 'react';
import { View } from 'react-native';
const permission = { granted: false, canAskAgain: false, status: 'denied' };
export const CameraView = React.forwardRef<View, any>((props, ref) => <View ref={ref} {...props}/>);
export function useCameraPermissions() { return [permission, async () => permission, async () => permission] as const; }
