import { Platform } from 'react-native';

const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL_DEV ?? '';

let resolvedBaseUrl = rawBaseUrl;

// На Android эмуляторе localhost указывает внутрь эмулятора,
// поэтому подменяем на 10.0.2.2, чтобы достучаться до хоста.
if (Platform.OS === 'android' && rawBaseUrl.startsWith('http://localhost')) {
  resolvedBaseUrl = rawBaseUrl.replace('http://localhost', 'http://10.0.2.2');
}

export const API_BASE_URL = resolvedBaseUrl;
