import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Button, MD3LightTheme, PaperProvider, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { KnowledgeReviewPanel } from '../../src/features/knowledge/KnowledgeReviewPanel';
import { createKnowledgeFixture } from './fixture';

const theme = { ...MD3LightTheme, roundness: 16, colors: { ...MD3LightTheme.colors, primary: '#2563EB', secondary: '#0F172A', surface: '#FFFFFF', surfaceVariant: '#F8FAFC', background: '#F8FAFC', error: '#DC2626' } };
export default function KnowledgePreview() {
  const [scenario, setScenario] = useState('normal'); const client = useMemo(() => createKnowledgeFixture(scenario), [scenario]);
  const [fonts] = useFonts(MaterialCommunityIcons.font); if (!fonts) return null;
  return <PaperProvider theme={theme}><View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
    <ScrollView horizontal style={{ flexGrow: 0, backgroundColor: '#E2E8F0' }} contentContainerStyle={{ alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}><Text variant="labelSmall">Локальная проверка · данные примера</Text>{[['normal','Обычный режим'],['conflict','Конфликт версии'],['offline','Сбой источника'],['denied','Без доступа']].map(([key,label]) => <Button key={key} compact onPress={() => setScenario(key)}>{label}</Button>)}</ScrollView>
    <View style={{ flex: 1, minHeight: 0, padding: 16, width: '100%', maxWidth: 1500, alignSelf: 'center' }}><KnowledgeReviewPanel key={scenario} client={client} /></View>
  </View></PaperProvider>;
}
