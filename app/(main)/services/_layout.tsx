import { Stack } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import { useRouter } from "expo-router";

export default function ServicesLayout() {
  const router = useRouter();

  const map = {
    index: { title: "Главная сервисов", icon: "apps-outline", showBack: false, subtitle: "Все доступные сервисы" },
    qrcodes: { title: "QR генератор", icon: "qr-code-outline", showBack: true, parent: "/services", subtitle: "Создание и аналитика QR" },
    "qrcodes/index": { title: "Список QR кодов", icon: "qr-code-outline", showBack: true, parent: "/services/qrcodes", subtitle: "Все ваши QR-коды" },
    "qrcodes/form": { title: "Форма QR кода", icon: "qr-code-outline", showBack: true, parent: "/services/qrcodes", subtitle: "Создание и правка" },
    appeals: { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services", subtitle: "Центр общения" },
    "appeals/index": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services", subtitle: "Центр общения" },
    tracking: { title: "Геомаршруты", icon: "map-outline", showBack: true, parent: "/services", subtitle: "Маршруты и точки на карте" },
    "tracking/index": { title: "Геомаршруты", icon: "map-outline", showBack: true, parent: "/services", subtitle: "Маршруты и точки на карте" },
  } satisfies Record<
    string,
    {
      title: string;
      icon: string;
      showBack: boolean;
      parent?: string;
      subtitle?: string;
    }
  >;

  return (
    <Stack
      screenOptions={({ route, navigation }) => {
        const meta = map[route.name as keyof typeof map] || { title: "Сервисы", icon: "apps-outline", showBack: true, parent: "/services" };
        const onBack = () => {
          if (navigation.canGoBack()) navigation.goBack();
          else if ((meta as any).parent) router.replace((meta as any).parent as any);
          else router.back();
        };
        return {
          header: () => (
            <AppHeader
              title={meta.title}
              subtitle={meta.subtitle}
              icon={meta.icon}
              showBack={meta.showBack}
              onBack={meta.showBack ? onBack : undefined}
            />
          ),
          animation: "ios_from_left",
        };
      }}
    />
  );
}
