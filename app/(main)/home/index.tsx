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
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

const updates = [
  { title: "Новый трекинг", desc: "Отслеживайте перемещения сотрудников и точки на карте.", icon: "map-outline", color: "#2563EB" },
  { title: "Задачи и обращения", desc: "Быстрый доступ к актуальным задачам и переписке с клиентами.", icon: "chatbox-ellipses-outline", color: "#10B981" },
  { title: "Обновление каталога", desc: "Товары и цены синхронизированы, доступны свежие данные из 1С.", icon: "cloud-download-outline", color: "#F59E0B" },
];

const stats = [
  { label: "Открытых задач", value: "12" },
  { label: "Новых обращений", value: "7" },
  { label: "Сканов QR за сутки", value: "128" },
];

const links = [
  { label: "Сервисы", href: "/services" },
  { label: "Трекинг перемещений", href: "/services/tracking" },
  { label: "Обращения", href: "/services/appeals" },
  { label: "Профиль", href: "/profile" },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isWide = Platform.OS === "web" && width >= 960;

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 8,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 16, maxWidth: 1200, alignSelf: "center" }]}
        keyboardShouldPersistTaps="handled"
      >
        <HeroFancy
          title={"Добро пожаловать в\nЛидер Продукт"}
          subtitle="Работайте с сервисами, задачами и аналитикой — всё в одном месте."
          onPressCTA={() => router.push("/services")}
        />

        <View style={[styles.responsiveRow, { flexDirection: isWide ? "row" : "column" }]}>
          <Animated.View entering={FadeInUp.delay(120).duration(600)} style={[styles.column, isWide && { flex: 2 }]}>
            <Text style={styles.sectionTitle}>Что нового</Text>
            <View style={styles.card}>
              {updates.map((item, idx) => (
                <View key={item.title} style={[styles.updateItem, idx < updates.length - 1 && styles.updateDivider]}>
                  <View style={[styles.iconBadge, { backgroundColor: item.color }]}>
                    <Ionicons name={item.icon as any} size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.updateTitle}>{item.title}</Text>
                    <Text style={styles.updateText}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>

          <View style={isWide ? { width: 16 } : { height: 16 }} />

          <Animated.View entering={FadeInUp.delay(200).duration(600)} style={[styles.column, isWide && { flex: 1 }]}>
            <Text style={styles.sectionTitle}>Краткие показатели</Text>
            <View style={[styles.statsGrid, { flexDirection: isWide ? "column" : "row" }]}>
              {stats.map((item) => (
                <View key={item.label} style={styles.statCard}>
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Полезные ссылки</Text>
            <View style={styles.card}>
              {links.map((link) => (
                <SpringButton
                  key={link.label}
                  onPress={() => router.push(link.href)}
                  style={[styles.linkRow, { borderColor: "#E5E7EB" }]}
                  androidRippleColor="#E5E7EB"
                >
                  <Text style={styles.linkLabel}>{link.label}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#6B7280" />
                </SpringButton>
              ))}
            </View>
          </Animated.View>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroFancy({
  title,
  subtitle,
  onPressCTA,
}: {
  title: string;
  subtitle: string;
  onPressCTA: () => void;
}) {
  const float = useSharedValue(0);
  React.useEffect(() => {
    float.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => {
    const translateY = (float.value - 0.5) * 12;
    const scale = 1 + (float.value - 0.5) * 0.04;
    return { transform: [{ translateY }, { scale }] };
  });

  return (
    <Animated.View entering={FadeInDown.duration(700)} style={fancy.heroWrap}>
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

        <SpringButton onPress={onPressCTA} style={fancy.ctaBtn} androidRippleColor="#5B21B6">
          <Ionicons name="rocket-outline" size={18} color="#fff" />
          <Text style={fancy.ctaText}>Перейти к сервисам</Text>
        </SpringButton>
      </View>
    </Animated.View>
  );
}

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
          Platform.OS === "android" && androidRippleColor ? { color: androidRippleColor } : undefined
        }
        style={({ pressed }) => [innerRest, pressed && Platform.OS === "ios" ? { opacity: 0.9 } : null]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 24,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  responsiveRow: {
    width: "100%",
    gap: 8,
  },
  column: {
    flex: 1,
  },
  updateItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingVertical: 8,
  },
  updateDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  updateTitle: { fontWeight: "700", color: "#111827" },
  updateText: { color: "#4B5563" },
  statsGrid: {
    gap: 10,
    flexWrap: "wrap",
  },
  statCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 8,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  statLabel: { color: "#4B5563", marginTop: 4 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  linkLabel: { color: "#111827", fontWeight: "700" },
});

const fancy = StyleSheet.create({
  heroWrap: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E0E7FF",
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
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaText: { color: "#fff", fontWeight: "800" },
});
