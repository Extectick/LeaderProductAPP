import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
// SVG's web implementation forwards extra props to its DOM element.
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: ({ testID, ...props }: any) => require('react').createElement('svg', { 'data-testid': testID, ...props }),
  Path: (props: any) => require('react').createElement('path', props),
}));

import { HelpAiIcon } from '../src/features/help/components/HelpAiIcon';

test('decorative AI icon renders valid, hidden, non-focusable SVG without React DOM warnings', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const html = renderToStaticMarkup(React.createElement(HelpAiIcon));
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('focusable="false"');
  expect(html).not.toContain('accessible=');
  expect(html).not.toContain('importantForAccessibility');
  expect(error).not.toHaveBeenCalled();
});
