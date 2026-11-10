import {Linking, Platform} from 'react-native';
import {normalizeWebUrl} from './webPagePolicy';

export async function openWebPageExternally(value: string): Promise<boolean> {
  const url = normalizeWebUrl(value);
  if (!url) return false;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // The external site never receives an opener into the authenticated APP.
      window.open(url, '_blank', 'noopener,noreferrer');
    } else await Linking.openURL(url);
    return true;
  } catch { return false; }
}
