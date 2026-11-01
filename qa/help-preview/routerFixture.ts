import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
export function useIsFocused() { return true; }
export function useFocusEffect(effect: () => void | (() => void)) { useEffect(effect, [effect]); }
export function useLocalSearchParams() { return Platform.OS === 'web' ? Object.fromEntries(new URLSearchParams(window.location.search)) : { screen: 'chat', ticketId: '1042' }; }
function navigate(path = '/services/help') {
  if (Platform.OS !== 'web') { Alert.alert('Локальный QA', 'Каталог не подключён. Все данные — тестовые и находятся только в памяти.'); return; }
  if (path !== '/services' && !path.startsWith('/services/help')) { Alert.alert('Локальный QA', 'В этом стенде доступны каталог и сервис «Помощь».'); return; }
  const params = new URLSearchParams(window.location.search);
  params.set('screen', path === '/services' ? 'services' : 'list');
  params.delete('ticketId');
  window.location.search = params.toString();
}
const router = { replace: navigate, push: navigate, dismissTo: navigate };
export function useRouter() { return router; }
