import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
export function useIsFocused() { return true; }
export function useFocusEffect(effect: () => void | (() => void)) { useEffect(effect, [effect]); }
export function useLocalSearchParams() { return Platform.OS === 'web' ? Object.fromEntries(new URLSearchParams(window.location.search)) : { screen: 'chat', ticketId: '1042' }; }
const router = { replace: () => { if (Platform.OS !== 'web') { Alert.alert('Локальный QA', 'Каталог не подключён. Все данные — тестовые и находятся только в памяти.'); return; } window.location.search = '?screen=list&theme=' + (new URLSearchParams(window.location.search).get('theme') || 'dark'); } };
export function useRouter() { return router; }
