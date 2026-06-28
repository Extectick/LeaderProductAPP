import AppStatusIndicator from '@/src/shared/ui/AppStatusIndicator';
import { requestAppUpdateCheck } from '@/utils/updateCheckRequests';
import React from 'react';

type Props = {
  loadServices: (force?: boolean) => Promise<void>;
};

export default function ServicesCatalogStatusAction({ loadServices }: Props) {
  const [busy, setBusy] = React.useState(false);

  const handlePress = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all([
        requestAppUpdateCheck(),
        loadServices(true),
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, loadServices]);

  return <AppStatusIndicator idleBusy={busy} onIdlePress={handlePress} />;
}
