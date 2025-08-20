import React from "react";
import {
  Platform,
  useWindowDimensions,
  Pressable,
  PressableProps,
  ScrollView,
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

/** ---------- Экран ---------- */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();

  // отступ под web-сайдбар
  const rightSidebarWidth = Platform.OS === "web" ? 280 : 0;

  const actions: Array<{
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    href: string;
    color: string;
  }> = [
    { label: "Каталог",      icon: "grid-outline",    href: "/services",             color: "#2563EB" },
    { label: "QR-сервисы",   icon: "qr-code-outline", href: "/services/qrcodes",     color: "#7C3AED" },
    { label: "Задачи",       icon: "list-outline",    href: "/tasks",                color: "#059669" },
    { label: "Профиль",      icon: "person-outline",  href: "/profile",              color: "#0EA5E9" },
  ];

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
          paddingRight: rightSidebarWidth ? rightSidebarWidth + 16 : 16,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* HERO c обновлённой стилистикой */}
        <HeroFancy
          title={"Добро пожаловать в\nЛидер Продукт"}
          subtitle="Управляйте сервисами, задачами и аналитикой — всё в одном месте."
          onPressCTA={() => router.push("/services")}
        />

        {/* Быстрые действия */}
        <Animated.Text
          entering={FadeInUp.delay(120).duration(600)}
          style={styles.sectionTitle}
        >
          Быстрые действия
        </Animated.Text>

        <View style={[styles.grid, { gap: 12 }]}>
          {actions.map((a, i) => (
            <Animated.View
              key={a.label}
              entering={ZoomIn.delay(160 + i * 80).duration(420)}
              style={{ flexBasis: "48%", maxWidth: "48%" }}
            >
              <SpringButton
                onPress={() => router.push(a.href)}
                style={[styles.card, { borderColor: "#E5E7EB" }]}
                androidRippleColor="#E5E7EB"
              >
                <View style={[styles.iconBadge, { backgroundColor: a.color }]}>
                  <Ionicons name={a.icon} size={20} color="#fff" />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {a.label}
                </Text>
              </SpringButton>
            </Animated.View>
          ))}
        </View>

        {/* Сводка */}
        <Animated.Text
          entering={FadeInUp.delay(220).duration(600)}
          style={[styles.sectionTitle, { marginTop: 20 }]}
        >
          Сводка
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(260).duration(600)} style={styles.summaryCard}>
          <View style={{ gap: 4 }}>
            <Text style={styles.summaryTitle}>Сегодня</Text>
            <Text style={styles.summaryText}>Сканов QR: 128 • Новых задач: 5</Text>
          </View>
        </Animated.View>

        {/* нижний отступ под таб-бар */}
        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** ---------- Компоненты ---------- */

/** Красивый хиро-блок с увеличенным логотипом и анимацией */
function HeroFancy({
  title,
  subtitle,
  onPressCTA,
}: {
  title: string;
  subtitle: string;
  onPressCTA: () => void;
}) {
  // «покачивание» логотипа
  const float = useSharedValue(0);
  React.useEffect(() => {
    float.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => {
    // -6..+6 по Y и небольшая «дыхалка» по scale
    const translateY = (float.value - 0.5) * 12;
    const scale = 1 + (float.value - 0.5) * 0.04;
    return { transform: [{ translateY }, { scale }] };
  });

  return (
    <Animated.View entering={FadeInDown.duration(700)} style={fancy.heroWrap}>
      {/* Декоративные градиентные «блики» */}
      <LinearGradient
        colors={["#C7D2FE", "#E9D5FF"]}
        start={{ x: 0.15, y: 0.1 }}
        end={{ x: 0.85, y: 1 }}
        style={fancy.bg}
      />
      <LinearGradient
        colors={["#FFFFFF60", "#FFFFFF10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={fancy.gloss}
      />

      {/* Контент */}
      <View style={fancy.inner}>
        <Animated.View style={[fancy.logoBadge, logoStyle]}>
          <Image
            source={require("@/assets/images/icon.png")}
            style={fancy.logo}
            contentFit="contain"
            transition={150}
          />
        </Animated.View>

        <Text style={fancy.title}>{title}</Text>
        <Text style={fancy.subtitle}>{subtitle}</Text>

        <SpringButton
          onPress={onPressCTA}
          style={fancy.ctaBtn}
          androidRippleColor="#5B21B6"
        >
          <Ionicons name="rocket-outline" size={18} color="#fff" />
          <Text style={fancy.ctaText}>Перейти к сервисам</Text>
        </SpringButton>
      </View>
    </Animated.View>
  );
}

/** Пружинящая кнопка без «двойного контейнера» */
function SpringButton({
  onPress,
  children,
  style,
  androidRippleColor,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  androidRippleColor?: string | null;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const {
    margin,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    marginHorizontal,
    marginVertical,
    borderRadius,
    ...innerRest
  } = flat || {};

  const outerStyle: ViewStyle = {
    margin,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    marginHorizontal,
    marginVertical,
    borderRadius,
    overflow: "hidden",
  };

  return (
    <Animated.View style={[outerStyle, aStyle]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => (scale.value = withSpring(0.97, { damping: 18, stiffness: 300 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 300 }))}
        android_ripple={
          Platform.OS === "android" && androidRippleColor
            ? { color: androidRippleColor }
            : undefined
        }
        style={({ pressed }) => [
          innerRest,
          pressed && Platform.OS === "ios" ? { opacity: 0.9 } : null,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** ---------- Стили ---------- */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 24,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  // Плитки действий (иконка сверху, подпись снизу)
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },

  // Сводка
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryTitle: { fontWeight: "700", color: "#111827" },
  summaryText: { color: "#374151" },
});

const fancy = StyleSheet.create({
  heroWrap: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E0E7FF",
    // лёгкая тень
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  gloss: {
    position: "absolute",
    left: -40,
    right: -40,
    top: -20,
    height: 120,
    borderRadius: 120,
    opacity: 0.55,
  },
  inner: {
    padding: 18,
  },

  logoBadge: {
    alignSelf: "flex-start",
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    // тонкий «стекло»-эффект
    borderWidth: 1,
    borderColor: "#EEF2FF",
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 30,
  },
  subtitle: {
    marginTop: 8,
    color: "#334155",
  },

  ctaBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#6366F1", // indigo-500
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
