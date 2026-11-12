// Fixture-only defence in depth. Metro assets remain available; no API is allowed.
const state = globalThis as typeof globalThis & {__ordersFixtureNetwork?: {blocked: string[]}};
if (typeof window !== 'undefined' && !state.__ordersFixtureNetwork) {
  const blocked: string[] = [];
  state.__ordersFixtureNetwork = {blocked};
  const local = (value: string) => {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin && !/^\/api(?:\/|$)/.test(url.pathname);
  };
  const reject = (value: string) => {
    blocked.push(new URL(value, window.location.href).pathname);
    throw new Error('Заказы QA: обращения к реальным API отключены.');
  };
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: any, init: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!local(url)) { try { reject(url); } catch (error) { return Promise.reject(error); } }
    return originalFetch(input, init);
  }) as typeof fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    if (!local(String(url))) reject(String(url));
    return (originalOpen as any).call(this, method, url, ...rest);
  } as typeof originalOpen;
}
export {};
