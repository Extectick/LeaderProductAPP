import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// SVG uses RN-web createElement: focusable=false becomes tabindex=-1 there.
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: (props: any) => require('react-native-web/dist/cjs/exports/createElement')('svg',props),
  Path: (props: any) => require('react').createElement('path', props),
}));

import { HelpAiIcon } from '../src/features/help/components/HelpAiIcon';

test('decorative AI icon renders valid, hidden, non-focusable SVG without React DOM warnings', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try{
    const html = renderToStaticMarkup(React.createElement(HelpAiIcon));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('tabindex=');
    expect(html).not.toContain('accessible=');
    expect(html).not.toContain('importantForAccessibility');
    expect(error).not.toHaveBeenCalled();
  }finally{error.mockRestore();}
});
