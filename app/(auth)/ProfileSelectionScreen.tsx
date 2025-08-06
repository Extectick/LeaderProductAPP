// ProfileSelectionScreen.tsx
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useProfile } from '@/context/ProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import type {
  CreateClientProfileDto,
  CreateEmployeeProfileDto,
  CreateSupplierProfileDto,
  Department
} from '@/utils/userService';
import { createProfile, getDepartments } from '@/utils/userService';
import { RelativePathString, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { TextInputMask } from 'react-native-masked-text';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const { selectProfileType, loading } = useProfile();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedType, setSelectedType] = useState<'CLIENT' | 'SUPPLIER' | 'EMPLOYEE' | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '', 
    phone: '',
    departmentId: 0,
    patronymic: '',
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState<{label: string, value: number}[]>([]);
  const [apiMessage, setApiMessage] = useState<{text: string, isError: boolean} | null>(null);

  useEffect(() => {
  let isMounted = true;

  const fetchDepartments = async () => {
    try {
      const deps = await getDepartments();
      if (isMounted) {
        console.log('Получены отделы');
        setDepartments(deps);
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


  const onChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const inputBackgroundColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  const handleProfileSubmit = async () => {
    if (selectedType === 'CLIENT' && !form.firstName.trim()) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }

    if (selectedType === 'SUPPLIER' && !form.firstName.trim()) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }

    if (selectedType === 'EMPLOYEE') {
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
    }

    if (form.phone && form.phone.length < 18) {
      Alert.alert('Ошибка', 'Неверный номер телефона');
      return;
    }

    try {
      let profileData: CreateClientProfileDto | CreateSupplierProfileDto | CreateEmployeeProfileDto;

      switch(selectedType) {
        case 'CLIENT':
          profileData = {
            phone: form.phone,
            status: 'ACTIVE',
            user: {
              firstName: form.firstName,
              lastName: form.lastName,
              middleName: form.patronymic
            }
          };
          break;
        case 'SUPPLIER':
          profileData = {
            phone: form.phone,
            status: 'ACTIVE',
            user: {
              firstName: form.firstName,
              lastName: form.lastName,
              middleName: form.patronymic
            }
          };
          break;
        case 'EMPLOYEE':
          profileData = {
            phone: form.phone,
            status: 'ACTIVE',
            departmentId: form.departmentId,
            user: {
              firstName: form.firstName,
              lastName: form.lastName,
              middleName: form.patronymic
            }
          };
          break;
        default:
          throw new Error('Неизвестный тип профиля');
      }
      console.log(profileData)
      await createProfile(selectedType, profileData);
      setApiMessage({text: 'Профиль успешно создан', isError: false});
      setTimeout(() => router.push('/home' as RelativePathString), 1500);
    } catch (error) {
      let message = 'Не удалось создать профиль';
      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message);
          message = errorData.message || error.message;
        } catch {
          message = error.message;
        }
      }
      setApiMessage({text: message, isError: true});
    }
  };

  const animateForm = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const renderForm = () => {
    if (!selectedType) return null;
    animateForm();

    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        {selectedType === 'EMPLOYEE' && (
          <>
            <Text style={styles.label}>Фамилия*</Text>
            <TextInput style={styles.input} value={form.lastName} onChangeText={(text) => onChange('lastName', text)} />
            <Text style={styles.label}>Имя*</Text>
            <TextInput style={styles.input} value={form.firstName} onChangeText={(text) => onChange('firstName', text)} />
            <Text style={styles.label}>Отчество <Text style={{ color: secondaryTextColor }}>(необязательно)</Text></Text>
            <TextInput style={styles.input} value={form.patronymic} onChangeText={(text) => onChange('patronymic', text)} />
            <Text style={styles.label}>Телефон*</Text>
            <TextInputMask
              type={'custom'}
              options={{
                mask: '+7 (999) 999-99-99',
              }}
              value={form.phone}
              onChangeText={(text) => onChange('phone', text)}
              style={styles.input}
              keyboardType="phone-pad"
              placeholder="+7 (___) ___-__-__"
            />
            <Text style={styles.label}>Отдел*</Text>
            <View style={{
              zIndex: 2000,
              elevation: Platform.OS === 'android' ? 10 : 0,
            }}>
              <DropDownPicker
                open={dropdownOpen}
                value={form.departmentId}
                items={dropdownItems}
                setOpen={setDropdownOpen}
                setValue={(cb) => onChange('departmentId', cb(null) ? Number(cb(null)) : 0)}
                setItems={setDropdownItems}
                containerStyle={{ width: '100%' }}
                dropDownContainerStyle={{ width: '100%' }}
                style={{
                  borderColor: inputBorderColor,
                  backgroundColor: inputBackgroundColor,
                }}
                placeholder="Выберите отдел"
                listMode="SCROLLVIEW"
              />
            </View>
          </>
        )}

        {selectedType === 'SUPPLIER' && (
          <>
            <Text style={styles.label}>Имя*</Text>
            <TextInput
              style={styles.input}
              value={form.firstName}
              onChangeText={(text) => onChange('firstName', text)}
              placeholder="Введите имя"
            />
            <Text style={styles.label}>Телефон <Text style={{ color: secondaryTextColor }}>(необязательно)</Text></Text>
            <TextInputMask
              type={'custom'}
              options={{
                mask: '+7 (999) 999-99-99',
              }}
              value={form.phone}
              onChangeText={(text) => onChange('phone', text)}
              style={styles.input}
              keyboardType="phone-pad"
              placeholder="+7 (___) ___-__-__"
            />
          </>
        )}

        {selectedType === 'CLIENT' && (
          <>
            <Text style={styles.label}>Имя*</Text>
            <TextInput style={styles.input} value={form.firstName} onChangeText={(text) => onChange('firstName', text)} />
          </>
        )}

        <TouchableOpacity style={[styles.button, { backgroundColor: buttonColor }]} onPress={handleProfileSubmit}>
          <Text style={[styles.buttonText, { color: buttonTextColor }]}>Продолжить</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.fullScreen, { backgroundColor }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.centeredContainer}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={100}
      >
        <ThemeSwitcher />
        {!selectedType ? (
          <View style={styles.centeredBlock}>
            <Text style={[styles.title, { color: textColor }]}>Выберите профиль</Text>
            {['CLIENT', 'SUPPLIER', 'EMPLOYEE'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.button, 
                  { 
                    backgroundColor: ['CLIENT', 'SUPPLIER'].includes(type) ? '#cccccc' : buttonColor,
                    opacity: ['CLIENT', 'SUPPLIER'].includes(type) ? 0.6 : 1
                  }
                ]}
                onPress={() => {
                  if (!['CLIENT', 'SUPPLIER'].includes(type)) {
                    setSelectedType(type as any);
                  }
                }}
                disabled={['CLIENT', 'SUPPLIER'].includes(type)}
              >
                <Text style={[styles.buttonText, { color: buttonTextColor }]}>{{
                  CLIENT: 'Клиент (временно недоступен)',
                  SUPPLIER: 'Поставщик (временно недоступен)',
                  EMPLOYEE: 'Сотрудник',
                }[type]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.centeredBlock}>
        <TouchableOpacity onPress={() => setSelectedType(null)} style={{ marginBottom: 12 }}>
          <Text style={{ color: textColor }}>{'← Назад к выбору'}</Text>
        </TouchableOpacity>
        
        {apiMessage && (
          <Text style={[
            styles.message, 
            {color: apiMessage.isError ? 'red' : 'green'}
          ]}>
            {apiMessage.text}
          </Text>
        )}
        
        {renderForm()}
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  centeredContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredBlock: {
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  label: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 16,
    fontWeight: '500',
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  button: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  message: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 16,
  },
});
