import { createGalleryHistory } from '../src/features/clientOrders/hooks/useGalleryHistory';

const orderUrl = 'https://dev.leader-product.ru/order/#testCode1234';
function fakeBrowser() {
  const stack = [{ url: 'https://dev.leader-product.ru/previous', state: null as any }, { url: orderUrl, state: { router: { key: 'order' } } as any }];
  let index = 1;
  let waiting = 0;
  const listeners = new Set<() => void>();
  const browser = {
    location: { get href() { return stack[index].url; } },
    history: {
      get state() { return stack[index].state; },
      pushState: jest.fn((state, _title, url?: string) => {
        const nextUrl = url || stack[index].url;
        stack.splice(index + 1); stack.push({ state, url: nextUrl }); index++;
      }),
      back: jest.fn(() => { waiting++; }),
    },
    addEventListener: jest.fn((_type, handler) => listeners.add(handler)),
    removeEventListener: jest.fn((_type, handler) => listeners.delete(handler)),
  };
  const flushBack = () => {
    expect(waiting).toBeGreaterThan(0);
    waiting--; index = Math.max(0, index - 1);
    for (const listener of [...listeners]) listener();
  };
  return { browser: browser as unknown as Window, flushBack, listeners };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('Back closes only the image; a second Back returns to the prior browser page', () => {
  const { browser, flushBack } = fakeBrowser(); const close = jest.fn();
  const gallery = createGalleryHistory(browser, close);
  gallery.sync(true);
  expect(browser.location.href).toBe(orderUrl);
  expect(browser.history.state.router).toEqual({ key: 'order' });
  expect(Object.keys(browser.history.state).sort()).toEqual(['__leaderProductPhoto', 'router']);
  browser.history.back(); flushBack();
  expect(close).toHaveBeenCalledTimes(1);
  expect(browser.location.href).toBe(orderUrl);
  gallery.sync(false);
  browser.history.back(); flushBack();
  expect(browser.location.href).toContain('/previous');
  expect(close).toHaveBeenCalledTimes(1);
});

it('cross/Escape closes the overlay and consumes exactly one history entry', () => {
  const { browser, flushBack } = fakeBrowser(); const close = jest.fn();
  const gallery = createGalleryHistory(browser, close);
  gallery.sync(true); gallery.close(); gallery.close(); gallery.sync(false);
  expect(browser.history.back).toHaveBeenCalledTimes(1);
  flushBack();
  expect(browser.location.href).toBe(orderUrl);
  expect(browser.history.state).toEqual({ router: { key: 'order' } });
  browser.history.back(); flushBack();
  expect(browser.location.href).toContain('/previous');
});

it('does not push extra entries for switching photos or rerenders', () => {
  const { browser } = fakeBrowser();
  const gallery = createGalleryHistory(browser, jest.fn());
  gallery.sync(true); gallery.sync(true); gallery.sync(true);
  expect(browser.history.pushState).toHaveBeenCalledTimes(1);
});

it('rapid reopen waits for asynchronous close traversal before adding an entry', () => {
  const { browser, flushBack } = fakeBrowser(); const close = jest.fn();
  const gallery = createGalleryHistory(browser, close);
  gallery.sync(true); gallery.close(); gallery.sync(false); gallery.sync(true);
  expect(browser.history.pushState).toHaveBeenCalledTimes(1);
  flushBack();
  expect(browser.history.pushState).toHaveBeenCalledTimes(2);
  browser.history.back(); flushBack();
  expect(browser.location.href).toBe(orderUrl);
  expect(close).toHaveBeenCalledTimes(2);
});

it('Strict Mode cleanup/setup reuses the same entry without navigating', () => {
  const { browser } = fakeBrowser();
  const gallery = createGalleryHistory(browser, jest.fn());
  gallery.sync(true); gallery.dispose(); gallery.sync(true); jest.runAllTimers();
  expect(browser.history.pushState).toHaveBeenCalledTimes(1);
  expect(browser.history.back).not.toHaveBeenCalled();
});

it('external close removes its history entry without calling onClose again', () => {
  const { browser, flushBack } = fakeBrowser(); const close = jest.fn();
  const gallery = createGalleryHistory(browser, close);
  gallery.sync(true); gallery.sync(false); flushBack();
  expect(close).not.toHaveBeenCalled();
  expect(browser.location.href).toBe(orderUrl);
});

it('does not undo unrelated navigation when unmounted on another route', () => {
  const { browser, listeners } = fakeBrowser();
  const gallery = createGalleryHistory(browser, jest.fn());
  gallery.sync(true);
  browser.history.pushState({ nextRoute: true }, '', 'https://dev.leader-product.ru/other');
  gallery.dispose(); jest.runAllTimers();
  expect(browser.history.back).not.toHaveBeenCalled();
  expect(browser.location.href).toContain('/other');
  expect(listeners.size).toBe(0);
});

it('unmount releases its entry and removes the pending traversal listener', () => {
  const { browser, flushBack, listeners } = fakeBrowser(); const close = jest.fn();
  const gallery = createGalleryHistory(browser, close);
  gallery.sync(true); gallery.dispose(); jest.runAllTimers(); flushBack();
  expect(browser.location.href).toBe(orderUrl);
  expect(listeners.size).toBe(0);
  expect(close).not.toHaveBeenCalled();
});
