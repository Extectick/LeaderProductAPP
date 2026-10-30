import { hiddenHelpLatest, updateHelpLatestAffordance as update } from '../src/features/help/helpJumpToLatestModel';

test('opening an old window and layout changes cannot show the arrow', () => {
  const hidden = hiddenHelpLatest();
  expect(update(hidden, { delta: -900, gap: 900, manual: false, hasNewer: true })).toBe(hidden);
});
test('a manual 100dp upward scroll is required and survives small gestures', () => {
  let state = update(hiddenHelpLatest(), { delta: -8, gap: 8, manual: true, hasNewer: false });
  expect(state.visible).toBe(false);
  state = update(state, { delta: -91, gap: 99, manual: true, hasNewer: false });
  expect(state.visible).toBe(false);
  state = update(state, { delta: -1, gap: 100, manual: true, hasNewer: false });
  expect(state.visible).toBe(true);
});
test('returning down 100dp hides it and the physical bottom clears the intent', () => {
  const shown = { visible: true, up: 150, down: 0 };
  const part = update(shown, { delta: 50, gap: 300, manual: true, hasNewer: false });
  expect(part.visible).toBe(true);
  expect(update(part, { delta: 50, gap: 250, manual: true, hasNewer: false }).visible).toBe(false);
  expect(update(shown, { delta: 0, gap: 1, manual: false, hasNewer: false })).toEqual(hiddenHelpLatest());
});
test('a paginated window end is not the conversation end', () => {
  expect(update(hiddenHelpLatest(), { delta: -120, gap: 0, manual: true, hasNewer: true }).visible).toBe(true);
});
