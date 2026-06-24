export type AppUpdateCheckRequestResult = {
  handled: boolean;
  ok: boolean;
  updateAvailable: boolean;
  message?: string;
};

type Listener = () => Promise<AppUpdateCheckRequestResult> | AppUpdateCheckRequestResult;

const listeners = new Set<Listener>();

export function subscribeAppUpdateCheckRequests(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function requestAppUpdateCheck(): Promise<AppUpdateCheckRequestResult> {
  const allListeners = Array.from(listeners);
  const listener = allListeners[allListeners.length - 1];
  if (!listener) {
    return {
      handled: false,
      ok: false,
      updateAvailable: false,
      message: 'Проверка обновлений еще не готова.',
    };
  }

  try {
    return await listener();
  } catch (error: any) {
    return {
      handled: true,
      ok: false,
      updateAvailable: false,
      message: error?.message || 'Не удалось проверить обновления.',
    };
  }
}
