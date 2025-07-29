// import { createNavigationContainerRef } from '@react-navigation/native';
// import { RootStackParamList } from '@/types/navigation';

// export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// export function navigate<RouteName extends keyof RootStackParamList>(
//   name: RouteName,
//   params?: RootStackParamList[RouteName]
// ) {
//   if (navigationRef.isReady()) {
//     navigationRef.navigate(name, params);
//   }
// }


// export function resetToAuth() {
//   if (navigationRef.isReady()) {
//     navigationRef.resetRoot({
//       index: 0,
//       routes: [{ name: '(auth)' as keyof RootStackParamList }],
//     });
//   }
// }
