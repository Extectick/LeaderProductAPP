import React, {useEffect} from 'react';
export function useIsAdmin() { return {isAdmin: true, isCheckingAdmin: false}; }
export function useIsFocused() { return true; }
export function useFocusEffect(effect: () => void | (() => void)) { useEffect(effect, [effect]); }
export function useLocalSearchParams() { return {}; }
export function useNavigation() { return {setOptions: () => {}, canGoBack: () => false}; }
export function usePathname() { return '/admin'; }
const router = {push: () => {}, replace: () => {}, back: () => {}, canGoBack: () => false};
export function useRouter() { return router; }
export function Redirect() { return null; }
export function Link({children}: {children:React.ReactNode}) { return <>{children}</>; }
