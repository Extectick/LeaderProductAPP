import { Stack } from "expo-router";

export default function ServicesLayout() {
  return (
    <Stack
      screenOptions={({ route }) => {
        let title = "Сервисы";
        switch (route.name) {
          case "index":
            title = "Главная сервисов";
            break;
          case "qrcodes":
            title = "QR генератор";
            break;              
          case "qrcodes/index":
              title = "Список QR кодов";
              break;
          case "qrcodes/form":
              title = "Форма QR кода";
              break;
          case "appeals":
            title = "Обращения";
            break;
          case "appeals/index":
            title = "Обращения";
            break;
          case "tracking":
            title = "Геомаршруты";
            break;
          case "tracking/index":
            title = "Геомаршруты";
            break;
          
        default:
            title = "Сервисы";
        }

        return {
          headerShown: true,
          title,
          animation: "ios_from_left",
        };
      }}
    />
  );
}
