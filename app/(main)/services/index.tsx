import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

type ServiceItem = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const services: ServiceItem[] = [
  {
    id: 'qrcode',
    title: 'QR генератор',
    icon: 'qr-code-outline',
    color: '#FF9AA2'
  },
  {
    id: 'documents',
    title: 'Документы',
    icon: 'document-text',
    color: '#FFB7B2'
  },
  {
    id: 'chat',
    title: 'Чат',
    icon: 'chatbubbles',
    color: '#B5EAD7'
  },
  {
    id: 'settings',
    title: 'Настройки',
    icon: 'settings',
    color: '#C7CEEA'
  }
];

export default function ServicesScreen() {
  const router = useRouter();

  const ServiceCard = ({ item }: { item: ServiceItem }) => {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }]
    }));

    const handlePressIn = () => {
      scale.value = withSpring(0.95);
    };

    const handlePressOut = () => {
      scale.value = withSpring(1);
      setTimeout(() => {
        if (item.id === 'documents') {
          router.push('/services/documents');
        }
      }, 150);
    };

    return (
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, animatedStyle, { backgroundColor: item.color }]}
      >
        <Ionicons name={item.icon} size={48} color="white" />
        <Text style={styles.title}>{item.title}</Text>
      </AnimatedPressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={services}
        renderItem={({ item }) => <ServiceCard item={item} />}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.columnWrapper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa'
  },
  list: {
    justifyContent: 'center'
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4
  },
  title: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: 'white'
  }
});
