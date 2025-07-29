// ProfileSelectionScreen.tsx
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useProfile } from '@/context/ProfileContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Department } from '@/types';
import { getDepartments } from '@/utils/authService';
import { useRouter } from 'expo-router';
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
    fullName: '',
    phone: '',
    departmentId: '',
    surname: '',
    patronymic: '',
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownItems, setDropdownItems] = useState<{label: string, value: string}[]>([]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const deps = await getDepartments();
        setDepartments(deps);
        setDropdownItems(deps.map(dep => ({ label: dep.name, value: dep.id.toString() })));
      } catch (error) {
        console.error('Ошибка загрузки отделов:', error);
      }
    };

    fetchDepartments();
  }, []);

  const onChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const inputBackgroundColor = useThemeColor({}, 'inputBackground');
  const inputBorderColor = useThemeColor({}, 'inputBorder');
  const buttonColor = useThemeColor({}, 'button');
  const buttonTextColor = useThemeColor({}, 'buttonText');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  const handleProfileSubmit = () => {
    if (selectedType === 'CLIENT' && !form.fullName.trim()) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }

    if (selectedType === 'SUPPLIER' && !form.fullName.trim()) {
      Alert.alert('Ошибка', 'Введите имя');
      return;
    }

    if (selectedType === 'EMPLOYEE') {
      if (!form.surname.trim()) {
        Alert.alert('Ошибка', 'Введите фамилию');
        return;
      }
      if (!form.fullName.trim()) {
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

    console.log('✅ Профиль выбран:', selectedType);
    console.log('📦 Данные формы:', form);
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
            <TextInput style={styles.input} value={form.surname} onChangeText={(text) => onChange('surname', text)} />
            <Text style={styles.label}>Имя*</Text>
            <TextInput style={styles.input} value={form.fullName} onChangeText={(text) => onChange('fullName', text)} />
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
              // marginBottom: dropdownOpen ? 200 : 20,
            }}>
              <DropDownPicker
                open={dropdownOpen}
                value={form.departmentId}
                items={dropdownItems}
                setOpen={setDropdownOpen}
                setValue={(cb) => onChange('departmentId', cb(null))}
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
              value={form.fullName}
              onChangeText={(text) => onChange('fullName', text)}
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
            <TextInput style={styles.input} value={form.fullName} onChangeText={(text) => onChange('fullName', text)} />
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
                style={[styles.button, { backgroundColor: buttonColor }]}
                onPress={() => setSelectedType(type as any)}
              >
                <Text style={[styles.buttonText, { color: buttonTextColor }]}>{{
                  CLIENT: 'Клиент',
                  SUPPLIER: 'Поставщик',
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
});
