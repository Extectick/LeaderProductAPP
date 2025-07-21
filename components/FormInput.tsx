import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type FormInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad';
  error?: string | null;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
};

export default function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  error,
  editable = true,
  autoCapitalize = 'none',
  maxLength,
}: FormInputProps) {
  const { theme, themes } = useTheme();
  const colors = themes[theme];

  const styles = StyleSheet.create({
    container: {
      marginBottom: 15,
      width: '100%',
    },
    label: {
      fontSize: 14,
      marginBottom: 5,
      fontWeight: '600',
      color: colors.text,
    },
    input: {
      height: 40,
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 10,
      fontSize: 16,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      color: colors.text
    },
    inputError: {
      borderColor: colors.error,
    },
    errorText: {
      marginTop: 3,
      color: colors.error,
      fontSize: 12,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        editable={editable}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
