import { getClientOrdersSearchTextInputProps } from '../src/features/clientOrders/lib/clientOrdersSearchInput';

describe('client orders search input configuration', () => {
  it('uses a locale-aware Android search keyboard without password semantics', () => {
    const props = getClientOrdersSearchTextInputProps('android');

    expect(props).toMatchObject({
      keyboardType: 'default',
      inputMode: 'search',
      returnKeyType: 'search',
      secureTextEntry: false,
    });
    expect(props.keyboardType).not.toBe('visible-password');
  });

  it('keeps suggestions, correction, spell-check and autofill disabled on Android', () => {
    expect(getClientOrdersSearchTextInputProps('android')).toMatchObject({
      autoCapitalize: 'none',
      autoCorrect: false,
      spellCheck: false,
      autoComplete: 'off',
      textContentType: 'none',
      importantForAutofill: 'noExcludeDescendants',
    });
  });

  it('never uses password keyboard semantics on supported platforms', () => {
    for (const platform of ['android', 'ios', 'web']) {
      expect(getClientOrdersSearchTextInputProps(platform).keyboardType).not.toBe('visible-password');
    }
  });
});
