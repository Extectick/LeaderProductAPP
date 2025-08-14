// ===== File: app/(main)/services/qrcodes/form.tsx =====
import QRCodeForm from '@/components/QRcodes/QRCodeForm';
import type { QRCodeItemType } from '@/types/qrTypes';
import { getQRCodeById } from '@/utils/qrService';
import { useLocalSearchParams } from 'expo-router';
import { Skeleton } from 'moti/skeleton';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

export default function QRFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isEdit = id && id !== 'new';
  const [loading, setLoading] = useState<boolean>(!!isEdit);
  const [item, setItem] = useState<QRCodeItemType | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isEdit) return;
      try {
        const data = await getQRCodeById(id!);
        if (mounted) setItem(data);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, isEdit]);

  const initial = useMemo(() => item ?? undefined, [item]);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#fff' }}>
      {loading ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={28} radius={8} />
          <Skeleton height={44} radius={12} />
          <Skeleton height={44} radius={12} />
          <Skeleton height={44} radius={12} />
          <Skeleton height={120} radius={16} />
          <Skeleton height={48} radius={24} />
        </View>
      ) : (
        <QRCodeForm
          mode={isEdit ? 'edit' : 'create'}
          initialItem={initial}
          onSubmit={async (payload) => {
            // TODO: вызвать ваш API
            // await saveOrUpdate(payload)
            return true;
          }}
        />
      )}
    </View>
  );
}