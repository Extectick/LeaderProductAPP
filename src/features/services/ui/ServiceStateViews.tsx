import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

type LoadingProps = {
  backgroundColor: string;
  textColor: string;
  style?: any;
};

type ErrorProps = {
  backgroundColor: string;
  textColor: string;
  message?: string | null;
  style?: any;
};

export function ServicesLoadingView({ backgroundColor, textColor, style }: LoadingProps) {
  return (
    <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center' }, style, { backgroundColor }]}>
      <ActivityIndicator size="large" color={textColor} />
    </View>
  );
}

export function ServicesErrorView({ backgroundColor, textColor, message, style }: ErrorProps) {
  return (
    <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center' }, style, { backgroundColor }]}>
      <Text style={{ color: textColor, fontSize: 16 }}>{message || 'Ошибка'}</Text>
    </View>
  );
}
