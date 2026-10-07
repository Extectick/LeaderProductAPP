type Resume = () => void;
type Preparation = (signal: AbortSignal) => Promise<Resume>;
const preparations = new Set<Preparation>();
const blockers = new Set<() => string | null>();
let pendingReload: Promise<void> | null = null;
export const APP_RELOAD_TIMEOUT_MS = 8_000;

export class AppReloadDeferredError extends Error {}

export function registerAppReloadPreparation(prepare: Preparation) {
  preparations.add(prepare);
  return () => { preparations.delete(prepare); };
}

export function registerAppReloadBlocker(check: () => string | null) {
  blockers.add(check);
  return () => { blockers.delete(check); };
}

export function waitForReloadWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** All OTA entry points share one barrier. A late preparation may never reload. */
export function reloadAppSafely(reload: () => Promise<void>): Promise<void> {
  if (pendingReload) return pendingReload;
  const controller = new AbortController();
  const resumes: Resume[] = [];
  const resume = () => { while (resumes.length) resumes.pop()!(); };
  const timer = setTimeout(() => {
    controller.abort(new AppReloadDeferredError('Не удалось применить обновление. Повторите позже'));
    resume();
    pendingReload = null;
  }, APP_RELOAD_TIMEOUT_MS);
  (timer as any)?.unref?.();
  pendingReload = (async () => {
    for (const check of blockers) {
      const message = check();
      if (message) throw new AppReloadDeferredError(message);
    }
    for (const prepare of preparations) {
      const prepared = prepare(controller.signal).then((release) => {
        // A timed-out close still completes safely, but may not trigger reload.
        if (controller.signal.aborted) release();
        else resumes.push(release);
      });
      await waitForReloadWork(prepared, controller.signal);
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    await waitForReloadWork(Promise.resolve().then(reload), controller.signal);
    // Keep storage paused until native reload destroys this runtime. The timer
    // reopens admission if native unexpectedly resolves without replacing JS.
  })().catch((error) => {
    clearTimeout(timer);
    controller.abort(error);
    resume();
    pendingReload = null;
    throw error;
  });
  return pendingReload;
}
