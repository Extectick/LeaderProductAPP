// app/(auth)/ProfileSelectionScreen.tsx
import BrandedBackground from '@/components/BrandedBackground';
import ShimmerButton from '@/components/ShimmerButton';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { CreateEmployeeProfileDto, ProfileStatus, ProfileType } from '@/types/userTypes';
import { createProfile, Department, getDepartments, getProfile, setCurrentProfileType } from '@/utils/userService';
import { getProfileGate, resolveActiveProfile } from '@/utils/profileGate';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RelativePathString, useRouter } from 'expo-router';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { mask, MaskedTextInput } from 'react-native-mask-text';
import CustomAlert from '@/components/CustomAlert';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');
  const { setProfile, profile, signOut } = auth;

  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as ThemeKey] || gradientColors.light;
  const buttonGradient: [string, string] = [grad[0], grad[1]];
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    departmentId: 0,
    patronymic: '',
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [dropdownItems, setDropdownItems] = useState<{ label: string, value: number }[]>([]);
  const [apiMessage, setApiMessage] = useState<{ text: string, isError: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [departmentModalVisible, setDepartmentModalVisible] = useState(false);
  const [hoveredDepartmentId, setHoveredDepartmentId] = useState<number | null>(null);
  const [modalFade] = useState(new Animated.Value(0));
  const [depsLoaded, setDepsLoaded] = useState(false);
  const skeletonPulse = useMemo(() => new Animated.Value(0.6), []);

  const PHONE_MASK = '+7 (999) 999-99-99';
  const activeInfo = resolveActiveProfile(profile);

  const profileCards = useMemo(() => {
    return [
      {
        type: 'CLIENT' as ProfileType,
        title: 'Клиент',
        exists: !!profile?.clientProfile,
        status: profile?.clientProfile?.status ?? null,
        subtitle: 'Профиль клиента',
      },
      {
        type: 'SUPPLIER' as ProfileType,
        title: 'Поставщик',
        exists: !!profile?.supplierProfile,
        status: profile?.supplierProfile?.status ?? null,
        subtitle: 'Профиль поставщика',
      },
      {
        type: 'EMPLOYEE' as ProfileType,
        title: 'Сотрудник',
        exists: !!profile?.employeeProfile,
        status: profile?.employeeProfile?.status ?? null,
        subtitle: profile?.employeeProfile?.department?.name
          ? `Отдел: ${profile?.employeeProfile?.department?.name}`
          : 'Без отдела',
      },
    ];
  }, [profile]);

  useEffect(() => {
    let isMounted = true;

    const fetchDepartments = async () => {
      try {
        const deps: Department[] = await getDepartments();
        if (isMounted) {
          setDropdownItems(deps.map(dep => ({ label: dep.name, value: dep.id })));
        }
      } catch (error) {
        console.error('Ошибка загрузки отделов:', error);
      } finally {
        if (isMounted) setDepsLoaded(true);
      }
    };

    fetchDepartments();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ensureProfile = async () => {
      try {
        const freshProfile = await getProfile();
        if (freshProfile) {
          await setProfile(freshProfile);
        }
      } catch (error) {
        console.warn('Не удалось получить профиль сотрудника', error);
      } finally {
        if (!cancelled) setCheckingProfile(false);
      }
    };
    ensureProfile();
    return () => {
      cancelled = true;
    };
  }, [profile, router, setProfile]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(skeletonPulse, { toValue: 0.6, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [skeletonPulse]);

  const onChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProfileSubmit = async () => {
    if (!form.lastName.trim()) {
      Alert.alert('Ошибка', 'Введите фамилию');
      return;
    }
    if (!form.firstName.trim()) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }
    if (!form.departmentId) {
      Alert.alert('Ошибка', 'Выберите отдел');
      return;
    }

    const phoneDigits = form.phone.trim();
    const phoneValid = phoneDigits.length === 0 || (phoneDigits.length === 11 && phoneDigits.startsWith('7'));
    if (!phoneValid) {
      Alert.alert('Ошибка', 'Неверный номер телефона');
      return;
    }

    setSubmitting(true);
    setApiMessage(null);

    try {
      const profileData: CreateEmployeeProfileDto = {
        phone: phoneDigits ? mask(phoneDigits, PHONE_MASK) : null,
        departmentId: form.departmentId,
        user: {
          firstName: form.firstName,
          lastName: form.lastName,
          middleName: form.patronymic
        }
      };

      const createdProfile = await createProfile('EMPLOYEE', profileData);
      if (!createdProfile) {
        throw new Error('Не удалось получить данные профиля после создания');
      }

      await setProfile(createdProfile);
      setApiMessage({ text: 'Профиль сотрудника успешно создан', isError: false });
      const gate = getProfileGate(createdProfile);
      if (gate === 'active') {
        router.replace('/home' as RelativePathString);
      } else if (gate === 'pending') {
        router.replace('/(auth)/ProfilePendingScreen' as RelativePathString);
      } else if (gate === 'blocked') {
        router.replace('/(auth)/ProfileBlockedScreen' as RelativePathString);
      }
    } catch (error) {
      const fallbackMessage = 'Не удалось создать профиль';
      let message = fallbackMessage;

      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message);
          message = errorData.message || error.message || fallbackMessage;
        } catch {
          message = error.message || fallbackMessage;
        }
      }

      if (message.toLowerCase().includes('существует')) {
        try {
          const fresh = await getProfile();
          if (fresh) {
            await setProfile(fresh);
            const gate = getProfileGate(fresh);
            if (gate === 'active') {
              router.replace('/home' as RelativePathString);
              return;
            }
            if (gate === 'pending') {
              router.replace('/(auth)/ProfilePendingScreen' as RelativePathString);
              return;
            }
            if (gate === 'blocked') {
              router.replace('/(auth)/ProfileBlockedScreen' as RelativePathString);
              return;
            }
          }
        } catch (e) {
          console.warn('Не удалось обновить профиль после конфликта', e);
        }
      }

      setApiMessage({ text: message, isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const statusMeta = (status: ProfileStatus | null) => {
    if (status === 'ACTIVE') return { label: 'Активен', color: colors.success, bg: `${colors.success}1A` };
    if (status === 'BLOCKED') return { label: 'Заблокирован', color: colors.error, bg: `${colors.error}1A` };
    if (status === 'PENDING') return { label: 'На проверке', color: colors.warning, bg: `${colors.warning}1A` };
    return { label: 'Не задан', color: colors.secondaryText, bg: `${colors.secondaryText}1A` };
  };

  const handleSelectProfile = async (type: ProfileType) => {
    setSwitchingProfile(true);
    setApiMessage(null);
    try {
      const updated = await setCurrentProfileType(type);
      if (updated) {
        await setProfile(updated);
        const gate = getProfileGate(updated);
        if (gate === 'active') {
          router.replace('/home' as RelativePathString);
        } else if (gate === 'pending') {
          router.replace('/(auth)/ProfilePendingScreen' as RelativePathString);
        } else if (gate === 'blocked') {
          router.replace('/(auth)/ProfileBlockedScreen' as RelativePathString);
        }
      }
    } catch (error) {
      const fallbackMessage = 'Не удалось выбрать профиль';
      let message = fallbackMessage;
      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message);
          message = errorData.message || error.message || fallbackMessage;
        } catch {
          message = error.message || fallbackMessage;
        }
      }
      setApiMessage({ text: message, isError: true });
    } finally {
      setSwitchingProfile(false);
    }
  };

  const handleDepartmentChange = (value: number | null) => {
    onChange('departmentId', value ?? 0);
    closeDepartmentModal();
  };

  const openDepartmentModal = () => {
    setHoveredDepartmentId(null);
    setDepartmentModalVisible(true);
    modalFade.setValue(0);
    Animated.timing(modalFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  const closeDepartmentModal = () => {
    Animated.timing(modalFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setDepartmentModalVisible(false);
      setHoveredDepartmentId(null);
    });
  };

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/AuthScreen' as RelativePathString);
  };

  const openConfirm = () => setConfirmVisible(true);

  const cardAnimatedStyle = {
    opacity: fadeAnim,
    transform: [
      {
        translateY: fadeAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };
  const isInitialLoading = checkingProfile || !depsLoaded;

  return (
    <BrandedBackground speed={1.3}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top + 12}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.headerRow}>
              <View style={styles.headerRowInner}>
                <TouchableOpacity
                  onPress={openConfirm}
                  style={[styles.logoutPill, { borderColor: colors.error }]}
                  activeOpacity={0.85}
                >
                    <MaterialCommunityIcons name="logout-variant" size={18} color={colors.error} />
                    <Text style={[styles.logoutText, { color: colors.error }]}>Выйти</Text>
                  </TouchableOpacity>
              </View>
            </View>

            <Animated.View style={[styles.card, cardAnimatedStyle]}>
              {isInitialLoading ? (
                <Animated.View style={{ opacity: skeletonPulse }}>
                  <View style={[styles.skeletonBlock, styles.skeletonTitle]} />
                  <View style={[styles.skeletonBlock, styles.skeletonSubtitle]} />
                  <View style={styles.skeletonGroup}>
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <View key={idx} style={{ width: '100%' }}>
                        <View style={[styles.skeletonBlock, styles.skeletonLabel]} />
                        <View style={[styles.skeletonBlock, styles.skeletonInput]} />
                      </View>
                    ))}
                  </View>
                  <View style={[styles.skeletonBlock, styles.skeletonButton]} />
                </Animated.View>
              ) : (
                <>
                  <Text style={styles.title}>Создание профиля сотрудника</Text>
                  <Text style={styles.subtitle}>
                    Заполните данные, чтобы продолжить работу в приложении
                  </Text>

                  <View style={styles.profileSection}>
                    <Text style={styles.sectionTitle}>Ваши профили</Text>
                    {profileCards.filter((item) => item.exists).length ? (
                      <View style={styles.profileList}>
                        {profileCards
                          .filter((item) => item.exists)
                          .map((item) => {
                            const isActive = activeInfo.type === item.type;
                            const meta = statusMeta(item.status);
                            return (
                              <View
                                key={item.type}
                                style={[
                                  styles.profileCard,
                                  isActive && styles.profileCardActive,
                                  { borderColor: isActive ? colors.tint : colors.inputBorder },
                                ]}
                              >
                                <View style={styles.profileCardRow}>
                                  <Text style={styles.profileCardTitle}>{item.title}</Text>
                                  <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.color }]}>
                                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                                  </View>
                                </View>
                                <Text style={styles.profileCardSubtitle}>{item.subtitle}</Text>
                                <TouchableOpacity
                                  style={[
                                    styles.profileAction,
                                    isActive && styles.profileActionActive,
                                    (switchingProfile || isActive) && styles.profileActionDisabled,
                                  ]}
                                  onPress={() => handleSelectProfile(item.type)}
                                  disabled={switchingProfile || isActive}
                                  activeOpacity={0.8}
                                >
                                  <Text
                                    style={[
                                      styles.profileActionText,
                                      isActive && { color: colors.tint },
                                      (switchingProfile || isActive) && { color: colors.secondaryText },
                                    ]}
                                  >
                                    {isActive ? 'Активный' : switchingProfile ? 'Выбираем...' : 'Выбрать профиль'}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                      </View>
                    ) : (
                      <Text style={styles.profileEmptyText}>Профили ещё не созданы</Text>
                    )}
                  </View>

                  {apiMessage && (
                    <Text
                      style={[
                        styles.message,
                        { color: apiMessage.isError ? colors.error : colors.success },
                      ]}
                    >
                      {apiMessage.text}
                    </Text>
                  )}

                  <View style={styles.form}>
                    <View style={styles.field}>
                      <Text style={styles.label}>Фамилия*</Text>
                      <TextInput
                        style={styles.input}
                        value={form.lastName}
                        onChangeText={(text) => onChange('lastName', text)}
                        placeholder="Иванов"
                        placeholderTextColor={colors.placeholder}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Имя*</Text>
                      <TextInput
                        style={styles.input}
                        value={form.firstName}
                        onChangeText={(text) => onChange('firstName', text)}
                        placeholder="Иван"
                        placeholderTextColor={colors.placeholder}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>
                        Отчество <Text style={{ color: colors.secondaryText }}>(необязательно)</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={form.patronymic}
                        onChangeText={(text) => onChange('patronymic', text)}
                        placeholder="Иванович"
                        placeholderTextColor={colors.placeholder}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Телефон*</Text>
                      {isWeb ? (
                        <TextInput
                          value={form.phone ? mask(form.phone, PHONE_MASK) : ''}
                          onChangeText={(text) =>
                            setForm((prev) => {
                              const next = text.replace(/\D/g, '');
                              return prev.phone === next ? prev : { ...prev, phone: next };
                            })
                          }
                          style={styles.input}
                          keyboardType="phone-pad"
                          placeholder="+7 (___) ___-__-__"
                          placeholderTextColor={colors.placeholder}
                          autoCorrect={false}
                          autoComplete="tel"
                          // @ts-ignore
                          inputMode="tel"
                        />
                      ) : (
                        <MaskedTextInput
                          value={form.phone}
                          onChangeText={(_, raw) =>
                            setForm((prev) => {
                              const next = raw ?? '';
                              return prev.phone === next ? prev : { ...prev, phone: next };
                            })
                          }
                          mask={PHONE_MASK}
                          style={styles.input}
                          keyboardType="phone-pad"
                          placeholder="+7 (___) ___-__-__"
                          placeholderTextColor={colors.placeholder}
                          autoCorrect={false}
                        />
                      )}
                    </View>

                    <View style={[styles.field]}>
                      <Text style={styles.label}>Отдел*</Text>
                      <TouchableOpacity
                        style={styles.selector}
                        onPress={openDepartmentModal}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.selectorText,
                            { color: form.departmentId ? colors.text : colors.placeholder },
                          ]}
                        >
                          {form.departmentId
                            ? dropdownItems.find((i) => i.value === form.departmentId)?.label || 'Отдел'
                            : 'Выберите отдел'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.buttonWrap}>
                    <ShimmerButton
                      title={submitting ? 'Сохранение...' : 'Продолжить'}
                      onPress={handleProfileSubmit}
                      loading={submitting}
                      haptics
                      gradientColors={buttonGradient}
                    />
                  </View>
                </>
              )}
            </Animated.View>
          </ScrollView>

          <Modal
            visible={departmentModalVisible}
            animationType="none"
            transparent
            onRequestClose={closeDepartmentModal}
          >
            <Animated.View style={[styles.modalOverlay, { opacity: modalFade }]}>
              <Pressable style={styles.modalOverlayPress} onPress={closeDepartmentModal} />
            </Animated.View>
            <View style={styles.modalCenter} pointerEvents="box-none">
              <Pressable style={[styles.modalContent, { backgroundColor: colors.cardBackground }]} onPress={() => {}}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Выберите отдел</Text>
                  <TouchableOpacity onPress={closeDepartmentModal} style={styles.modalCloseIcon} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="close" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={{ maxHeight: Math.min(420, Math.max(260, winH * 0.55)) }}
                  contentContainerStyle={styles.modalList}
                >
                  {dropdownItems.map((item) => {
                    const selected = form.departmentId === item.value;
                    const hovered = hoveredDepartmentId === item.value;
                    return (
                    <Pressable
                      key={item.value}
                      style={[
                        styles.modalItem,
                        selected && styles.modalItemSelected,
                        hovered && styles.modalItemHover,
                        selected && hovered && styles.modalItemSelectedHover
                      ]}
                      onPress={() => handleDepartmentChange(item.value)}
                      onHoverIn={Platform.OS === 'web' ? () => setHoveredDepartmentId(item.value) : undefined}
                      onHoverOut={Platform.OS === 'web' ? () => setHoveredDepartmentId(null) : undefined}
                    >
                      <View style={styles.modalItemRow}>
                        <Text
                          style={[
                            styles.modalItemText,
                            selected && { color: colors.tint, fontWeight: '800' },
                          ]}
                        >
                          {item.label}
                        </Text>
                        {selected && (
                          <MaterialCommunityIcons name="check-circle" size={18} color={colors.tint} />
                        )}
                      </View>
                    </Pressable>
                  )})}
                  {!dropdownItems.length && (
                    <Text style={[styles.modalEmpty, { color: colors.secondaryText }]}>
                      Нет доступных отделов
                    </Text>
                  )}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.modalClose, { borderColor: colors.inputBorder }]}
                  onPress={closeDepartmentModal}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalCloseText, { color: colors.text }]}>Закрыть</Text>
                </TouchableOpacity>
              </Pressable>
            </View>
          </Modal>

          <CustomAlert
            visible={confirmVisible}
            title="Выйти из аккаунта?"
            message="Вы действительно хотите выйти из аккаунта?"
            cancelText="Отмена"
            confirmText="Выйти"
            onCancel={() => setConfirmVisible(false)}
            onConfirm={() => {
              setConfirmVisible(false);
              void handleLogout();
            }}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </BrandedBackground>
  );
}

const getStyles = (colors: {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  inputBackground: string;
  inputBorder: string;
  button: string;
  buttonText: string;
  buttonDisabled: string;
  secondaryText: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  disabledText: string;
  disabledBackground: string;
  cardBackground: string;
  placeholder: string;
  shadow: string;
  expired: string;
  card: string;
  border: string;
}) =>
  StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    headerRow: {
      width: '100%',
      maxWidth: 500,
      alignSelf: 'center',
      alignItems: 'flex-end',
      marginBottom: 12,
    },
    headerRowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoutPill: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      backgroundColor: `${colors.error}10`,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        },
        android: { elevation: 4 },
      }),
    },
    logoutText: {
      fontSize: 14,
      fontWeight: '800',
    },
    card: {
      width: '100%',
      maxWidth: 500,
      backgroundColor: Platform.select({
        web: 'rgba(255,255,255,0.85)',
        default: colors.cardBackground,
      }),
      borderRadius: 20,
      padding: 20,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
        },
        android: { elevation: 8 },
        web: { backdropFilter: 'blur(10px)', boxShadow: '0px 12px 24px rgba(0,0,0,0.15)' },
      }),
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    subtitle: {
      color: colors.secondaryText,
      textAlign: 'center',
      marginBottom: 12,
      fontSize: 14,
    },
    profileSection: {
      width: '100%',
      marginBottom: 12,
      gap: 8,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    profileList: {
      width: '100%',
      gap: 10,
    },
    profileCard: {
      width: '100%',
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      backgroundColor: colors.inputBackground,
    },
    profileCardActive: {
      backgroundColor: `${colors.tint}12`,
    },
    profileCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    profileCardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    profileCardSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: colors.secondaryText,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '700',
    },
    profileAction: {
      marginTop: 10,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      alignItems: 'center',
      backgroundColor: colors.cardBackground,
    },
    profileActionActive: {
      borderColor: colors.tint,
      backgroundColor: `${colors.tint}12`,
    },
    profileActionDisabled: {
      opacity: 0.7,
    },
    profileActionText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    profileEmptyText: {
      fontSize: 13,
      color: colors.secondaryText,
    },
    form: {
      width: '100%',
      marginTop: 6,
      gap: 8,
    },
    field: {
      width: '100%',
    },
    label: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 6,
    },
    input: {
      width: '100%',
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    buttonWrap: {
      marginTop: 16,
    },
    secondary: {
      fontSize: 14,
    },
    message: {
      marginBottom: 10,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
    },
    selector: {
      width: '100%',
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      justifyContent: 'center',
    },
    selectorText: {
      fontSize: 16,
      color: colors.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalOverlayPress: {
      ...StyleSheet.absoluteFillObject,
    },
    modalCenter: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 18,
      padding: 18,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        },
        android: { elevation: 8 },
      }),
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    modalCloseIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
    },
    modalList: {
      paddingVertical: 4,
      gap: 8,
    },
    modalItem: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
    },
    modalItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    modalItemSelected: {
      backgroundColor: `${colors.tint}12`,
      borderColor: colors.tint,
    },
    modalItemHover: {
      backgroundColor: `${colors.tint}0D`,
      borderColor: `${colors.tint}55`,
    },
    modalItemSelectedHover: {
      backgroundColor: `${colors.tint}22`,
    },
    modalItemText: {
      fontSize: 16,
      color: colors.text,
    },
    modalEmpty: {
      textAlign: 'center',
      fontSize: 14,
      paddingVertical: 16,
    },
    modalClose: {
      marginTop: 12,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    modalCloseText: {
      fontSize: 16,
      fontWeight: '700',
    },
    skeletonGroup: {
      width: '100%',
      gap: 10,
      marginTop: 6,
    },
    skeletonBlock: {
      backgroundColor: colors.inputBorder,
      borderRadius: 12,
    },
    skeletonTitle: {
      height: 26,
      width: '70%',
      alignSelf: 'center',
      marginBottom: 10,
    },
    skeletonSubtitle: {
      height: 12,
      width: '86%',
      alignSelf: 'center',
      marginBottom: 18,
    },
    skeletonLabel: {
      height: 10,
      width: '35%',
      marginBottom: 6,
    },
    skeletonInput: {
      height: 46,
      width: '100%',
      borderRadius: 14,
    },
    skeletonButton: {
      height: 48,
      width: '100%',
      borderRadius: 16,
      marginTop: 16,
    },
  });
