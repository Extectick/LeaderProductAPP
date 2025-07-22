import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

type AutoCompleteType =
  | 'name'
  | 'username'
  | 'email'
  | 'password'
  | 'tel'
  | 'street-address'
  | 'postal-code'
  | 'cc-number'
  | 'cc-exp'
  | 'cc-csc'
  | 'cc-type'
  | 'organization'
  | 'country'
  | 'off';

type FormInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  error?: string | null;
  editable?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  maxLength?: number;
  autoComplete?: AutoCompleteType;
  textAlign?: TextInputProps['textAlign'];
  rightIcon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onIconPress?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
};

// Используем forwardRef чтобы можно было фокус ставить из родителя
const FormInput = forwardRef<TextInput, FormInputProps>((props, ref) => {
  const {
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
    autoComplete,
    textAlign = 'left',
    rightIcon,
    onIconPress,
    returnKeyType,
    onSubmitEditing,
    blurOnSubmit,
  } = props;

  const { theme, themes } = useTheme();
  const colors = themes[theme];

  const styles = StyleSheet.create({
    container: {
      marginBottom: 22, // увеличен отступ между полями
      width: '100%',
    },
    label: {
      fontSize: 16, // увеличен шрифт заголовка
      marginBottom: 8, // увеличен отступ между лейблом и инпутом
      fontWeight: '600',
      color: colors.text,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 6,
      borderColor: error ? colors.error : colors.inputBorder,
      backgroundColor: colors.inputBackground,
      paddingHorizontal: 12,
      height: 48, // увеличена высота поля
    },
    input: {
      flex: 1,
      fontSize: 18, // увеличен шрифт ввода
      color: colors.text,
      textAlign: textAlign,
      paddingVertical: 8,
    },
    errorText: {
      marginTop: 4,
      color: colors.error,
      fontSize: 13,
    },
    iconButton: {
      marginLeft: 10,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          ref={ref}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          editable={editable}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          autoComplete={autoComplete}
          textAlign={textAlign}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
        />
        {rightIcon && onIconPress && (
          <TouchableOpacity
            onPress={onIconPress}
            style={styles.iconButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name={rightIcon} size={24} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

export default FormInput;
