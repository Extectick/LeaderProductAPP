import type { TextInputProps } from 'react-native';

type ClientOrdersSearchTextInputProps = Pick<
  TextInputProps,
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'spellCheck'
  | 'autoComplete'
  | 'textContentType'
  | 'importantForAutofill'
  | 'keyboardType'
  | 'returnKeyType'
  | 'inputMode'
  | 'disableFullscreenUI'
  | 'multiline'
  | 'blurOnSubmit'
  | 'secureTextEntry'
>;

export function getClientOrdersSearchTextInputProps(
  platform: string,
): ClientOrdersSearchTextInputProps {
  return {
    autoCapitalize: 'none',
    autoCorrect: false,
    spellCheck: false,
    autoComplete: 'off',
    textContentType: 'none',
    importantForAutofill: platform === 'android' ? 'noExcludeDescendants' : 'no',
    // Keep a normal text editor so Android IMEs preserve the user's active locale.
    // autoCorrect=false maps to TYPE_TEXT_FLAG_NO_SUGGESTIONS in React Native.
    keyboardType: platform === 'android' ? 'default' : 'web-search',
    inputMode: 'search',
    returnKeyType: 'search',
    disableFullscreenUI: true,
    multiline: false,
    blurOnSubmit: true,
    secureTextEntry: false,
  };
}
