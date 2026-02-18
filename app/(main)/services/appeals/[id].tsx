import AppealDetailContent from '@/components/Appeals/AppealDetailContent';
import { useLocalSearchParams } from 'expo-router';

export default function AppealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const appealId = Number(id);

  return <AppealDetailContent appealId={appealId} mode="page" />;
}
