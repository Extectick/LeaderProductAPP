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
    "appeals/index.web": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services", subtitle: "Центр общения" },
    "appeals/[id]": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Центр общения" },
    "appeals/[id].web": { title: "Обращения", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Центр общения" },
    "appeals/new": { title: "Новое обращение", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Создать обращение" },
    "appeals/new.web": { title: "Новое обращение", icon: "chatbubbles-outline", showBack: true, parent: "/services/appeals", subtitle: "Создать обращение" },
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
        const name = (route as any)?.routeName || (route.name as string);
        let meta = map[name as keyof typeof map];

        const isAppeals = name?.includes("appeals");

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
