// ===== File: app/(main)/services/qrcodes/form.tsx =====
import QRCodeForm from '@/components/QRcodes/QRCodeForm';
import type { QRCodeItemType, QRType } from '@/src/entities/qr/types';
import { createQRCode, getQRCodeById, updateQRCode } from '@/utils/qrService';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Skeleton } from 'moti/skeleton';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';

export default function QRFormScreen() {
  const router = useRouter();
  const headerTopInset = useHeaderContentTopInset({ hasSubtitle: true });
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
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message ?? 'Не удалось загрузить QR-код');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, isEdit]);

  const initial = useMemo(() => item ?? undefined, [item]);

  // --- методы для формы ---
  const handleCreate = async (payload: { qrType: QRType; qrData: string | Record<string, any>; description?: string }) => {
    await createQRCode(payload.qrType, payload.qrData, payload.description);
  };

  const handleUpdate = async (qrId: string, patch: Partial<{ qrType: QRType; qrData: string | Record<string, any>; description: string | null }>) => {
    if (!patch || Object.keys(patch).length === 0) return; // нечего обновлять
    await updateQRCode(qrId, patch);
  };

  const handleSuccessClose = () => {
    router.back(); // закрыть форму и вернуться назад
  };

  return (
    <View style={{ flex: 1, padding: 16, paddingTop: 16 + headerTopInset, backgroundColor: '#fff' }}>
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
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onSuccess={handleSuccessClose}
        />
      )}
    </View>
  );
}
