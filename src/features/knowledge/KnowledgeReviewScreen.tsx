import React from 'react';
import { View } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { KnowledgeReviewPanel } from './KnowledgeReviewPanel';
import { knowledgeApi } from './api';

export default function KnowledgeReviewScreen() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const bottom = useTabBarSpacerHeight();
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: bottom, backgroundColor: colors.background }}>
    <Appbar.Header statusBarHeight={0} style={{ backgroundColor: colors.background }}><Appbar.BackAction accessibilityLabel="Вернуться в поддержку" onPress={() => router.canGoBack() ? router.back() : router.replace('/services/help')} /><Appbar.Content title="Проверка документов" /></Appbar.Header>
    <View style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 1500, alignSelf: 'center', paddingHorizontal: 12, paddingBottom: 12 }}><KnowledgeReviewPanel client={knowledgeApi} /></View>
  </View>;
}
