// AuthScreen.styles.ts

import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

const getStyles = (colors: {
  background: string;
  text: string;
  inputBackground: string;
  inputBorder: string;
  button: string;
  buttonText: string;
  secondaryText: string;
  error: string;
  placeholder: string;
  buttonDisabled: string;
  cardBackground: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 20,
      justifyContent: 'center',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    formContainer: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 30,
      shadowColor: '#000',
      shadowOpacity: 0.7,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
      maxWidth: 600,
      width: '100%',
      marginHorizontal: 20,
      alignSelf: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      marginBottom: 25,
      color: colors.text,
      textAlign: 'center',
      letterSpacing: 1,
    },
    input: {
      height: 50,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      marginBottom: 20,
      paddingHorizontal: 15,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.inputBackground,
    },
    codeInput: {
      height: 60,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      marginVertical: 20,
      paddingHorizontal: 20,
      fontSize: 24,
      letterSpacing: 12,
      color: colors.text,
      backgroundColor: colors.inputBackground,
      textAlign: 'center',
    },
    button: {
      backgroundColor: colors.button,
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
      marginBottom: 15,
      shadowColor: colors.button,
      shadowOpacity: 0.7,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      maxWidth: Platform.OS === 'web' ? 300 : '100%',
      alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    },
    buttonDisabled: {
      backgroundColor: colors.buttonDisabled,
    },
    buttonText: {
      color: colors.buttonText,
      fontSize: 20,
      fontWeight: '700',
    },
    switchText: {
      color: colors.secondaryText,
      textAlign: 'center',
      fontSize: 16,
      textDecorationLine: 'underline',
    },
    error: {
      color: colors.error,
      marginBottom: 15,
      textAlign: 'center',
      fontWeight: '600',
    },
    verifyText: {
      color: colors.secondaryText,
      fontSize: 16,
      textAlign: 'center',
    },
    secondaryText: {
      color: colors.secondaryText,
      textAlign: 'center',
      marginTop: 10,
      fontSize: 14,
    },
  });

export default getStyles;
