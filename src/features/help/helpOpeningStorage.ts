/** The local writer/reader queues may be busy during sync. Opening remains a
 * cancellable UI operation; the original storage work keeps its transaction. */
export function helpOpeningStorage<T>(work: Promise<T>, fallback: T, budgetMs = 180): Promise<T> {
  return new Promise(resolve => {
    let done = false;
    const finish = (value: T) => { if(done)return;done=true;clearTimeout(timer);resolve(value); };
    const timer = setTimeout(() => finish(fallback), budgetMs);
    void work.then(finish,()=>finish(fallback));
  });
}
