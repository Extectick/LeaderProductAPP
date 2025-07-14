import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e2f',
    padding: 20,
    justifyContent: 'center',
  },
  formContainer: {
    backgroundColor: '#2a2a3d',
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
    color: '#f0f0f5',
    textAlign: 'center',
    letterSpacing: 1,
  },
  input: {
    height: 50,
    borderColor: '#444466',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 20,
    paddingHorizontal: 15,
    fontSize: 18,
    color: '#f0f0f5',
    backgroundColor: '#3a3a52',
  },
  codeInput: {
    height: 60,
    borderColor: '#444466',
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 20,
    paddingHorizontal: 20,
    fontSize: 24,
    letterSpacing: 12,
    color: '#f0f0f5',
    backgroundColor: '#3a3a52',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#5a67d8',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#5a67d8',
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    maxWidth: Platform.OS === 'web' ? 300 : '100%',
    alignSelf: Platform.OS === 'web' ? 'center' : 'stretch',
  },
  buttonDisabled: {
    backgroundColor: '#8a8ecf',
  },
  buttonText: {
    color: '#f0f0f5',
    fontSize: 20,
    fontWeight: '700',
  },
  switchText: {
    color: '#a0a0c0',
    textAlign: 'center',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  disabledText: {
    color: '#555577',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  verifyText: {
    color: '#c0c0d0',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default styles;
