// V:\lp\components\Appeals\AppealListItemForm.tsx
import { Pressable, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AppealListItem } from '@/types/appealsTypes';

export default function AppealListItemForm({ item }: { item: AppealListItem }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push({ pathname: '/(main)/services/appeals/[id]', params: { id: String(item.id) } })}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Text style={{ fontWeight: '600' }}>#{item.number} {item.title ?? 'Без названия'}</Text>
        <Text>{item.toDepartment.name} • {item.status} • {item.priority}</Text>
      </View>
    </Pressable>
  );
}
