// app/(auth)/ProfileSelectionScreen.tsx
import BrandedBackground from '@/components/BrandedBackground';
import ShimmerButton from '@/components/ShimmerButton';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { CreateEmployeeProfileDto } from '@/types/userTypes';
import { createProfile, Department, getDepartments, getProfile } from '@/utils/userService';
import { RelativePathString, useRouter } from 'expo-router';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaskedTextInput } from 'react-native-mask-text';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');
  const { setProfile, profile } = auth;

  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as ThemeKey] || gradientColors.light;
  const buttonGradient: [string, string] = [grad[0], grad[1]];
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

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
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [departmentModalVisible, setDepartmentModalVisible] = useState(false);

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
        if (profile?.employeeProfile) {
          router.replace('/home' as RelativePathString);
          return;
        }
        const freshProfile = await getProfile();
        if (freshProfile?.employeeProfile) {
          await setProfile(freshProfile);
          if (!cancelled) router.replace('/home' as RelativePathString);
          return;
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

    if (form.phone && form.phone.length < 18) {
      Alert.alert('Ошибка', 'Неверный номер телефона');
      return;
    }

    setSubmitting(true);
    setApiMessage(null);

    try {
      const profileData: CreateEmployeeProfileDto = {
        phone: form.phone,
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
      router.replace('/home' as RelativePathString);
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
          if (fresh?.employeeProfile) {
            await setProfile(fresh);
            router.replace('/home' as RelativePathString);
            return;
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

  const handleDepartmentChange = (value: number | null) => {
    onChange('departmentId', value ?? 0);
    setDepartmentModalVisible(false);
  };

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
              <ThemeSwitcher />
            </View>

            <Animated.View style={[styles.card, cardAnimatedStyle]}>
              <Text style={styles.title}>Создание профиля сотрудника</Text>
              <Text style={styles.subtitle}>
                Заполните данные, чтобы продолжить работу в приложении
              </Text>

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

              {checkingProfile && (
                <View style={styles.checkRow}>
                  <ActivityIndicator color={colors.tint} />
                  <Text style={[styles.secondary, { color: colors.secondaryText }]}>
                    Проверяем ваш профиль...
                  </Text>
                </View>
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
                  <MaskedTextInput
                    value={form.phone}
                    onChangeText={(masked) => onChange('phone', masked)}
                    mask={'+7 (999) 999-99-99'}
                    style={styles.input}
                    keyboardType="phone-pad"
                    placeholder="+7 (___) ___-__-__"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>

                <View style={[styles.field]}>
                  <Text style={styles.label}>Отдел*</Text>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() => setDepartmentModalVisible(true)}
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
            </Animated.View>
          </ScrollView>

          <Modal
            visible={departmentModalVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setDepartmentModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
                <Text style={styles.modalTitle}>Выберите отдел</Text>
                <ScrollView style={{ maxHeight: 400 }}>
                  {dropdownItems.map((item) => (
                    <TouchableOpacity
                      key={item.value}
                      style={styles.modalItem}
                      onPress={() => handleDepartmentChange(item.value)}
                    >
                      <Text
                        style={[
                          styles.modalItemText,
                          form.departmentId === item.value && { color: colors.tint, fontWeight: '800' },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {!dropdownItems.length && (
                    <Text style={[styles.modalItemText, { color: colors.secondaryText }]}>
                      Нет доступных отделов
                    </Text>
                  )}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.modalClose, { borderColor: colors.inputBorder }]}
                  onPress={() => setDepartmentModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalCloseText, { color: colors.text }]}>Закрыть</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
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
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      gap: 8,
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
    modalContent: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 16,
      padding: 16,
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
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    modalItem: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.inputBorder,
    },
    modalItemText: {
      fontSize: 16,
      color: colors.text,
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
  });
