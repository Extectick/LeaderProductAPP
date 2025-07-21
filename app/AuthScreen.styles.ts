import { Dimensions, Platform, StyleSheet } from 'react-native';
import { useThemeColor } from '../hooks/useThemeColor';

const { width } = Dimensions.get('window');

const getStyles = () => {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const inputBgColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');
  const errorColor = useThemeColor({}, 'error');

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: backgroundColor,
      padding: 20,
      justifyContent: 'center',
    },

    loadingContainer: { 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center', 
      backgroundColor: backgroundColor 
    },

    formContainer: {
      backgroundColor: useThemeColor({}, 'cardBackground'),
      borderRadius: 16,
      padding: 30,
      shadowColor: '#000',
      shadowOpacity: 0.7,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
      width: Platform.OS === 'web' ? 600 : '100%',
      maxWidth: Platform.OS === 'web' ? 600 : '100%',
      alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      marginBottom: 25,
      color: textColor,
      textAlign: 'center',
      letterSpacing: 1,
    },
    input: {
      height: 50,
      borderColor: inputBorderColor,
      borderWidth: 1,
      borderRadius: 12,
      marginBottom: 20,
      paddingHorizontal: 15,
      fontSize: 18,
      color: textColor,
      backgroundColor: inputBgColor,
    },
    codeInput: {
      height: 60,
      borderColor: inputBorderColor,
      borderWidth: 1,
      borderRadius: 12,
      marginVertical: 20,
      paddingHorizontal: 20,
      fontSize: 24,
      letterSpacing: 12,
      color: textColor,
      backgroundColor: inputBgColor,
      textAlign: 'center',
    },
    button: {
      backgroundColor: buttonColor,
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
      marginBottom: 15,
      shadowColor: buttonColor,
      shadowOpacity: 0.7,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      maxWidth: Platform.OS === 'web' ? 300 : '100%',
      alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
    },
    buttonDisabled: {
      backgroundColor: useThemeColor({}, 'buttonDisabled'),
    },
    buttonText: {
      color: buttonTextColor,
      fontSize: 20,
      fontWeight: '700',
    },
    switchText: {
      color: secondaryTextColor,
      textAlign: 'center',
      fontSize: 16,
      textDecorationLine: 'underline',
    },
    disabledText: {
      color: useThemeColor({}, 'disabledText'),
    },
    error: {
      color: errorColor,
      marginBottom: 15,
      textAlign: 'center',
      fontWeight: '600',
    },
    verifyText: {
      color: secondaryTextColor,
      fontSize: 16,
      textAlign: 'center',
    },
  });
};

export default getStyles;
