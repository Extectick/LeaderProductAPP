import { useCallback, useEffect, useState } from 'react';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';

export function useServicesData() {
  const [services, setServices] = useState<ServiceAccessItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getServicesForUser();
      setServices(data);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить сервисы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  return {
    services,
    error,
    loading,
    loadServices,
  };
}
