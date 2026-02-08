import { Stack, usePathname, useRouter } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getServicesForUser, type ServiceAccessItem } from "@/utils/servicesService";
import { useNotify } from "@/components/NotificationHost";

export default function ServicesLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const notify = useNotify();
  const [services, setServices] = useState<ServiceAccessItem[] | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastAlertRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getServicesForUser();
        if (!active) return;
        setServices(data);
      } catch (e: any) {
        if (!active) return;
        setServicesError(e?.message || "Сервис временно недоступен");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const serviceKey = useMemo(() => {
    if (!pathname) return null;
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] !== "services") return null;
    if (!parts[1]) return null;
    return parts[1];
  }, [pathname]);

  const guardedService = useMemo(() => {
    if (!serviceKey) return null;
    return (services || []).find((s) => s.key === serviceKey) || null;
  }, [serviceKey, services]);

  useEffect(() => {
    if (!serviceKey) return;
    if (loading) return;

    const denied = !guardedService || !guardedService.visible || !guardedService.enabled || !!servicesError;

    if (denied) {
      const alertKey = `${serviceKey}-${servicesError || "denied"}`;
      if (lastAlertRef.current !== alertKey) {
        lastAlertRef.current = alertKey;
        notify({
          type: "error",
          title: "Ошибка",
          message: "Сервис временно недоступен",
          durationMs: 5200,
        });
      }
      router.replace("/services");
    }
  }, [serviceKey, loading, guardedService, servicesError, notify, router]);

  const blocked =
    !!serviceKey &&
    !loading &&
    (!!servicesError || !guardedService || !guardedService.visible || !guardedService.enabled);

  if (serviceKey && (loading || blocked)) {
    return null;
  }
  type HeaderMeta = {
    title: string;
    icon: string;
    showBack: boolean;
    parent?: string;
    subtitle?: string;
  };

  const map: Record<string, HeaderMeta> = {
    index: { title: "Главная сервисов", icon: "apps-outline", showBack: false, subtitle: "Все доступные сервисы" },
    qrcodes: { title: "QR генератор", icon: "qr-code-outline", showBack: true, parent: "/services", subtitle: "Создание и аналитика QR" },
    "qrcodes/index": { title: "Список QR кодов", icon: "qr-code-outline", showBack: true, parent: "/services/qrcodes", subtitle: "Все ваши QR-коды" },
    "qrcodes/form": { title: "Форма QR кода", icon: "qr-code-outline", showBack: true, parent: "/services/qrcodes", subtitle: "Создание и правка" },
    appeals: { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services", subtitle: "Центр общения" },
    "appeals/index": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services", subtitle: "Центр общения" },
    "appeals/index.web": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services", subtitle: "Центр общения" },
    "appeals/[id]": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Центр общения" },
    "appeals/[id].web": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Центр общения" },
    "appeals/new": { title: "Новое обращение", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Создать обращение" },
    "appeals/new.web": { title: "Новое обращение", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Создать обращение" },
    tracking: { title: "Геомаршруты", icon: "map-outline", showBack: true, parent: "/services", subtitle: "Маршруты и точки на карте" },
    "tracking/index": { title: "Геомаршруты", icon: "map-outline", showBack: true, parent: "/services", subtitle: "Маршруты и точки на карте" },
  };

  return (
    <Stack
      screenOptions={({ route, navigation }) => {
        const name = (route as any)?.routeName || (route.name as string);
        let meta = map[name as keyof typeof map];

        const isAppeals = name?.includes("appeals");
        const isAppealsList = name === "appeals" || name === "appeals/index" || name === "appeals/index.web";

        if (!meta && isAppeals) {
          meta = {
            title: "Обращения",
            icon: "chatbubbles-outline",
            showBack: !isAppealsList,
            parent: "/services/appeals",
            subtitle: "Центр общения",
          };
        }

        if (!meta) meta = { title: "Сервисы", icon: "apps-outline", showBack: true, parent: "/services" };

        // Для обращений: используем showBack из карты, иначе стандарт
        // Показываем стрелку строго по настройке в карте meta,
        // чтобы на главной сервисов стрелки не было.
        const shouldShowBack = meta.showBack;
        const onBack = () => {
          const target = isAppeals ? "/services" : (meta as any).parent;
          if (target) {
            router.replace(target as any);
            return;
          }
          if (navigation.canGoBack()) navigation.goBack();
          else router.replace("/services");
        };
        return {
          headerTransparent: true,
          headerShadowVisible: false,
          headerStatusBarHeight: 0,
          headerStyle: { backgroundColor: "transparent" },
          header: () => (
            <AppHeader
              title={meta.title}
              subtitle={meta.subtitle}
              icon={meta.icon}
              showBack={shouldShowBack}
              onBack={shouldShowBack ? onBack : undefined}
            />
          ),
          animation: "ios_from_left",
        };
      }}
    />
  );
}
