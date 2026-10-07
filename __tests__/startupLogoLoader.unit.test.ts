import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import StartupLogoLoader from '../components/StartupLogoLoader';

jest.mock('react-native', () => ({
  Image: 'Image', ScrollView: 'ScrollView', View: 'View',
  StyleSheet: { create: (styles: any) => styles, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
}));
jest.mock('react-native-paper', () => ({ ProgressBar: 'ProgressBar', Text: 'Text' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 24 }) }));

let screen: ReactTestRenderer;
afterEach(async () => { await act(async () => screen.unmount()); });
async function render(progress: number | null = null) {
  await act(async () => { screen = create(React.createElement(StartupLogoLoader, { stage: 'downloading', progress })); });
}
it('keeps the 200 dp artwork centered independently of status/progress', async () => {
  await render();
  const logo = screen.root.findByType('Image' as any);
  expect(logo.props.style).toEqual({ width: 200, height: 200 });
  expect(logo.parent!.props.style).toMatchObject({ position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' });
  const content = screen.root.findByType('ScrollView' as any);
  expect(content.props.style).toEqual(expect.arrayContaining([
    expect.objectContaining({ top: '50%', marginTop: 128 }), { bottom: 40 },
  ]));
});
it('uses one indeterminate bar for unknown progress without a second spinner', async () => {
  await render();
  const bar = screen.root.findByType('ProgressBar' as any);
  expect(bar.props.indeterminate).toBe(true);
  expect(screen.root.findAllByType('ActivityIndicator' as any)).toHaveLength(0);
  expect(screen.root.findAllByType('Text' as any).map((node) => node.props.children)).not.toContain('0%');
});
it('shows measured progress below the status', async () => {
  await render(0.37);
  expect(screen.root.findByType('ProgressBar' as any).props).toMatchObject({ progress: 0.37, indeterminate: false });
  expect(screen.root.findAllByType('Text' as any).map((node) => node.props.children)).toEqual(['Обновляем', '37%']);
});
it.each([NaN, Infinity])('treats invalid progress %s as unknown', async (progress) => {
  await render(progress);
  expect(screen.root.findByType('ProgressBar' as any).props.indeterminate).toBe(true);
});

it('shows only the logo during initialization/checks/auth even if progress is passed', async () => {
  await act(async () => { screen = create(React.createElement(StartupLogoLoader, { progress: 0.5 })); });
  expect(screen.root.findAllByType('Image' as any)).toHaveLength(1);
  expect(screen.root.findAllByType('Text' as any)).toHaveLength(0);
  expect(screen.root.findAllByType('ProgressBar' as any)).toHaveLength(0);
});
it('shows only a short status while applying, never a spinner or stale percent', async () => {
  await act(async () => { screen = create(React.createElement(StartupLogoLoader, { stage: 'applying', progress: 1 })); });
  expect(screen.root.findAllByType('Text' as any).map((node) => node.props.children)).toEqual(['Запускаем']);
  expect(screen.root.findAllByType('ProgressBar' as any)).toHaveLength(0);
});
it('removes progress immediately on download completion without shifting the logo', async () => {
  await render(1);
  await act(async () => { screen.update(React.createElement(StartupLogoLoader, { stage: 'logo' })); });
  expect(screen.root.findByType('Image' as any).props.style).toEqual({ width: 200, height: 200 });
  expect(screen.root.findAllByType('Text' as any)).toHaveLength(0);
  expect(screen.root.findAllByType('ProgressBar' as any)).toHaveLength(0);
});
