/** Bounds a consumer's wait; it does not cancel the underlying operation. */
export function withDeadline<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (publish: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      publish();
    };
    const aborted = () => finish(() => reject(Object.assign(new Error('Operation aborted'), { name: 'AbortError' })));
    // Always observe work, including when the caller has already left.
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => finish(() => reject(Object.assign(new Error('Operation timed out'), { name: 'TimeoutError' }))), timeoutMs);
  });
}
