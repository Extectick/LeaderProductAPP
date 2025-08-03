import AsyncStorage from '@react-native-async-storage/async-storage';

interface AccessLog {
  timestamp: number;
  isAuthenticated: boolean;
  hasProfile: boolean;
  profileStatus?: string;
  route?: string;
  error?: string;
}

export const logAccessAttempt = async (data: Omit<AccessLog, 'timestamp'>) => {
  const logEntry: AccessLog = {
    timestamp: Date.now(),
    ...data
  };

  // Логирование в консоль для разработки
  console.log('[Access Log]', logEntry);

  // Сохранение в AsyncStorage
  try {
    const existingLogs = await AsyncStorage.getItem('accessLogs');
    const logs = existingLogs ? JSON.parse(existingLogs) : [];
    logs.push(logEntry);
    await AsyncStorage.setItem('accessLogs', JSON.stringify(logs));
  } catch (error) {
    console.error('Failed to save access log:', error);
  }
};

export const getAccessLogs = async (): Promise<AccessLog[]> => {
  try {
    const logs = await AsyncStorage.getItem('accessLogs');
    return logs ? JSON.parse(logs) : [];
  } catch (error) {
    console.error('Failed to get access logs:', error);
    return [];
  }
};
