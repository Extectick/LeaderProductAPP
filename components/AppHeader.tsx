import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import { Platform, StyleSheet } from 'react-native';

interface AppHeaderProps {
  height?: number;
  backgroundColor?: string;
}

export default function AppHeader({
  height = 60,
  backgroundColor = Colors.leaderprod.cardBackground
}: AppHeaderProps) {
  if (Platform.OS === 'web') {
    return null;
  }
  return (
    <ThemedView 
      style={[
        styles.header,
        { 
          height,
          backgroundColor
        }
      ]}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    shadowColor: Colors.leaderprod.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 100
  }
});
